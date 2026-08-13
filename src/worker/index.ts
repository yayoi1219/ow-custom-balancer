/**
 * Worker のエントリポイント。
 *
 * - /api/* : JSON API（Zod 検証・Turnstile 検証・レート制限を経て Durable Object を呼ぶ）
 * - それ以外: React のビルド成果物（Static Assets）を返す
 */

import { AUTH_HEADER, RATE_LIMITS, SERVICE_NAME } from '../shared/constants';
import { ERROR_CODES, type ErrorCode } from '../shared/errors';
import {
  getMessages,
  localeFromRequest,
  translateValidationKeys,
  type Locale,
  type Messages,
} from '../shared/i18n';
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

/**
 * DO の結果を HTTP レスポンスへ変換する。
 * DO が動的な文面を返していない場合は、リクエストの言語でコードから文面を作る。
 */
function respond<T>(result: DoResult<T>, messages: Messages, successStatus = 200): Response {
  if (result.ok) return jsonOk(result.data, successStatus);
  return jsonError(result.code, result.status, {
    message: result.message,
    details: result.details,
    messages,
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
function checkConfig(env: Env, messages: Messages): Response | null {
  const missing: string[] = [];
  if (!env.TOKEN_HMAC_SECRET) missing.push('TOKEN_HMAC_SECRET');
  if (!env.IP_HASH_SECRET) missing.push('IP_HASH_SECRET');
  if (missing.length === 0) return null;
  console.error(`missing required secrets: ${missing.join(', ')}`);
  return jsonError(ERROR_CODES.CONFIG_ERROR, 500, { messages });
}

async function enforceRateLimit(
  env: Env,
  request: Request,
  bucket: string,
  rule: { limit: number; windowMs: number },
  messages: Messages,
): Promise<Response | null> {
  const secret = env.IP_HASH_SECRET;
  if (!secret) return jsonError(ERROR_CODES.CONFIG_ERROR, 500, { messages });
  // IP そのものは保存せず、短期間だけ有効な不可逆識別値へ変換する
  const identifier = await ipIdentifier(secret, clientIpFrom(request), Date.now());
  const stub = env.RATE_LIMIT.get(env.RATE_LIMIT.idFromName(identifier));
  const decision = await stub.check(bucket, rule.limit, rule.windowMs);
  if (decision.allowed) return null;
  return jsonError(ERROR_CODES.RATE_LIMITED, 429, {
    headers: { 'Retry-After': String(decision.retryAfterSeconds) },
    messages,
  });
}

async function requireTurnstile(
  env: Env,
  request: Request,
  token: string,
  messages: Messages,
): Promise<Response | null> {
  const result = await verifyTurnstile(env.TURNSTILE_SECRET_KEY, token, clientIpFrom(request));
  if (result.status === 'success') return null;
  if (result.status === 'misconfigured') {
    console.error('TURNSTILE_SECRET_KEY is not configured');
    return jsonError(ERROR_CODES.CONFIG_ERROR, 500, { messages });
  }
  // エラーコードは開発時の原因追跡用（秘密情報は含まない）
  console.warn(`turnstile verification failed: ${result.errorCodes.join(',')}`);
  return jsonError(ERROR_CODES.TURNSTILE_FAILED, 403, { messages });
}

/** Zod が返した翻訳キーを、リクエストの言語の文面へ変換して返す */
function validationError(keys: string[], messages: Messages): Response {
  const details = translateValidationKeys(messages, keys);
  return jsonError(ERROR_CODES.VALIDATION_ERROR, 400, {
    message: details[0] ?? undefined,
    details,
    messages,
  });
}

function methodNotAllowed(allowed: string[], messages: Messages): Response {
  return jsonError(ERROR_CODES.METHOD_NOT_ALLOWED, 405, {
    headers: { Allow: allowed.join(', ') },
    messages,
  });
}

function notFound(messages: Messages, code: ErrorCode = ERROR_CODES.NOT_FOUND): Response {
  return jsonError(code, 404, { messages });
}

async function handleApi(request: Request, env: Env, url: URL): Promise<Response> {
  // 応答の言語は、画面で選ばれた言語（ヘッダー）→ ブラウザ設定 → 日本語 の順で決める
  const locale: Locale = localeFromRequest(request);
  const messages = getMessages(locale);
  const segments = url.pathname.split('/').filter((segment) => segment.length > 0);
  // segments[0] === 'api'
  if (segments[1] === 'config') {
    if (request.method !== 'GET') return methodNotAllowed(['GET'], messages);
    const config: PublicConfig = {
      serviceName: SERVICE_NAME,
      turnstileSiteKey: env.TURNSTILE_SITE_KEY,
    };
    return jsonOk(config);
  }

  if (segments[1] !== 'rooms') return notFound(messages);

  const configError = checkConfig(env, messages);
  if (configError) return configError;

  if (request.method !== 'GET' && !isSameOrigin(request, url)) {
    return jsonError(ERROR_CODES.FORBIDDEN, 403, { messages });
  }

  /* ---- POST /api/rooms ---- */
  if (segments.length === 2) {
    if (request.method !== 'POST') return methodNotAllowed(['POST'], messages);
    const limited = await enforceRateLimit(
      env,
      request,
      'create-room',
      RATE_LIMITS.createRoom,
      messages,
    );
    if (limited) return limited;

    const body = await readJsonBody(request, messages);
    if (!body.ok) return body.response;
    const parsed = createRoomRequestSchema.safeParse(body.value);
    if (!parsed.success) return validationError(formatIssues(parsed.error), messages);

    const turnstileError = await requireTurnstile(
      env,
      request,
      parsed.data.turnstileToken,
      messages,
    );
    if (turnstileError) return turnstileError;

    const roomId = generateRoomId();
    const stub = env.ROOM.get(env.ROOM.idFromName(roomId));
    const result = await stub.init(roomId, parsed.data.title);
    if (!result.ok) return respond(result, messages);
    return jsonOk({ roomId, hostToken: result.data.hostToken, room: result.data.room }, 201);
  }

  const roomIdResult = idPathSchema.safeParse(segments[2]);
  if (!roomIdResult.success) return notFound(messages, ERROR_CODES.ROOM_NOT_FOUND);
  const roomId = roomIdResult.data;
  const stub = env.ROOM.get(env.ROOM.idFromName(roomId));
  const token = getToken(request);

  /* ---- /api/rooms/:roomId ---- */
  if (segments.length === 3) {
    if (request.method === 'GET') {
      return respond(await stub.getState(token), messages);
    }
    if (request.method === 'DELETE') {
      const limited = await enforceRateLimit(
        env,
        request,
        `mutate:${roomId}`,
        RATE_LIMITS.mutate,
        messages,
      );
      if (limited) return limited;
      return respond(await stub.deleteRoom(token), messages);
    }
    return methodNotAllowed(['GET', 'DELETE'], messages);
  }

  const section = segments[3];

  /* ---- WebSocket ---- */
  if (section === 'ws' && segments.length === 4) {
    if (request.method !== 'GET') return methodNotAllowed(['GET'], messages);
    if (request.headers.get('Upgrade')?.toLowerCase() !== 'websocket') {
      return jsonError(ERROR_CODES.BAD_REQUEST, 426, {
        message: 'WebSocket 接続としてリクエストしてください。',
      });
    }
    // Origin を厳密に確認する（WebSocket には同一オリジンポリシーが適用されないため）
    if (!isSameOrigin(request, url)) return jsonError(ERROR_CODES.FORBIDDEN, 403, { messages });
    return stub.fetch(new Request('https://room.internal/ws', request));
  }

  /* ---- ドラフトの指名 ---- */
  if (section === 'draft' && segments.length === 5 && segments[4] === 'picks') {
    if (request.method !== 'POST') return methodNotAllowed(['POST'], messages);
    const limited = await enforceRateLimit(
      env,
      request,
      `mutate:${roomId}`,
      RATE_LIMITS.mutate,
      messages,
    );
    if (limited) return limited;
    const body = await readJsonBody(request, messages);
    if (!body.ok) return body.response;
    const parsed = draftPickRequestSchema.safeParse(body.value);
    if (!parsed.success) return validationError(formatIssues(parsed.error), messages);
    return respond(await stub.draftPick(token, parsed.data, locale), messages);
  }

  /* ---- /api/rooms/:roomId/players ---- */
  if (section === 'players') {
    if (segments.length === 4) {
      if (request.method !== 'POST') return methodNotAllowed(['POST'], messages);
      const limited = await enforceRateLimit(
        env,
        request,
        `join:${roomId}`,
        RATE_LIMITS.joinRoom,
        messages,
      );
      if (limited) return limited;

      const body = await readJsonBody(request, messages);
      if (!body.ok) return body.response;
      const parsed = joinRoomRequestSchema.safeParse(body.value);
      if (!parsed.success) return validationError(formatIssues(parsed.error), messages);

      const turnstileError = await requireTurnstile(
        env,
        request,
        parsed.data.turnstileToken,
        messages,
      );
      if (turnstileError) return turnstileError;

      return respond(await stub.addPlayer(parsed.data.player), messages, 201);
    }

    if (segments.length === 5) {
      const playerIdResult = idPathSchema.safeParse(segments[4]);
      if (!playerIdResult.success) return notFound(messages, ERROR_CODES.PLAYER_NOT_FOUND);
      const playerId = playerIdResult.data;

      const limited = await enforceRateLimit(
        env,
        request,
        `mutate:${roomId}`,
        RATE_LIMITS.mutate,
        messages,
      );
      if (limited) return limited;

      if (request.method === 'PATCH') {
        const body = await readJsonBody(request, messages);
        if (!body.ok) return body.response;
        const parsed = updatePlayerRequestSchema.safeParse(body.value);
        if (!parsed.success) return validationError(formatIssues(parsed.error), messages);
        return respond(await stub.updatePlayer(playerId, token, parsed.data.player), messages);
      }
      if (request.method === 'DELETE') {
        return respond(await stub.removePlayer(playerId, token), messages);
      }
      return methodNotAllowed(['PATCH', 'DELETE'], messages);
    }
    return notFound(messages);
  }

  if (segments.length !== 4) return notFound(messages);

  const limited = await enforceRateLimit(
    env,
    request,
    `mutate:${roomId}`,
    RATE_LIMITS.mutate,
    messages,
  );
  if (limited) return limited;

  /* ---- 募集状態 ---- */
  if (section === 'status') {
    if (request.method !== 'PATCH') return methodNotAllowed(['PATCH'], messages);
    const body = await readJsonBody(request, messages);
    if (!body.ok) return body.response;
    const parsed = updateStatusRequestSchema.safeParse(body.value);
    if (!parsed.success) return validationError(formatIssues(parsed.error), messages);
    return respond(await stub.setStatus(token, parsed.data.status), messages);
  }

  /* ---- アクティブ参加者 ---- */
  if (section === 'active-players') {
    if (request.method !== 'PATCH') return methodNotAllowed(['PATCH'], messages);
    const body = await readJsonBody(request, messages);
    if (!body.ok) return body.response;
    const parsed = updateActivePlayersRequestSchema.safeParse(body.value);
    if (!parsed.success) return validationError(formatIssues(parsed.error), messages);
    return respond(await stub.setActivePlayers(token, parsed.data.playerIds), messages);
  }

  /* ---- チーム候補 ---- */
  if (section === 'team-candidates') {
    if (request.method !== 'POST') return methodNotAllowed(['POST'], messages);
    return respond(await stub.generateCandidates(token, locale), messages);
  }

  /* ---- キャプテンドラフト ---- */
  if (section === 'draft') {
    if (request.method === 'POST') {
      const body = await readJsonBody(request, messages);
      if (!body.ok) return body.response;
      const parsed = startDraftRequestSchema.safeParse(body.value);
      if (!parsed.success) return validationError(formatIssues(parsed.error), messages);
      return respond(
        await stub.startDraft(token, parsed.data.captainA, parsed.data.captainB, locale),
        messages,
      );
    }
    if (request.method === 'DELETE') {
      return respond(await stub.cancelDraft(token), messages);
    }
    return methodNotAllowed(['POST', 'DELETE'], messages);
  }

  /* ---- 確定チーム ---- */
  if (section === 'selected-candidate') {
    if (request.method === 'POST') {
      const body = await readJsonBody(request, messages);
      if (!body.ok) return body.response;
      const parsed = selectCandidateRequestSchema.safeParse(body.value);
      if (!parsed.success) return validationError(formatIssues(parsed.error), messages);
      // 生成した候補を選ぶ場合と、主催者が手動調整した編成を送る場合がある
      if ('candidateId' in parsed.data) {
        return respond(await stub.selectCandidate(token, parsed.data.candidateId), messages);
      }
      return respond(await stub.selectLineup(token, parsed.data.lineup, locale), messages);
    }
    if (request.method === 'DELETE') {
      return respond(await stub.clearSelectedCandidate(token), messages);
    }
    return methodNotAllowed(['POST', 'DELETE'], messages);
  }

  return notFound(messages);
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
