/**
 * 部屋ごとの SQLite-backed Durable Object。
 *
 * - SQLite を永続データの正本とし、メモリ上の状態には依存しない
 *   （Hibernation からの復帰・再デプロイ後も SQLite から復元できる）
 * - 状態変更は transactionSync で原子的に処理する
 * - WebSocket Hibernation API で全接続へ更新を配信する
 * - Alarm で24時間後に参加者情報とトークンハッシュを削除する
 */

import { DurableObject } from 'cloudflare:workers';
import { MAX_PLAYERS, REQUIRED_ACTIVE_PLAYERS, ROOM_TTL_MS, type Role } from '../shared/constants';
import { ERROR_CODES, errorMessageFor, type ErrorCode } from '../shared/errors';
import { DEFAULT_LOCALE, getMessages, type Locale } from '../shared/i18n';
import { evaluateLineup, generateTeamCandidates, type LineupSlot } from '../shared/balancer';
import { toBalancePlayers } from '../shared/lineup';
import { applyPick, currentTurn, draftToLineup, startDraft } from '../shared/draft';
import { normalizePreferenceGroups, type PreferenceGroups } from '../shared/preferences';
import { normalizeLegacyRank } from '../shared/ranks';
import type {
  DraftState,
  JoinRoomResponse,
  PlayerPublic,
  RecruitStatus,
  RoleRanks,
  RoomSnapshot,
  RoomStateResponse,
  RoomStatus,
  ServerMessage,
  TeamCandidate,
  TeamCandidatesResponse,
  ViewerInfo,
  ViewerRole,
} from '../shared/types';
import {
  draftStateSchema,
  normalizedKey,
  preferenceGroupsJsonSchema,
  roleRanksSchema,
  rolesJsonSchema,
  sortRoles,
  teamCandidateListSchema,
  teamCandidateSchema,
  type PlayerInputParsed,
} from '../shared/validation';
import { generatePlayerId, generateToken, hmacHex, timingSafeEqual } from './crypto';
import type { Env } from './env';

/** DO 呼び出しの統一結果型（例外を投げずにエラーを返す） */
export type DoResult<T> =
  | { ok: true; data: T }
  /**
   * `message` は動的な文面（誰が・どのロールで、といった具体的な理由）がある場合のみ入る。
   * 省略された場合は、呼び出し側の Worker がリクエストの言語で `code` から文面を作る。
   */
  | { ok: false; status: number; code: ErrorCode; message?: string; details?: string[] };

function fail(
  code: ErrorCode,
  status: number,
  message?: string,
  details?: string[],
): DoResult<never> {
  return { ok: false, status, code, message, details };
}

/**
 * 保存済みのロール別ランクを現行のランク仕様へ寄せる。
 * ランクシステムの変更（Champion のディビジョン廃止など）があっても
 * 既存の部屋が壊れないようにするための読み出し時の互換処理。
 */
function normalizeStoredRoleRanks(raw: unknown): Record<string, unknown> {
  if (typeof raw !== 'object' || raw === null) return {};
  const result: Record<string, unknown> = {};
  for (const [role, value] of Object.entries(raw as Record<string, unknown>)) {
    const normalized = normalizeLegacyRank(value);
    if (normalized) result[role] = normalized;
  }
  return result;
}

/** WebSocket 接続に紐づける情報（Hibernation を跨いで保持される） */
interface SocketAttachment {
  role: ViewerRole;
  playerId: string | null;
}

interface RoomRow extends Record<string, SqlStorageValue> {
  id: string;
  title: string;
  host_token_hash: string | null;
  status: string;
  created_at: number;
  expires_at: number;
  selected_candidate: string | null;
  candidates: string | null;
  draft: string | null;
  version: number;
}

interface PlayerRow extends Record<string, SqlStorageValue> {
  id: string;
  edit_token_hash: string;
  display_name: string;
  normalized_display_name: string;
  eligible_roles: string;
  role_preference_groups: string;
  role_ranks: string;
  active: number;
  joined_at: number;
  updated_at: number;
}

