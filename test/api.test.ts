import { SELF, env, runInDurableObject } from 'cloudflare:test';
import { beforeEach, describe, expect, it } from 'vitest';
import {
  AUTH_HEADER,
  MAX_PLAYERS,
  REQUIRED_ACTIVE_PLAYERS,
  type Role,
} from '../src/shared/constants';
import { ERROR_CODES } from '../src/shared/errors';
import type {
  CreateRoomResponse,
  JoinRoomResponse,
  PlayerInput,
  RoomStateResponse,
  TeamCandidatesResponse,
} from '../src/shared/types';
import type { RoomDurableObject } from '../src/worker/room-do';
import { playerInputSchema } from '../src/shared/validation';

const VALID_TURNSTILE_TOKEN = 'valid-turnstile-token';
const INVALID_TURNSTILE_TOKEN = 'invalid-turnstile-token';

interface ApiEnvelope<T> {
  ok: boolean;
  data?: T;
  error?: { code: string; message: string; details?: string[] };
}

/**
 * レート制限は識別元（IP由来のハッシュ）ごとに掛かるため、
 * テストごとに別のクライアントIPを使って互いに影響しないようにする。
 */
let ipCounter = 0;
let currentIp = '203.0.113.1';
beforeEach(() => {
  ipCounter += 1;
  currentIp = `203.0.113.${(ipCounter % 250) + 1}-${ipCounter}`;
});

async function callApi<T>(
  path: string,
  init: { method?: string; body?: unknown; token?: string; origin?: string } = {},
): Promise<{ status: number; body: ApiEnvelope<T>; headers: Headers }> {
  const headers = new Headers();
  if (init.body !== undefined) headers.set('Content-Type', 'application/json');
  if (init.token) headers.set(AUTH_HEADER, init.token);
  if (init.origin) headers.set('Origin', init.origin);
  headers.set('CF-Connecting-IP', currentIp);
  const response = await SELF.fetch(`https://example.com${path}`, {
    method: init.method ?? 'GET',
    headers,
    body: init.body === undefined ? undefined : JSON.stringify(init.body),
  });
  const body = (await response.json()) as ApiEnvelope<T>;
  return { status: response.status, body, headers: response.headers };
}

function samplePlayer(name: string, roles: Role[] = ['tank', 'damage', 'support']): PlayerInput {
  const roleRanks: PlayerInput['roleRanks'] = {};
  for (const role of roles) {
    roleRanks[role] = { tier: 'gold', division: 3 };
  }
  return {
    displayName: name,
    eligibleRoles: roles,
    rolePreferenceGroups: roles.map((role) => [role]),
    roleRanks,
  };
}

async function createRoom(title = 'テスト部屋'): Promise<CreateRoomResponse> {
  const result = await callApi<CreateRoomResponse>('/api/rooms', {
    method: 'POST',
    body: { title, turnstileToken: VALID_TURNSTILE_TOKEN },
  });
  expect(result.status).toBe(201);
  if (!result.body.data) throw new Error('room creation failed');
  return result.body.data;
}

/**
 * レート制限に引っかからないよう、まとめて参加者を作るときは
 * Durable Object を直接呼ぶ。
 */
async function seedPlayers(
  roomId: string,
  count: number,
  rolesFor: (index: number) => Role[] = () => ['tank', 'damage', 'support'],
): Promise<Array<{ playerId: string; editToken: string }>> {
  const stub = env.ROOM.get(env.ROOM.idFromName(roomId));
  const credentials: Array<{ playerId: string; editToken: string }> = [];
  await runInDurableObject(stub, async (instance: RoomDurableObject) => {
    for (let index = 0; index < count; index += 1) {
      const parsed = playerInputSchema.parse(samplePlayer(`Player${index + 1}`, rolesFor(index)));
      const result = await instance.addPlayer(parsed);
      if (!result.ok) throw new Error(`seed failed: ${result.code}`);
      credentials.push({ playerId: result.data.playerId, editToken: result.data.editToken });
    }
  });
  return credentials;
}

