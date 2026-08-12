/**
 * Worker のエントリポイント。
 *
 * - /api/* : JSON API（Zod 検証・Turnstile 検証・レート制限を経て Durable Object を呼ぶ）
 * - それ以外: React のビルド成果物（Static Assets）を返す
 */

import { AUTH_HEADER, RATE_LIMITS, SERVICE_NAME } from '../shared/constants';
import { ERROR_CODES, type ErrorCode } from '../shared/errors';
import type { PublicConfig } from '../shared/types';
import {
  createRoomRequestSchema,
  draftPickRequestSchema,
  formatIssues,
  idPathSchema,
  joinRoomRequestSchema,
  selectCandidateRequestSchema,
  startDraftRequestSchema,
  updateActivePlayersRequestSchema,
  updatePlayerRequestSchema,
  updateStatusRequestSchema,
} from '../shared/validation';
import { clientIpFrom, generateRoomId, ipIdentifier } from './crypto';
import { IS_DEV, type Env } from './env';
import { jsonError, jsonOk, readJsonBody, withSecurityHeaders } from './http';
import type { DoResult } from './room-do';
import { verifyTurnstile } from './turnstile';

export { RoomDurableObject } from './room-do';
export { RateLimitDurableObject } from './ratelimit-do';

/** DO の結果を HTTP レスポンスへ変換する */
function respond<T>(result: DoResult<T>, successStatus = 200): Response {
  if (result.ok) return jsonOk(result.data, successStatus);
  return jsonError(result.code, result.status, {
    message: result.message,
    details: result.details,
  });
}

function getToken(request: Request): string | null {
  const header = request.headers.get(AUTH_HEADER);
  if (!header) return null;
  const trimmed = header.trim();
  if (trimmed.length === 0 || trimmed.length > 512) return null;
  return trimmed;
}

/** Same Origin 前提。クロスオリジンからの状態変更を拒否する。 */
function isSameOrigin(request: Request, url: URL): boolean {
  const origin = request.headers.get('Origin');
  if (!origin) return true; // ブラウザ以外のクライアント（CLI 等）は Origin を送らない
  try {
    return new URL(origin).host === url.host;
  } catch {
    return false;
  }
}

/** 必須の秘密値が設定されているか確認する（未設定なら安全側に倒す） */
function checkConfig(env: Env): Response | null {
  const missing: string[] = [];
  if (!env.TOKEN_HMAC_SECRET) missing.push('TOKEN_HMAC_SECRET');
  if (!env.IP_HASH_SECRET) missing.push('IP_HASH_SECRET');
  if (missing.length === 0) return null;
  console.error(`missing required secrets: ${missing.join(', ')}`);
  return jsonError(ERROR_CODES.CONFIG_ERROR, 500);
}

async function enforceRateLimit(
  env: Env,
  request: Request,
  bucket: string,
  rule: { limit: number; windowMs: number },
): Promise<Response | null> {
  const secret = env.IP_HASH_SECRET;
  if (!secret) return jsonError(ERROR_CODES.CONFIG_ERROR, 500);
  // IP そのものは保存せず、短期間だけ有効な不可逆識別値へ変換する
  const identifier = await ipIdentifier(secret, clientIpFrom(request), Date.now());
  const stub = env.RATE_LIMIT.get(env.RATE_LIMIT.idFromName(identifier));
  const decision = await stub.check(bucket, rule.limit, rule.windowMs);
  if (decision.allowed) return null;
  return jsonError(ERROR_CODES.RATE_LIMITED, 429, {
    headers: { 'Retry-After': String(decision.retryAfterSeconds) },
  });
}

async function requireTurnstile(
  env: Env,
  request: Request,
  token: string,
): Promise<Response | null> {
  const result = await verifyTurnstile(env.TURNSTILE_SECRET_KEY, token, clientIpFrom(request));
  if (result.status === 'success') return null;
  if (result.status === 'misconfigured') {
    console.error('TURNSTILE_SECRET_KEY is not configured');
    return jsonError(ERROR_CODES.CONFIG_ERROR, 500);
  }
  // エラーコードは開発時の原因追跡用（秘密情報は含まない）
  console.warn(`turnstile verification failed: ${result.errorCodes.join(',')}`);
  return jsonError(ERROR_CODES.TURNSTILE_FAILED, 403);
}

function validationError(details: string[]): Response {
  return jsonError(ERROR_CODES.VALIDATION_ERROR, 400, {
    message: details[0] ?? undefined,
    details,
  });
}

function methodNotAllowed(allowed: string[]): Response {
  return jsonError(ERROR_CODES.METHOD_NOT_ALLOWED, 405, {
    headers: { Allow: allowed.join(', ') },
  });
}