export class RoomDurableObject extends DurableObject<Env> {
  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
    ctx.blockConcurrencyWhile(async () => {
      this.migrate();
    });
  }

  /** テーブル定義（何度実行しても安全） */
  private migrate(): void {
    const sql = this.ctx.storage.sql;
    sql.exec(
      `CREATE TABLE IF NOT EXISTS room (
         id TEXT PRIMARY KEY,
         title TEXT NOT NULL,
         host_token_hash TEXT,
         status TEXT NOT NULL,
         created_at INTEGER NOT NULL,
         expires_at INTEGER NOT NULL,
         selected_candidate TEXT,
         candidates TEXT,
         draft TEXT,
         version INTEGER NOT NULL
       );`,
    );
    sql.exec(
      `CREATE TABLE IF NOT EXISTS players (
         id TEXT PRIMARY KEY,
         edit_token_hash TEXT NOT NULL,
         display_name TEXT NOT NULL,
         normalized_display_name TEXT NOT NULL,
         eligible_roles TEXT NOT NULL,
         role_preference_groups TEXT NOT NULL,
         role_ranks TEXT NOT NULL,
         active INTEGER NOT NULL,
         joined_at INTEGER NOT NULL,
         updated_at INTEGER NOT NULL
       );`,
    );
    // 同一部屋内の表示名重複を DB レベルで禁止する
    sql.exec(
      `CREATE UNIQUE INDEX IF NOT EXISTS players_normalized_name
         ON players (normalized_display_name);`,
    );
    this.migrateDraftColumn();
    this.migratePreferenceColumn();
  }

  /** 既存の部屋へ draft 列を追加する（何度実行しても安全） */
  private migrateDraftColumn(): void {
    const sql = this.ctx.storage.sql;
    const columns = sql
      .exec<{ name: string } & Record<string, SqlStorageValue>>(`PRAGMA table_info(room);`)
      .toArray()
      .map((column) => String(column.name));
    if (columns.length > 0 && !columns.includes('draft')) {
      sql.exec(`ALTER TABLE room ADD COLUMN draft TEXT;`);
    }
  }

  /**
   * 旧スキーマ（希望順位が単純な並び `["tank","damage"]`）から、
   * 同順位を表せるグループ形式 `[["tank"],["damage"]]` へ移行する。
   * 既に移行済みなら何もしない（何度実行しても安全）。
   */
  private migratePreferenceColumn(): void {
    const sql = this.ctx.storage.sql;
    const columns = sql
      .exec<{ name: string } & Record<string, SqlStorageValue>>(`PRAGMA table_info(players);`)
      .toArray()
      .map((column) => String(column.name));
    if (!columns.includes('role_preference_order')) return;

    if (!columns.includes('role_preference_groups')) {
      sql.exec(
        `ALTER TABLE players RENAME COLUMN role_preference_order TO role_preference_groups;`,
      );
    }
    // 旧形式の値をグループ形式へ書き換える
    const rows = sql
      .exec<{ id: string; role_preference_groups: string } & Record<string, SqlStorageValue>>(
        `SELECT id, role_preference_groups FROM players;`,
      )
      .toArray();
    for (const row of rows) {
      let parsed: unknown;
      try {
        parsed = JSON.parse(row.role_preference_groups);
      } catch {
        continue;
      }
      if (!Array.isArray(parsed) || parsed.length === 0) continue;
      if (Array.isArray(parsed[0])) continue; // すでにグループ形式
      sql.exec(
        `UPDATE players SET role_preference_groups = ? WHERE id = ?;`,
        JSON.stringify((parsed as string[]).map((role) => [role])),
        row.id,
      );
    }
  }

  /* ---------------- 内部ヘルパー ---------------- */

  private get sql(): SqlStorage {
    return this.ctx.storage.sql;
  }

  private loadRoom(): RoomRow | null {
    // room テーブルは1部屋につき1行のみ
    const rows = this.sql.exec<RoomRow>(`SELECT * FROM room LIMIT 1;`).toArray();
    return rows[0] ?? null;
  }

  private loadPlayers(): PlayerRow[] {
    return this.sql
      .exec<PlayerRow>(`SELECT * FROM players ORDER BY joined_at ASC, id ASC;`)
      .toArray();
  }

  private countPlayers(): number {
    const rows = this.sql
      .exec<{ c: number } & Record<string, SqlStorageValue>>(`SELECT COUNT(*) AS c FROM players;`)
      .toArray();
    return Number(rows[0]?.c ?? 0);
  }

  private async hash(value: string): Promise<string> {
    const secret = this.env.TOKEN_HMAC_SECRET;
    if (!secret) {
      throw new Error('TOKEN_HMAC_SECRET is not configured');
    }
    return hmacHex(secret, value);
  }

  private toPlayerPublic(row: PlayerRow): PlayerPublic {
    const eligibleRoles = rolesJsonSchema.parse(JSON.parse(row.eligible_roles)) as Role[];
    const rolePreferenceGroups = normalizePreferenceGroups(
      preferenceGroupsJsonSchema.parse(JSON.parse(row.role_preference_groups)) as PreferenceGroups,
    );
    // ランク仕様の変更（Champion のディビジョン廃止・旧称 ultimate）に備えて
    // 保存済みの値を現行仕様へ寄せてから検証する
    const roleRanks = roleRanksSchema.parse(
      normalizeStoredRoleRanks(JSON.parse(row.role_ranks)),
    ) as RoleRanks;
    return {
      id: row.id,
      displayName: row.display_name,
      eligibleRoles,
      rolePreferenceGroups,
      roleRanks,
      active: row.active === 1,
      joinedAt: new Date(row.joined_at).toISOString(),
      updatedAt: new Date(row.updated_at).toISOString(),
    };
  }

  private parseCandidates(raw: string | null): TeamCandidate[] | null {
    if (!raw) return null;
    const parsed = teamCandidateListSchema.safeParse(JSON.parse(raw));
    return parsed.success ? (parsed.data as TeamCandidate[]) : null;
  }

  private parseDraft(raw: string | null): DraftState | null {
    if (!raw) return null;
    const parsed = draftStateSchema.safeParse(JSON.parse(raw));
    return parsed.success ? (parsed.data as DraftState) : null;
  }

  private parseSelected(raw: string | null): TeamCandidate | null {
    if (!raw) return null;
    const parsed = teamCandidateSchema.safeParse(JSON.parse(raw));
    return parsed.success ? (parsed.data as TeamCandidate) : null;
  }

  private snapshot(room: RoomRow, includeCandidates: boolean): RoomSnapshot {
    return {
      id: room.id,
      title: room.title,
      status: room.status as RoomStatus,
      createdAt: new Date(room.created_at).toISOString(),
      expiresAt: new Date(room.expires_at).toISOString(),
      version: room.version,
      players: this.loadPlayers().map((row) => this.toPlayerPublic(row)),
      selectedCandidate: this.parseSelected(room.selected_candidate),
      draft: this.parseDraft(room.draft),
      candidates: includeCandidates ? this.parseCandidates(room.candidates) : null,
    };
  }

  /** 期限切れなら期限切れ処理を行い、生きている room 行を返す */
  private async ensureLive(): Promise<DoResult<RoomRow>> {
    const room = this.loadRoom();
    if (!room) return fail(ERROR_CODES.ROOM_NOT_FOUND, 404);
    if (room.status === 'expired' || room.status === 'deleted') {
      return fail(ERROR_CODES.ROOM_EXPIRED, 410);
    }
    if (Date.now() >= room.expires_at) {
      await this.expire('expired');
      return fail(ERROR_CODES.ROOM_EXPIRED, 410);
    }
    return { ok: true, data: room };
  }

  private async resolveViewer(room: RoomRow, token: string | null): Promise<ViewerInfo> {
    if (!token) return { role: 'guest', playerId: null };
    const hashed = await this.hash(token);
    if (room.host_token_hash && timingSafeEqual(hashed, room.host_token_hash)) {
      return { role: 'host', playerId: null };
    }
    const players = this.loadPlayers();
    for (const player of players) {
      if (timingSafeEqual(hashed, player.edit_token_hash)) {
        return { role: 'player', playerId: player.id };
      }
    }
    return { role: 'guest', playerId: null };
  }

  private async requireHost(room: RoomRow, token: string | null): Promise<DoResult<true>> {
    const viewer = await this.resolveViewer(room, token);
    if (viewer.role !== 'host') return fail(ERROR_CODES.FORBIDDEN, 403);
    return { ok: true, data: true };
  }

  private bumpVersion(): number {
    const rows = this.sql
      .exec<{ version: number } & Record<string, SqlStorageValue>>(
        `UPDATE room SET version = version + 1 RETURNING version;`,
      )
      .toArray();
    return Number(rows[0]?.version ?? 0);
  }

  /** 参加者が10人以下なら全員アクティブにする（仕様の不変条件） */
  private normalizeActiveFlags(): void {
    if (this.countPlayers() <= REQUIRED_ACTIVE_PLAYERS) {
      this.sql.exec(`UPDATE players SET active = 1;`);
    }
  }

  /* ---------------- WebSocket ---------------- */

  override async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);
    if (url.pathname !== '/ws') {
      return new Response('not found', { status: 404 });
    }
    if (request.headers.get('Upgrade')?.toLowerCase() !== 'websocket') {
      return new Response('expected websocket', { status: 426 });
    }

    const pair = new WebSocketPair();
    const client = pair[0];
    const server = pair[1];

    // Hibernation API: DO がスリープしても接続を維持できる
    this.ctx.acceptWebSocket(server);
    const attachment: SocketAttachment = { role: 'guest', playerId: null };
    server.serializeAttachment(attachment);

    const room = this.loadRoom();
    if (!room) {
      this.safeSend(server, {
        type: 'error',
        code: ERROR_CODES.ROOM_NOT_FOUND,
        message: errorMessageFor(ERROR_CODES.ROOM_NOT_FOUND),
      });
    } else if (room.status === 'expired' || room.status === 'deleted') {
      this.safeSend(server, { type: 'expired', roomId: room.id });
    } else {
      this.safeSend(server, {
        type: 'snapshot',
        room: this.snapshot(room, false),
        viewer: { role: 'guest', playerId: null },
      });
    }

    return new Response(null, { status: 101, webSocket: client });
  }

  override async webSocketMessage(ws: WebSocket, message: string | ArrayBuffer): Promise<void> {
    if (typeof message !== 'string' || message.length > 8192) return;
    let parsed: unknown;
    try {
      parsed = JSON.parse(message);
    } catch {
      return;
    }
    if (typeof parsed !== 'object' || parsed === null) return;
    const type = (parsed as { type?: unknown }).type;

    if (type === 'ping') {
      this.safeSend(ws, { type: 'pong' });
      return;
    }

    const room = this.loadRoom();
    if (!room) {
      this.safeSend(ws, {
        type: 'error',
        code: ERROR_CODES.ROOM_NOT_FOUND,
        message: errorMessageFor(ERROR_CODES.ROOM_NOT_FOUND),
      });
      return;
    }
    if (room.status === 'expired' || room.status === 'deleted') {
      this.safeSend(ws, { type: 'expired', roomId: room.id });
      return;
    }

    if (type === 'auth') {
      const token = (parsed as { token?: unknown }).token;
      if (typeof token !== 'string' || token.length === 0 || token.length > 512) return;
      const viewer = await this.resolveViewer(room, token);
      const attachment: SocketAttachment = { role: viewer.role, playerId: viewer.playerId };
      ws.serializeAttachment(attachment);
      this.safeSend(ws, {
        type: 'snapshot',
        room: this.snapshot(room, viewer.role === 'host'),
        viewer,
      });
      return;
    }

    if (type === 'refresh') {
      const attachment = this.readAttachment(ws);
      this.safeSend(ws, {
        type: 'snapshot',
        room: this.snapshot(room, attachment.role === 'host'),
        viewer: this.viewerFromAttachment(attachment),
      });
    }
  }

  override async webSocketClose(ws: WebSocket, code: number, reason: string): Promise<void> {
    try {
      // 1006 は明示的に close できないため通常終了コードへ丸める
      ws.close(code === 1006 || code < 1000 || code > 4999 ? 1000 : code, reason);
    } catch {
      // すでに閉じている場合は無視
    }
  }

  override async webSocketError(): Promise<void> {
    // 追加処理は不要（Hibernation API 側で回収される）
  }

  private readAttachment(ws: WebSocket): SocketAttachment {
    const raw = ws.deserializeAttachment() as SocketAttachment | null;
    if (!raw || (raw.role !== 'host' && raw.role !== 'player' && raw.role !== 'guest')) {
      return { role: 'guest', playerId: null };
    }
    return { role: raw.role, playerId: typeof raw.playerId === 'string' ? raw.playerId : null };
  }

  private viewerFromAttachment(attachment: SocketAttachment): ViewerInfo {
    if (attachment.role === 'player' && attachment.playerId) {
      // 削除された参加者はゲスト扱いへ戻す
      const rows = this.sql
        .exec<{ id: string } & Record<string, SqlStorageValue>>(
          `SELECT id FROM players WHERE id = ?;`,
          attachment.playerId,
        )
        .toArray();
      if (rows.length === 0) return { role: 'guest', playerId: null };
    }
    return { role: attachment.role, playerId: attachment.playerId };
  }

  private safeSend(ws: WebSocket, message: ServerMessage): void {
    try {
      ws.send(JSON.stringify(message));
    } catch {
      // 切断済みの接続は無視する
    }
  }

  /** 部屋の全接続へ最新スナップショットを配信する（権限に応じて内容を変える） */
  private broadcast(): void {
    const room = this.loadRoom();
    if (!room) return;
    const publicSnapshot = this.snapshot(room, false);
    let hostSnapshot: RoomSnapshot | null = null;
    for (const ws of this.ctx.getWebSockets()) {
      const attachment = this.readAttachment(ws);
      const viewer = this.viewerFromAttachment(attachment);
      if (viewer.role === 'host') {
        hostSnapshot ??= this.snapshot(room, true);
        this.safeSend(ws, { type: 'snapshot', room: hostSnapshot, viewer });
      } else {
        this.safeSend(ws, { type: 'snapshot', room: publicSnapshot, viewer });
      }
    }
  }

  private broadcastExpired(roomId: string): void {
    for (const ws of this.ctx.getWebSockets()) {
      this.safeSend(ws, { type: 'expired', roomId });
      try {
        ws.close(1000, 'room expired');
      } catch {
        // 無視
      }
    }
  }

  /* ---------------- 有効期限 ---------------- */

  /**
   * 期限切れ／削除処理。参加者情報・トークンハッシュ・確定結果を削除する。
   * 何度実行しても同じ結果になる（冪等）。
   */
  private async expire(nextStatus: 'expired' | 'deleted'): Promise<void> {
    const room = this.loadRoom();
    if (!room) return;
    const alreadyGone = room.status === 'expired' || room.status === 'deleted';
    if (!alreadyGone) {
      this.ctx.storage.transactionSync(() => {
        this.sql.exec(`DELETE FROM players;`);
        this.sql.exec(
          `UPDATE room
             SET status = ?,
                 host_token_hash = NULL,
                 selected_candidate = NULL,
                 candidates = NULL,
                 draft = NULL,
                 version = version + 1
           ;`,
          nextStatus,
        );
      });
    }
    await this.ctx.storage.deleteAlarm();
    this.broadcastExpired(room.id);
  }

  override async alarm(): Promise<void> {
    const room = this.loadRoom();
    if (!room) return;
    // Alarm が早すぎた場合は張り直す（再実行されても安全）
    if (room.status !== 'expired' && room.status !== 'deleted' && Date.now() < room.expires_at) {
      await this.ctx.storage.setAlarm(room.expires_at);
      return;
    }
    await this.expire('expired');
  }

  /* ---------------- 公開 RPC ---------------- */

  /** 部屋を作成する。主催者トークンはここで生成し、ハッシュのみ保存する。 */
  async init(
    roomId: string,
    title: string,
  ): Promise<DoResult<{ hostToken: string; room: RoomSnapshot }>> {
    if (this.loadRoom()) {
      return fail(ERROR_CODES.BAD_REQUEST, 409);
    }
    const now = Date.now();
    const expiresAt = now + ROOM_TTL_MS;
    const hostToken = generateToken();
    const hostTokenHash = await this.hash(hostToken);

    this.ctx.storage.transactionSync(() => {
      this.sql.exec(
        `INSERT INTO room (id, title, host_token_hash, status, created_at, expires_at, selected_candidate, candidates, draft, version)
         VALUES (?, ?, ?, 'open', ?, ?, NULL, NULL, NULL, 1);`,
        roomId,
        title,
        hostTokenHash,
        now,
        expiresAt,
      );
    });
    // 24時間後に自動削除するための Alarm
    await this.ctx.storage.setAlarm(expiresAt);

    const room = this.loadRoom();
    if (!room) return fail(ERROR_CODES.INTERNAL_ERROR, 500);
    return { ok: true, data: { hostToken, room: this.snapshot(room, true) } };
  }

  async getState(token: string | null): Promise<DoResult<RoomStateResponse>> {
    const live = await this.ensureLive();
    if (!live.ok) return live;
    const viewer = await this.resolveViewer(live.data, token);
    return {
      ok: true,
      data: { room: this.snapshot(live.data, viewer.role === 'host'), viewer },
    };
  }

  async deleteRoom(token: string | null): Promise<DoResult<{ deleted: true }>> {
    const live = await this.ensureLive();
    if (!live.ok) return live;
    const auth = await this.requireHost(live.data, token);
    if (!auth.ok) return auth;
    await this.expire('deleted');
    return { ok: true, data: { deleted: true } };
  }

  /** 参加登録。表示名の重複と人数上限をトランザクション内で検証する。 */
  async addPlayer(input: PlayerInputParsed): Promise<DoResult<JoinRoomResponse>> {
    const live = await this.ensureLive();
    if (!live.ok) return live;
    const room = live.data;
    if (room.status !== 'open') return fail(ERROR_CODES.ROOM_CLOSED, 409);

    const playerId = generatePlayerId();
    const editToken = generateToken();
    const editTokenHash = await this.hash(editToken);
    const now = Date.now();
    const normalized = normalizedKey(input.displayName);
    const eligibleRoles = sortRoles(input.eligibleRoles);

    const result = this.ctx.storage.transactionSync<DoResult<null>>(() => {
      const count = this.countPlayers();
      if (count >= MAX_PLAYERS) return fail(ERROR_CODES.ROOM_FULL, 409);
      const dup = this.sql
        .exec<{ id: string } & Record<string, SqlStorageValue>>(
          `SELECT id FROM players WHERE normalized_display_name = ?;`,
          normalized,
        )
        .toArray();
      if (dup.length > 0) return fail(ERROR_CODES.DUPLICATE_DISPLAY_NAME, 409);

      this.sql.exec(
        `INSERT INTO players
           (id, edit_token_hash, display_name, normalized_display_name,
            eligible_roles, role_preference_groups, role_ranks, active, joined_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?);`,
        playerId,
        editTokenHash,
        input.displayName,
        normalized,
        JSON.stringify(eligibleRoles),
        JSON.stringify(normalizePreferenceGroups(input.rolePreferenceGroups)),
        JSON.stringify(input.roleRanks),
        count + 1 <= REQUIRED_ACTIVE_PLAYERS ? 1 : 0,
        now,
        now,
      );
      this.normalizeActiveFlags();
      this.bumpVersion();
      return { ok: true, data: null };
    });
    if (!result.ok) return result;

    this.broadcast();
    const updated = this.loadRoom();
    if (!updated) return fail(ERROR_CODES.INTERNAL_ERROR, 500);
    return {
      ok: true,
      data: {
        playerId,
        editToken,
        room: this.snapshot(updated, false),
        viewer: { role: 'player', playerId },
      },
    };
  }

  /** 自分の登録内容を更新する（自分の編集トークンのみ許可） */
  async updatePlayer(
    playerId: string,
    token: string | null,
    input: PlayerInputParsed,
  ): Promise<DoResult<RoomStateResponse>> {
    const live = await this.ensureLive();
    if (!live.ok) return live;
    const room = live.data;
    if (!token) return fail(ERROR_CODES.UNAUTHORIZED, 401);

    const rows = this.sql
      .exec<PlayerRow>(`SELECT * FROM players WHERE id = ?;`, playerId)
      .toArray();
    const player = rows[0];
    if (!player) return fail(ERROR_CODES.PLAYER_NOT_FOUND, 404);

    // 本人の編集トークンに加えて、主催者も修正できる
    // （ランクの打ち間違いを本人が離席していても直せるようにするため）
    const hashed = await this.hash(token);
    const isSelf = timingSafeEqual(hashed, player.edit_token_hash);
    const isHost = room.host_token_hash !== null && timingSafeEqual(hashed, room.host_token_hash);
    if (!isSelf && !isHost) {
      return fail(ERROR_CODES.FORBIDDEN, 403);
    }

    const normalized = normalizedKey(input.displayName);
    const eligibleRoles = sortRoles(input.eligibleRoles);
    const now = Date.now();

    const result = this.ctx.storage.transactionSync<DoResult<null>>(() => {
      const dup = this.sql
        .exec<{ id: string } & Record<string, SqlStorageValue>>(
          `SELECT id FROM players WHERE normalized_display_name = ? AND id <> ?;`,
          normalized,
          playerId,
        )
        .toArray();
      if (dup.length > 0) return fail(ERROR_CODES.DUPLICATE_DISPLAY_NAME, 409);

      this.sql.exec(
        `UPDATE players
            SET display_name = ?, normalized_display_name = ?,
                eligible_roles = ?, role_preference_groups = ?, role_ranks = ?, updated_at = ?
          WHERE id = ?;`,
        input.displayName,
        normalized,
        JSON.stringify(eligibleRoles),
        JSON.stringify(normalizePreferenceGroups(input.rolePreferenceGroups)),
        JSON.stringify(input.roleRanks),
        now,
        playerId,
      );
      // 登録内容が変わったら確定済みチームと候補は無効化する
      this.sql.exec(`UPDATE room SET candidates = NULL;`);
      this.bumpVersion();
      return { ok: true, data: null };
    });
    if (!result.ok) return result;

    this.broadcast();
    const updated = this.loadRoom();
    if (!updated) return fail(ERROR_CODES.INTERNAL_ERROR, 500);
    return {
      ok: true,
      data: {
        room: this.snapshot(updated, isHost),
        viewer: isHost ? { role: 'host', playerId: null } : { role: 'player', playerId },
      },
    };
  }

  /** 辞退（本人）または参加者削除（主催者） */
  async removePlayer(playerId: string, token: string | null): Promise<DoResult<RoomStateResponse>> {
    const live = await this.ensureLive();
    if (!live.ok) return live;
    const room = live.data;
    if (!token) return fail(ERROR_CODES.UNAUTHORIZED, 401);

    const rows = this.sql
      .exec<PlayerRow>(`SELECT * FROM players WHERE id = ?;`, playerId)
      .toArray();
    const player = rows[0];
    if (!player) return fail(ERROR_CODES.PLAYER_NOT_FOUND, 404);

    const hashed = await this.hash(token);
    const isSelf = timingSafeEqual(hashed, player.edit_token_hash);
    const isHost = room.host_token_hash !== null && timingSafeEqual(hashed, room.host_token_hash);
    if (!isSelf && !isHost) return fail(ERROR_CODES.FORBIDDEN, 403);

    this.ctx.storage.transactionSync(() => {
      this.sql.exec(`DELETE FROM players WHERE id = ?;`, playerId);
      this.normalizeActiveFlags();
      this.sql.exec(`UPDATE room SET candidates = NULL;`);
      this.bumpVersion();
    });

    this.broadcast();
    const updated = this.loadRoom();
    if (!updated) return fail(ERROR_CODES.INTERNAL_ERROR, 500);
    const viewer: ViewerInfo = isHost
      ? { role: 'host', playerId: null }
      : { role: 'guest', playerId: null };
    return {
      ok: true,
      data: { room: this.snapshot(updated, viewer.role === 'host'), viewer },
    };
  }

  /** 募集状態の変更（主催者のみ） */
  async setStatus(
    token: string | null,
    status: RecruitStatus,
  ): Promise<DoResult<RoomStateResponse>> {
    const live = await this.ensureLive();
    if (!live.ok) return live;
    const auth = await this.requireHost(live.data, token);
    if (!auth.ok) return auth;

    this.ctx.storage.transactionSync(() => {
      this.sql.exec(`UPDATE room SET status = ?;`, status);
      this.bumpVersion();
    });
    this.broadcast();
    const updated = this.loadRoom();
    if (!updated) return fail(ERROR_CODES.INTERNAL_ERROR, 500);
    return {
      ok: true,
      data: { room: this.snapshot(updated, true), viewer: { role: 'host', playerId: null } },
    };
  }

  /** アクティブ参加者の選択（主催者のみ） */
  async setActivePlayers(
    token: string | null,
    playerIds: string[],
  ): Promise<DoResult<RoomStateResponse>> {
    const live = await this.ensureLive();
    if (!live.ok) return live;
    const auth = await this.requireHost(live.data, token);
    if (!auth.ok) return auth;

    const result = this.ctx.storage.transactionSync<DoResult<null>>(() => {
      const existing = new Set(this.loadPlayers().map((row) => row.id));
      for (const id of playerIds) {
        if (!existing.has(id)) {
          return fail(ERROR_CODES.PLAYER_NOT_FOUND, 404);
        }
      }
      this.sql.exec(`UPDATE players SET active = 0;`);
      for (const id of playerIds) {
        this.sql.exec(`UPDATE players SET active = 1 WHERE id = ?;`, id);
      }
      this.sql.exec(`UPDATE room SET candidates = NULL;`);
      this.bumpVersion();
      return { ok: true, data: null };
    });
    if (!result.ok) return result;

    this.broadcast();
    const updated = this.loadRoom();
    if (!updated) return fail(ERROR_CODES.INTERNAL_ERROR, 500);
    return {
      ok: true,
      data: { room: this.snapshot(updated, true), viewer: { role: 'host', playerId: null } },
    };
  }

  /** チーム候補の生成（主催者のみ） */
  async generateCandidates(
    token: string | null,
    locale: Locale = DEFAULT_LOCALE,
  ): Promise<DoResult<TeamCandidatesResponse>> {
    const live = await this.ensureLive();
    if (!live.ok) return live;
    const auth = await this.requireHost(live.data, token);
    if (!auth.ok) return auth;

    const activePlayers = this.loadPlayers()
      .filter((row) => row.active === 1)
      .map((row) => this.toPlayerPublic(row));

    if (activePlayers.length !== REQUIRED_ACTIVE_PLAYERS) {
      return fail(
        ERROR_CODES.ACTIVE_COUNT_INVALID,
        409,
        getMessages(locale).balance.playerCountMismatch(
          REQUIRED_ACTIVE_PLAYERS,
          activePlayers.length,
        ),
      );
    }

    const balanceInput = toBalancePlayers(activePlayers);

    const balanced = generateTeamCandidates(balanceInput, getMessages(locale));
    if (!balanced.ok) {
      return fail(ERROR_CODES.NO_VALID_LINEUP, 409, balanced.message, balanced.reasons);
    }

    this.ctx.storage.transactionSync(() => {
      this.sql.exec(`UPDATE room SET candidates = ?;`, JSON.stringify(balanced.candidates));
      this.bumpVersion();
    });
    this.broadcast();

    const updated = this.loadRoom();
    if (!updated) return fail(ERROR_CODES.INTERNAL_ERROR, 500);
    return {
      ok: true,
      data: {
        candidates: balanced.candidates,
        room: this.snapshot(updated, true),
        viewer: { role: 'host', playerId: null },
      },
    };
  }

  /** チーム確定（主催者のみ） */
  async selectCandidate(
    token: string | null,
    candidateId: string,
  ): Promise<DoResult<RoomStateResponse>> {
    const live = await this.ensureLive();
    if (!live.ok) return live;
    const auth = await this.requireHost(live.data, token);
    if (!auth.ok) return auth;

    const candidates = this.parseCandidates(live.data.candidates);
    if (!candidates || candidates.length === 0) {
      return fail(ERROR_CODES.CANDIDATES_NOT_GENERATED, 409);
    }
    const chosen = candidates.find((candidate) => candidate.id === candidateId);
    if (!chosen) return fail(ERROR_CODES.CANDIDATE_NOT_FOUND, 404);

    this.ctx.storage.transactionSync(() => {
      this.sql.exec(`UPDATE room SET selected_candidate = ?;`, JSON.stringify(chosen));
      this.bumpVersion();
    });
    this.broadcast();

    const updated = this.loadRoom();
    if (!updated) return fail(ERROR_CODES.INTERNAL_ERROR, 500);
    return {
      ok: true,
      data: { room: this.snapshot(updated, true), viewer: { role: 'host', playerId: null } },
    };
  }

  /**
   * 主催者が手動調整した編成を確定する（主催者のみ）。
   * クライアントの申告は信用せず、サーバー側で同じ関数を使って検証・採点する。
   */
  async selectLineup(
    token: string | null,
    lineup: LineupSlot[],
    locale: Locale = DEFAULT_LOCALE,
  ): Promise<DoResult<RoomStateResponse>> {
    const live = await this.ensureLive();
    if (!live.ok) return live;
    const auth = await this.requireHost(live.data, token);
    if (!auth.ok) return auth;

    const activePlayers = this.loadPlayers()
      .filter((row) => row.active === 1)
      .map((row) => this.toPlayerPublic(row));
    if (activePlayers.length !== REQUIRED_ACTIVE_PLAYERS) {
      return fail(
        ERROR_CODES.ACTIVE_COUNT_INVALID,
        409,
        getMessages(locale).balance.playerCountMismatch(
          REQUIRED_ACTIVE_PLAYERS,
          activePlayers.length,
        ),
      );
    }

    const evaluated = evaluateLineup(toBalancePlayers(activePlayers), lineup, getMessages(locale));
    if (!evaluated.ok) {
      return fail(ERROR_CODES.VALIDATION_ERROR, 400, evaluated.message, evaluated.reasons);
    }

    this.ctx.storage.transactionSync(() => {
      this.sql.exec(`UPDATE room SET selected_candidate = ?;`, JSON.stringify(evaluated.candidate));
      this.bumpVersion();
    });
    this.broadcast();

    const updated = this.loadRoom();
    if (!updated) return fail(ERROR_CODES.INTERNAL_ERROR, 500);
    return {
      ok: true,
      data: { room: this.snapshot(updated, true), viewer: { role: 'host', playerId: null } },
    };
  }

  /* ---------------- キャプテンドラフト ---------------- */

  /** アクティブ参加者を取得し、10人でなければエラーを返す */
  private requireActiveRoster(locale: Locale): DoResult<PlayerPublic[]> {
    const activePlayers = this.loadPlayers()
      .filter((row) => row.active === 1)
      .map((row) => this.toPlayerPublic(row));
    if (activePlayers.length !== REQUIRED_ACTIVE_PLAYERS) {
      return fail(
        ERROR_CODES.ACTIVE_COUNT_INVALID,
        409,
        getMessages(locale).balance.playerCountMismatch(
          REQUIRED_ACTIVE_PLAYERS,
          activePlayers.length,
        ),
      );
    }
    return { ok: true, data: activePlayers };
  }

  /** ドラフト開始（主催者のみ） */
  async startDraft(
    token: string | null,
    captainA: { playerId: string; role: Role },
    captainB: { playerId: string; role: Role },
    locale: Locale = DEFAULT_LOCALE,
  ): Promise<DoResult<RoomStateResponse>> {
    const live = await this.ensureLive();
    if (!live.ok) return live;
    const auth = await this.requireHost(live.data, token);
    if (!auth.ok) return auth;

    const roster = this.requireActiveRoster(locale);
    if (!roster.ok) return roster;

    const started = startDraft(roster.data, captainA, captainB, getMessages(locale));
    if (!started.ok) return fail(ERROR_CODES.VALIDATION_ERROR, 400, started.message);

    this.ctx.storage.transactionSync(() => {
      // ドラフトを始めたら自動生成の候補と確定は破棄する
      this.sql.exec(
        `UPDATE room SET draft = ?, candidates = NULL, selected_candidate = NULL;`,
        JSON.stringify(started.value),
      );
      this.bumpVersion();
    });
    this.broadcast();
    return this.hostStateResponse();
  }

  /**
   * ドラフトでの指名。
   * 手番のキャプテン本人（編集トークン）か、主催者が代理で実行できる。
   */
  async draftPick(
    token: string | null,
    pick: { playerId: string; role: Role },
    locale: Locale = DEFAULT_LOCALE,
  ): Promise<DoResult<RoomStateResponse>> {
    const live = await this.ensureLive();
    if (!live.ok) return live;
    const room = live.data;
    if (!token) return fail(ERROR_CODES.UNAUTHORIZED, 401);

    const draft = this.parseDraft(room.draft);
    if (!draft || draft.status !== 'active') {
      return fail(ERROR_CODES.DRAFT_NOT_ACTIVE, 409);
    }
    const roster = this.requireActiveRoster(locale);
    if (!roster.ok) return roster;

    const turn = currentTurn(draft);
    if (!turn) return fail(ERROR_CODES.DRAFT_NOT_ACTIVE, 409);

    // 手番のキャプテン本人か主催者かを確認する
    const viewer = await this.resolveViewer(room, token);
    const isHost = viewer.role === 'host';
    const isCurrentCaptain = viewer.role === 'player' && viewer.playerId === draft.captains[turn];
    if (!isHost && !isCurrentCaptain) {
      return fail(ERROR_CODES.NOT_YOUR_TURN, 403, getMessages(locale).draftLogic.notYourTurn);
    }

    const applied = applyPick(draft, roster.data, pick, getMessages(locale));
    if (!applied.ok) return fail(ERROR_CODES.VALIDATION_ERROR, 400, applied.message);

    const next = applied.value;
    // 全員決まったら、そのままチームとして確定する
    let selected: TeamCandidate | null = null;
    if (next.status === 'completed') {
      const evaluated = evaluateLineup(
        toBalancePlayers(roster.data),
        draftToLineup(next),
        getMessages(locale),
      );
      if (!evaluated.ok) {
        return fail(ERROR_CODES.VALIDATION_ERROR, 400, evaluated.message, evaluated.reasons);
      }
      selected = evaluated.candidate;
    }

    this.ctx.storage.transactionSync(() => {
      if (selected) {
        this.sql.exec(
          `UPDATE room SET draft = ?, selected_candidate = ?;`,
          JSON.stringify(next),
          JSON.stringify(selected),
        );
      } else {
        this.sql.exec(`UPDATE room SET draft = ?;`, JSON.stringify(next));
      }
      this.bumpVersion();
    });
    this.broadcast();

    const updated = this.loadRoom();
    if (!updated) return fail(ERROR_CODES.INTERNAL_ERROR, 500);
    return {
      ok: true,
      data: { room: this.snapshot(updated, isHost), viewer },
    };
  }

  /** ドラフトを中止する（主催者のみ） */
  async cancelDraft(token: string | null): Promise<DoResult<RoomStateResponse>> {
    const live = await this.ensureLive();
    if (!live.ok) return live;
    const auth = await this.requireHost(live.data, token);
    if (!auth.ok) return auth;

    this.ctx.storage.transactionSync(() => {
      this.sql.exec(`UPDATE room SET draft = NULL;`);
      this.bumpVersion();
    });
    this.broadcast();
    return this.hostStateResponse();
  }

  /** 主催者向けの現在状態を返す */
  private hostStateResponse(): DoResult<RoomStateResponse> {
    const updated = this.loadRoom();
    if (!updated) return fail(ERROR_CODES.INTERNAL_ERROR, 500);
    return {
      ok: true,
      data: { room: this.snapshot(updated, true), viewer: { role: 'host', playerId: null } },
    };
  }

  /** 確定解除（主催者のみ） */
  async clearSelectedCandidate(token: string | null): Promise<DoResult<RoomStateResponse>> {
    const live = await this.ensureLive();
    if (!live.ok) return live;
    const auth = await this.requireHost(live.data, token);
    if (!auth.ok) return auth;

    this.ctx.storage.transactionSync(() => {
      this.sql.exec(`UPDATE room SET selected_candidate = NULL;`);
      this.bumpVersion();
    });
    this.broadcast();

    const updated = this.loadRoom();
    if (!updated) return fail(ERROR_CODES.INTERNAL_ERROR, 500);
    return {
      ok: true,
      data: { room: this.snapshot(updated, true), viewer: { role: 'host', playerId: null } },
    };
  }

  /** テスト用: 有効期限を強制的に過去へ設定する（Alarm 再実行の検証に使用） */
  async debugForceExpiry(): Promise<void> {
    const room = this.loadRoom();
    if (!room) return;
    this.sql.exec(`UPDATE room SET expires_at = ?;`, Date.now() - 1000);
  }
}