describe('API 基本動作', () => {
  it('公開設定を返す', async () => {
    const result = await callApi<{ serviceName: string; turnstileSiteKey: string }>('/api/config');
    expect(result.status).toBe(200);
    expect(result.body.data?.turnstileSiteKey).toBe('1x00000000000000000000AA');
    expect(result.headers.get('Cache-Control')).toBe('no-store');
    expect(result.headers.get('X-Content-Type-Options')).toBe('nosniff');
  });

  it('部屋を作成できる', async () => {
    const room = await createRoom('金曜カスタム');
    expect(room.roomId.length).toBeGreaterThanOrEqual(16);
    // 256bit のトークン（base64url で43文字）
    expect(room.hostToken.length).toBeGreaterThanOrEqual(43);
    expect(room.room.title).toBe('金曜カスタム');
    expect(room.room.status).toBe('open');
  });

  it('Content-Type が JSON でない場合は 415', async () => {
    const response = await SELF.fetch('https://example.com/api/rooms', {
      method: 'POST',
      body: 'title=abc',
    });
    expect(response.status).toBe(415);
  });

  it('存在しない部屋は 404', async () => {
    const result = await callApi('/api/rooms/aaaaaaaaaaaaaaaaaaaa');
    expect(result.status).toBe(404);
    expect(result.body.error?.code).toBe(ERROR_CODES.ROOM_NOT_FOUND);
  });

  it('別オリジンからの更新は拒否する', async () => {
    const room = await createRoom();
    const result = await callApi(`/api/rooms/${room.roomId}/status`, {
      method: 'PATCH',
      body: { status: 'closed' },
      token: room.hostToken,
      origin: 'https://evil.example.net',
    });
    expect(result.status).toBe(403);
  });

  it('許可されないメソッドは 405', async () => {
    const room = await createRoom();
    const result = await callApi(`/api/rooms/${room.roomId}`, { method: 'PATCH' });
    expect(result.status).toBe(405);
  });
});

describe('Turnstile 検証', () => {
  it('検証に失敗するトークンでは部屋を作成できない', async () => {
    const result = await callApi('/api/rooms', {
      method: 'POST',
      body: { title: 'ダメな部屋', turnstileToken: INVALID_TURNSTILE_TOKEN },
    });
    expect(result.status).toBe(403);
    expect(result.body.error?.code).toBe(ERROR_CODES.TURNSTILE_FAILED);
  });

  it('トークンが無い場合はバリデーションエラー', async () => {
    const result = await callApi('/api/rooms', {
      method: 'POST',
      body: { title: '部屋' },
    });
    expect(result.status).toBe(400);
    expect(result.body.error?.code).toBe(ERROR_CODES.VALIDATION_ERROR);
  });

  it('参加登録でも Turnstile を検証する', async () => {
    const room = await createRoom();
    const result = await callApi(`/api/rooms/${room.roomId}/players`, {
      method: 'POST',
      body: { player: samplePlayer('だめ'), turnstileToken: INVALID_TURNSTILE_TOKEN },
    });
    expect(result.status).toBe(403);
  });
});