function notFound(code: ErrorCode = ERROR_CODES.NOT_FOUND): Response {
  return jsonError(code, 404);
}

async function handleApi(request: Request, env: Env, url: URL): Promise<Response> {
  const segments = url.pathname.split('/').filter((segment) => segment.length > 0);
  // segments[0] === 'api'
  if (segments[1] === 'config') {
    if (request.method !== 'GET') return methodNotAllowed(['GET']);
    const config: PublicConfig = {
      serviceName: SERVICE_NAME,
      turnstileSiteKey: env.TURNSTILE_SITE_KEY,
    };
    return jsonOk(config);
  }

  if (segments[1] !== 'rooms') return notFound();

  const configError = checkConfig(env);
  if (configError) return configError;

  if (request.method !== 'GET' && !isSameOrigin(request, url)) {
    return jsonError(ERROR_CODES.FORBIDDEN, 403);
  }

  /* ---- POST /api/rooms ---- */
  if (segments.length === 2) {
    if (request.method !== 'POST') return methodNotAllowed(['POST']);
    const limited = await enforceRateLimit(env, request, 'create-room', RATE_LIMITS.createRoom);
    if (limited) return limited;

    const body = await readJsonBody(request);
    if (!body.ok) return body.response;
    const parsed = createRoomRequestSchema.safeParse(body.value);
    if (!parsed.success) return validationError(formatIssues(parsed.error));

    const turnstileError = await requireTurnstile(env, request, parsed.data.turnstileToken);
    if (turnstileError) return turnstileError;

    const roomId = generateRoomId();
    const stub = env.ROOM.get(env.ROOM.idFromName(roomId));
    const result = await stub.init(roomId, parsed.data.title);
    if (!result.ok) return respond(result);
    return jsonOk({ roomId, hostToken: result.data.hostToken, room: result.data.room }, 201);
  }

  const roomIdResult = idPathSchema.safeParse(segments[2]);
  if (!roomIdResult.success) return notFound(ERROR_CODES.ROOM_NOT_FOUND);
  const roomId = roomIdResult.data;
  const stub = env.ROOM.get(env.ROOM.idFromName(roomId));
  const token = getToken(request);

  /* ---- /api/rooms/:roomId ---- */
  if (segments.length === 3) {
    if (request.method === 'GET') {
      return respond(await stub.getState(token));
    }
    if (request.method === 'DELETE') {
      const limited = await enforceRateLimit(env, request, `mutate:${roomId}`, RATE_LIMITS.mutate);
      if (limited) return limited;
      return respond(await stub.deleteRoom(token));
    }
    return methodNotAllowed(['GET', 'DELETE']);
  }

  const section = segments[3];

  /* ---- WebSocket ---- */
  if (section === 'ws' && segments.length === 4) {
    if (request.method !== 'GET') return methodNotAllowed(['GET']);
    if (request.headers.get('Upgrade')?.toLowerCase() !== 'websocket') {
      return jsonError(ERROR_CODES.BAD_REQUEST, 426, {
        message: 'WebSocket 接続としてリクエストしてください。',
      });
    }
    // Origin を厳密に確認する（WebSocket には同一オリジンポリシーが適用されないため）
    if (!isSameOrigin(request, url)) return jsonError(ERROR_CODES.FORBIDDEN, 403);
    return stub.fetch(new Request('https://room.internal/ws', request));
  }

  /* ---- ドラフトの指名 ---- */
  if (section === 'draft' && segments.length === 5 && segments[4] === 'picks') {
    if (request.method !== 'POST') return methodNotAllowed(['POST']);
    const limited = await enforceRateLimit(env, request, `mutate:${roomId}`, RATE_LIMITS.mutate);
    if (limited) return limited;
    const body = await readJsonBody(request);
    if (!body.ok) return body.response;
    const parsed = draftPickRequestSchema.safeParse(body.value);
    if (!parsed.success) return validationError(formatIssues(parsed.error));
    return respond(await stub.draftPick(token, parsed.data));
  }

  /* ---- /api/rooms/:roomId/players ---- */
  if (section === 'players') {
    if (segments.length === 4) {
      if (request.method !== 'POST') return methodNotAllowed(['POST']);
      const limited = await enforceRateLimit(env, request, `join:${roomId}`, RATE_LIMITS.joinRoom);
      if (limited) return limited;

      const body = await readJsonBody(request);
      if (!body.ok) return body.response;
      const parsed = joinRoomRequestSchema.safeParse(body.value);
      if (!parsed.success) return validationError(formatIssues(parsed.error));

      const turnstileError = await requireTurnstile(env, request, parsed.data.turnstileToken);
      if (turnstileError) return turnstileError;

      return respond(await stub.addPlayer(parsed.data.player), 201);
    }

    if (segments.length === 5) {
      const playerIdResult = idPathSchema.safeParse(segments[4]);
      if (!playerIdResult.success) return notFound(ERROR_CODES.PLAYER_NOT_FOUND);
      const playerId = playerIdResult.data;

      const limited = await enforceRateLimit(env, request, `mutate:${roomId}`, RATE_LIMITS.mutate);
      if (limited) return limited;

      if (request.method === 'PATCH') {
        const body = await readJsonBody(request);
        if (!body.ok) return body.response;
        const parsed = updatePlayerRequestSchema.safeParse(body.value);
        if (!parsed.success) return validationError(formatIssues(parsed.error));
        return respond(await stub.updatePlayer(playerId, token, parsed.data.player));
      }
      if (request.method === 'DELETE') {
        return respond(await stub.removePlayer(playerId, token));
      }
      return methodNotAllowed(['PATCH', 'DELETE']);
    }
    return notFound();
  }

  if (segments.length !== 4) return notFound();

  const limited = await enforceRateLimit(env, request, `mutate:${roomId}`, RATE_LIMITS.mutate);
  if (limited) return limited;

  /* ---- 募集状態 ---- */
  if (section === 'status') {
    if (request.method !== 'PATCH') return methodNotAllowed(['PATCH']);
    const body = await readJsonBody(request);
    if (!body.ok) return body.response;
    const parsed = updateStatusRequestSchema.safeParse(body.value);
    if (!parsed.success) return validationError(formatIssues(parsed.error));
    return respond(await stub.setStatus(token, parsed.data.status));
  }

  /* ---- アクティブ参加者 ---- */
  if (section === 'active-players') {
    if (request.method !== 'PATCH') return methodNotAllowed(['PATCH']);
    const body = await readJsonBody(request);
    if (!body.ok) return body.response;
    const parsed = updateActivePlayersRequestSchema.safeParse(body.value);
    if (!parsed.success) return validationError(formatIssues(parsed.error));
    return respond(await stub.setActivePlayers(token, parsed.data.playerIds));
  }

  /* ---- チーム候補 ---- */
  if (section === 'team-candidates') {
    if (request.method !== 'POST') return methodNotAllowed(['POST']);
    return respond(await stub.generateCandidates(token));
  }

  /* ---- キャプテンドラフト ---- */
  if (section === 'draft') {
    if (request.method === 'POST') {
      const body = await readJsonBody(request);
      if (!body.ok) return body.response;
      const parsed = startDraftRequestSchema.safeParse(body.value);
      if (!parsed.success) return validationError(formatIssues(parsed.error));
      return respond(await stub.startDraft(token, parsed.data.captainA, parsed.data.captainB));
    }
    if (request.method === 'DELETE') {
      return respond(await stub.cancelDraft(token));
    }
    return methodNotAllowed(['POST', 'DELETE']);
  }

  /* ---- 確定チーム ---- */
  if (section === 'selected-candidate') {
    if (request.method === 'POST') {
      const body = await readJsonBody(request);
      if (!body.ok) return body.response;
      const parsed = selectCandidateRequestSchema.safeParse(body.value);
      if (!parsed.success) return validationError(formatIssues(parsed.error));
      // 生成した候補を選ぶ場合と、主催者が手動調整した編成を送る場合がある
      if ('candidateId' in parsed.data) {
        return respond(await stub.selectCandidate(token, parsed.data.candidateId));
      }
      return respond(await stub.selectLineup(token, parsed.data.lineup));
    }
    if (request.method === 'DELETE') {
      return respond(await stub.clearSelectedCandidate(token));
    }
    return methodNotAllowed(['POST', 'DELETE']);
  }

  return notFound();
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    if (url.pathname === '/api' || url.pathname.startsWith('/api/')) {
      try {
        const response = await handleApi(request, env, url);
        return response;
      } catch (error) {
        // 本番ではスタックトレースや内部情報を返さない
        console.error('unhandled api error', error instanceof Error ? error.message : 'unknown');
        return jsonError(ERROR_CODES.INTERNAL_ERROR, 500, {
          details: IS_DEV && error instanceof Error ? [error.message] : undefined,
        });
      }
    }

    if (!env.ASSETS) {
      return withSecurityHeaders(new Response('Not Found', { status: 404 }));
    }
    const assetResponse = await env.ASSETS.fetch(request);
    return withSecurityHeaders(assetResponse);
  },
} satisfies ExportedHandler<Env>;