describe('参加登録と権限', () => {
  let room: CreateRoomResponse;

  beforeEach(async () => {
    room = await createRoom();
  });

  it('参加登録できる', async () => {
    const result = await callApi<JoinRoomResponse>(`/api/rooms/${room.roomId}/players`, {
      method: 'POST',
      body: { player: samplePlayer('たろう'), turnstileToken: VALID_TURNSTILE_TOKEN },
    });
    expect(result.status).toBe(201);
    expect(result.body.data?.editToken.length).toBeGreaterThanOrEqual(43);
    expect(result.body.data?.room.players).toHaveLength(1);
    expect(result.body.data?.room.players[0].active).toBe(true);
  });

  it('表示名の重複を拒否する（大文字小文字・正規化後で判定）', async () => {
    await callApi(`/api/rooms/${room.roomId}/players`, {
      method: 'POST',
      body: { player: samplePlayer('Player One'), turnstileToken: VALID_TURNSTILE_TOKEN },
    });
    const duplicate = await callApi(`/api/rooms/${room.roomId}/players`, {
      method: 'POST',
      body: {
        player: samplePlayer(' ｐｌａｙｅｒ　ｏｎｅ '),
        turnstileToken: VALID_TURNSTILE_TOKEN,
      },
    });
    expect(duplicate.status).toBe(409);
    expect(duplicate.body.error?.code).toBe(ERROR_CODES.DUPLICATE_DISPLAY_NAME);
  });

  it('参加人数の上限を超えられない', async () => {
    await seedPlayers(room.roomId, MAX_PLAYERS);
    const result = await callApi(`/api/rooms/${room.roomId}/players`, {
      method: 'POST',
      body: { player: samplePlayer('あふれる人'), turnstileToken: VALID_TURNSTILE_TOKEN },
    });
    expect(result.status).toBe(409);
    expect(result.body.error?.code).toBe(ERROR_CODES.ROOM_FULL);
  });

  it('自分の編集トークンで自分の登録を更新できる', async () => {
    const join = await callApi<JoinRoomResponse>(`/api/rooms/${room.roomId}/players`, {
      method: 'POST',
      body: { player: samplePlayer('じぶん'), turnstileToken: VALID_TURNSTILE_TOKEN },
    });
    const credential = join.body.data;
    if (!credential) throw new Error('join failed');

    const updated = await callApi<RoomStateResponse>(
      `/api/rooms/${room.roomId}/players/${credential.playerId}`,
      {
        method: 'PATCH',
        body: { player: samplePlayer('じぶん改', ['support']) },
        token: credential.editToken,
      },
    );
    expect(updated.status).toBe(200);
    expect(updated.body.data?.room.players[0].displayName).toBe('じぶん改');
    expect(updated.body.data?.room.players[0].eligibleRoles).toEqual(['support']);
  });

  it('他人の編集トークンでは更新できない', async () => {
    const [first, second] = await seedPlayers(room.roomId, 2);
    const result = await callApi(`/api/rooms/${room.roomId}/players/${first.playerId}`, {
      method: 'PATCH',
      body: { player: samplePlayer('なりすまし') },
      token: second.editToken,
    });
    expect(result.status).toBe(403);
    expect(result.body.error?.code).toBe(ERROR_CODES.FORBIDDEN);
  });

  it('トークン無しでは更新できない', async () => {
    const [first] = await seedPlayers(room.roomId, 1);
    const result = await callApi(`/api/rooms/${room.roomId}/players/${first.playerId}`, {
      method: 'PATCH',
      body: { player: samplePlayer('無権限') },
    });
    expect(result.status).toBe(401);
  });

  it('自分の登録は自分で削除（辞退）できる', async () => {
    const [first] = await seedPlayers(room.roomId, 1);
    const result = await callApi<RoomStateResponse>(
      `/api/rooms/${room.roomId}/players/${first.playerId}`,
      { method: 'DELETE', token: first.editToken },
    );
    expect(result.status).toBe(200);
    expect(result.body.data?.room.players).toHaveLength(0);
  });

  it('不正な入力（長すぎる名前・制御文字・不正ロール）は 400', async () => {
    const cases: PlayerInput[] = [
      { ...samplePlayer('あ'.repeat(30)) },
      { ...samplePlayer(`bad${String.fromCharCode(0x0a)}name`) },
      {
        displayName: 'ロール不正',
        eligibleRoles: ['healer' as Role],
        rolePreferenceGroups: [['healer' as Role]],
        roleRanks: {},
      },
      {
        displayName: 'ランク不正',
        eligibleRoles: ['tank'],
        rolePreferenceGroups: [['tank']],
        roleRanks: { tank: { tier: 'gold', division: 9 } },
      },
      {
        displayName: 'ランク未入力',
        eligibleRoles: ['tank'],
        rolePreferenceGroups: [['tank']],
        roleRanks: {},
      },
    ];
    for (const player of cases) {
      const result = await callApi(`/api/rooms/${room.roomId}/players`, {
        method: 'POST',
        body: { player, turnstileToken: VALID_TURNSTILE_TOKEN },
      });
      expect(result.status).toBe(400);
      expect(result.body.error?.code).toBe(ERROR_CODES.VALIDATION_ERROR);
    }
  });
});

describe('主催者権限', () => {
  let room: CreateRoomResponse;

  beforeEach(async () => {
    room = await createRoom();
  });

  it('正しい主催者トークンで募集状態を変更できる', async () => {
    const result = await callApi<RoomStateResponse>(`/api/rooms/${room.roomId}/status`, {
      method: 'PATCH',
      body: { status: 'closed' },
      token: room.hostToken,
    });
    expect(result.status).toBe(200);
    expect(result.body.data?.room.status).toBe('closed');
    expect(result.body.data?.viewer.role).toBe('host');
  });

  it('誤った主催者トークンでは変更できない', async () => {
    const result = await callApi(`/api/rooms/${room.roomId}/status`, {
      method: 'PATCH',
      body: { status: 'closed' },
      token: 'x'.repeat(43),
    });
    expect(result.status).toBe(403);
  });

  it('参加者の編集トークンでは主催者操作を行えない', async () => {
    const [first] = await seedPlayers(room.roomId, 1);
    const result = await callApi(`/api/rooms/${room.roomId}/status`, {
      method: 'PATCH',
      body: { status: 'closed' },
      token: first.editToken,
    });
    expect(result.status).toBe(403);
  });

  it('主催者は参加者を削除できる', async () => {
    const [first] = await seedPlayers(room.roomId, 2);
    const result = await callApi<RoomStateResponse>(
      `/api/rooms/${room.roomId}/players/${first.playerId}`,
      { method: 'DELETE', token: room.hostToken },
    );
    expect(result.status).toBe(200);
    expect(result.body.data?.room.players).toHaveLength(1);
  });

  it('締め切ると新規参加できない', async () => {
    await callApi(`/api/rooms/${room.roomId}/status`, {
      method: 'PATCH',
      body: { status: 'closed' },
      token: room.hostToken,
    });
    const result = await callApi(`/api/rooms/${room.roomId}/players`, {
      method: 'POST',
      body: { player: samplePlayer('あとから'), turnstileToken: VALID_TURNSTILE_TOKEN },
    });
    expect(result.status).toBe(409);
    expect(result.body.error?.code).toBe(ERROR_CODES.ROOM_CLOSED);
  });

  it('主催者だけがチーム候補を作成できる', async () => {
    await seedPlayers(room.roomId, REQUIRED_ACTIVE_PLAYERS);
    const denied = await callApi(`/api/rooms/${room.roomId}/team-candidates`, { method: 'POST' });
    expect(denied.status).toBe(403);

    const allowed = await callApi<TeamCandidatesResponse>(
      `/api/rooms/${room.roomId}/team-candidates`,
      { method: 'POST', token: room.hostToken },
    );
    expect(allowed.status).toBe(200);
    expect(allowed.body.data?.candidates.length).toBeGreaterThan(0);
  });

  it('部屋を削除すると以後アクセスできない', async () => {
    const deleted = await callApi(`/api/rooms/${room.roomId}`, {
      method: 'DELETE',
      token: room.hostToken,
    });
    expect(deleted.status).toBe(200);

    const after = await callApi(`/api/rooms/${room.roomId}`);
    expect(after.status).toBe(410);
    expect(after.body.error?.code).toBe(ERROR_CODES.ROOM_EXPIRED);
  });
});

describe('アクティブ参加者とチーム分け', () => {
  it('10人ちょうどでなければチーム候補を作成できない', async () => {
    const room = await createRoom();
    await seedPlayers(room.roomId, 9);
    const result = await callApi(`/api/rooms/${room.roomId}/team-candidates`, {
      method: 'POST',
      token: room.hostToken,
    });
    expect(result.status).toBe(409);
    expect(result.body.error?.code).toBe(ERROR_CODES.ACTIVE_COUNT_INVALID);
  });

  it('10人以下なら全員が自動的にアクティブになる', async () => {
    const room = await createRoom();
    await seedPlayers(room.roomId, REQUIRED_ACTIVE_PLAYERS);
    const state = await callApi<RoomStateResponse>(`/api/rooms/${room.roomId}`);
    expect(state.body.data?.room.players.every((player) => player.active)).toBe(true);
  });

  it('11人以上では主催者が10人を選択する', async () => {
    const room = await createRoom();
    const credentials = await seedPlayers(room.roomId, 12);
    const before = await callApi<RoomStateResponse>(`/api/rooms/${room.roomId}`);
    expect(before.body.data?.room.players.filter((player) => player.active)).toHaveLength(
      REQUIRED_ACTIVE_PLAYERS,
    );

    const chosen = credentials.slice(2).map((credential) => credential.playerId);
    const applied = await callApi<RoomStateResponse>(`/api/rooms/${room.roomId}/active-players`, {
      method: 'PATCH',
      body: { playerIds: chosen },
      token: room.hostToken,
    });
    expect(applied.status).toBe(200);
    const activeIds = applied.body.data?.room.players
      .filter((player) => player.active)
      .map((player) => player.id);
    expect(activeIds?.sort()).toEqual([...chosen].sort());
  });

  it('11人を指定するとバリデーションエラー', async () => {
    const room = await createRoom();
    const credentials = await seedPlayers(room.roomId, 11);
    const result = await callApi(`/api/rooms/${room.roomId}/active-players`, {
      method: 'PATCH',
      body: { playerIds: credentials.map((credential) => credential.playerId) },
      token: room.hostToken,
    });
    expect(result.status).toBe(400);
  });

  it('候補を確定・解除できる', async () => {
    const room = await createRoom();
    await seedPlayers(room.roomId, REQUIRED_ACTIVE_PLAYERS);
    const generated = await callApi<TeamCandidatesResponse>(
      `/api/rooms/${room.roomId}/team-candidates`,
      { method: 'POST', token: room.hostToken },
    );
    const candidate = generated.body.data?.candidates[0];
    if (!candidate) throw new Error('no candidate');

    const selected = await callApi<RoomStateResponse>(
      `/api/rooms/${room.roomId}/selected-candidate`,
      { method: 'POST', body: { candidateId: candidate.id }, token: room.hostToken },
    );
    expect(selected.status).toBe(200);
    expect(selected.body.data?.room.selectedCandidate?.id).toBe(candidate.id);

    // 確定結果は権限のない閲覧者にも見える
    const publicState = await callApi<RoomStateResponse>(`/api/rooms/${room.roomId}`);
    expect(publicState.body.data?.room.selectedCandidate?.id).toBe(candidate.id);
    // 候補一覧は主催者にしか渡さない
    expect(publicState.body.data?.room.candidates).toBeNull();

    const cleared = await callApi<RoomStateResponse>(
      `/api/rooms/${room.roomId}/selected-candidate`,
      { method: 'DELETE', token: room.hostToken },
    );
    expect(cleared.status).toBe(200);
    expect(cleared.body.data?.room.selectedCandidate).toBeNull();
  });

  it('存在しない候補IDは確定できない', async () => {
    const room = await createRoom();
    await seedPlayers(room.roomId, REQUIRED_ACTIVE_PLAYERS);
    await callApi(`/api/rooms/${room.roomId}/team-candidates`, {
      method: 'POST',
      token: room.hostToken,
    });
    const result = await callApi(`/api/rooms/${room.roomId}/selected-candidate`, {
      method: 'POST',
      body: { candidateId: 'deadbeef' },
      token: room.hostToken,
    });
    expect(result.status).toBe(404);
  });

  it('有効な構成が作れない場合は理由を返す', async () => {
    const room = await createRoom();
    // 全員 Damage 専任 → Tank / Support が不足
    await seedPlayers(room.roomId, REQUIRED_ACTIVE_PLAYERS, () => ['damage']);
    const result = await callApi(`/api/rooms/${room.roomId}/team-candidates`, {
      method: 'POST',
      token: room.hostToken,
    });
    expect(result.status).toBe(409);
    expect(result.body.error?.code).toBe(ERROR_CODES.NO_VALID_LINEUP);
    expect(result.body.error?.message).toContain('Tank');
  });
});

describe('有効期限', () => {
  it('期限前はアクセスできる', async () => {
    const room = await createRoom();
    const state = await callApi<RoomStateResponse>(`/api/rooms/${room.roomId}`);
    expect(state.status).toBe(200);
    const expiresAt = new Date(state.body.data?.room.expiresAt ?? 0).getTime();
    expect(expiresAt).toBeGreaterThan(Date.now());
  });

  it('期限後は取得も更新もできず、Alarm の再実行も安全', async () => {
    const room = await createRoom();
    await seedPlayers(room.roomId, 3);
    const stub = env.ROOM.get(env.ROOM.idFromName(room.roomId));

    await runInDurableObject(stub, async (instance: RoomDurableObject) => {
      await instance.debugForceExpiry();
      // Alarm は最低1回実行される前提。複数回実行しても壊れないこと。
      await instance.alarm();
      await instance.alarm();
      await instance.alarm();
    });

    const state = await callApi(`/api/rooms/${room.roomId}`);
    expect(state.status).toBe(410);
    expect(state.body.error?.code).toBe(ERROR_CODES.ROOM_EXPIRED);

    const update = await callApi(`/api/rooms/${room.roomId}/status`, {
      method: 'PATCH',
      body: { status: 'closed' },
      token: room.hostToken,
    });
    expect(update.status).toBe(410);

    const join = await callApi(`/api/rooms/${room.roomId}/players`, {
      method: 'POST',
      body: { player: samplePlayer('遅刻'), turnstileToken: VALID_TURNSTILE_TOKEN },
    });
    expect(join.status).toBe(410);
  });

  it('期限切れ時に参加者情報とトークンハッシュが削除される', async () => {
    const room = await createRoom();
    await seedPlayers(room.roomId, 2);
    const stub = env.ROOM.get(env.ROOM.idFromName(room.roomId));

    await runInDurableObject(stub, async (instance: RoomDurableObject, state) => {
      await instance.debugForceExpiry();
      await instance.alarm();
      const players = state.storage.sql.exec('SELECT COUNT(*) AS c FROM players;').toArray();
      expect(Number(players[0].c)).toBe(0);
      const rooms = state.storage.sql
        .exec('SELECT host_token_hash, status, selected_candidate FROM room;')
        .toArray();
      expect(rooms[0].host_token_hash).toBeNull();
      expect(rooms[0].selected_candidate).toBeNull();
      expect(rooms[0].status).toBe('expired');
    });
  });
});

describe('レート制限', () => {
  it('部屋作成が短時間に連続すると 429 になる', async () => {
    let limited = false;
    for (let index = 0; index < 8; index += 1) {
      const result = await callApi('/api/rooms', {
        method: 'POST',
        body: { title: `部屋${index}`, turnstileToken: VALID_TURNSTILE_TOKEN },
      });
      if (result.status === 429) {
        expect(result.body.error?.code).toBe(ERROR_CODES.RATE_LIMITED);
        limited = true;
        break;
      }
    }
    expect(limited).toBe(true);
  });
});

describe('WebSocket', () => {
  it('接続するとスナップショットが配信され、認証で主催者になれる', async () => {
    const room = await createRoom('WSテスト');
    await seedPlayers(room.roomId, 1);

    const response = await SELF.fetch(`https://example.com/api/rooms/${room.roomId}/ws`, {
      headers: { Upgrade: 'websocket' },
    });
    expect(response.status).toBe(101);
    const socket = response.webSocket;
    if (!socket) throw new Error('no websocket');
    socket.accept();

    const messages: string[] = [];
    const received = new Promise<void>((resolve) => {
      socket.addEventListener('message', (event: MessageEvent) => {
        messages.push(String(event.data));
        if (messages.length >= 2) resolve();
      });
    });

    socket.send(JSON.stringify({ type: 'auth', token: room.hostToken }));
    await received;

    const first = JSON.parse(messages[0]) as { type: string; viewer: { role: string } };
    const second = JSON.parse(messages[1]) as {
      type: string;
      viewer: { role: string };
      room: { players: unknown[] };
    };
    expect(first.type).toBe('snapshot');
    expect(first.viewer.role).toBe('guest');
    expect(second.viewer.role).toBe('host');
    expect(second.room.players).toHaveLength(1);
    socket.close();
  });
});
