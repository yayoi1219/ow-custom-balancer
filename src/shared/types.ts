/** フロントエンド・Worker・Durable Object で共有するドメイン型とAPI型。 */

import type { Role, RoleExperience } from './constants';
import type { PreferenceGroups } from './preferences';
import type { RankValue } from './ranks';

/** 部屋の状態 */
export type RoomStatus = 'open' | 'closed' | 'expired' | 'deleted';

/** 主催者が切り替えられる募集状態 */
export type RecruitStatus = Extract<RoomStatus, 'open' | 'closed'>;

/** 参加可能ロールごとのランク */
export type RoleRanks = Partial<Record<Role, RankValue>>;

/** 参加者の公開情報（トークン等の秘密情報は含まない） */
export interface PlayerPublic {
  id: string;
  displayName: string;
  eligibleRoles: Role[];
  /** 希望順位。同じグループ内のロールは同順位（どちらでもよい）。 */
  rolePreferenceGroups: PreferenceGroups;
  roleRanks: RoleRanks;
  active: boolean;
  /** ISO 8601 (UTC) */
  joinedAt: string;
  /** ISO 8601 (UTC) */
  updatedAt: string;
}

/** チーム候補の中の1人分の割り当て */
export interface AssignedPlayer {
  playerId: string;
  displayName: string;
  role: Role;
  /** 割り当てロールでのランクスコア(0-39) */
  rankScore: number;
  /** そのランクが本人の推定値（未計測）かどうか */
  rankEstimated?: boolean;
  /** チーム分けの評価に使った内部レート */
  rating?: number;
  /** そのロールのプレイ歴（自己申告） */
  experience?: RoleExperience;
  /** 第何希望か（1始まり）。希望外の場合は 0 */
  preferenceRank: number;
  /** この割り当てによるペナルティ */
  preferencePenalty: number;
}

export interface TeamComposition {
  players: AssignedPlayer[];
  /** チーム合計ランクスコア */
  totalRank: number;
}

export type TeamSide = 'A' | 'B';

export interface TeamCandidate {
  /** 候補の安定ID（同じ構成なら常に同じ値） */
  id: string;
  teamA: TeamComposition;
  teamB: TeamComposition;
  /** 総合スコア（低いほど良い） */
  score: number;
  totalRankDiff: number;
  tankRankDiff: number;
  damageAvgDiff: number;
  supportAvgDiff: number;
  /** 上位者の偏り（各チームをランク降順に並べ、順位ごとに比較した差の合計） */
  positionalRankDiff: number;
  preferencePenalty: number;
}

/** 閲覧者の権限 */
export type ViewerRole = 'host' | 'player' | 'guest';

export interface ViewerInfo {
  role: ViewerRole;
  /** 参加者として認証されている場合の自分のID */
  playerId: string | null;
}

/** 全員に配信する部屋のスナップショット */
export interface RoomSnapshot {
  id: string;
  title: string;
  status: RoomStatus;
  /** ISO 8601 (UTC) */
  createdAt: string;
  /** ISO 8601 (UTC) */
  expiresAt: string;
  /** 変更のたびに増加する。古い更新の適用を防ぐ。 */
  version: number;
  players: PlayerPublic[];
  selectedCandidate: TeamCandidate | null;
  /** 主催者にのみ渡されるチーム候補一覧 */
  candidates: TeamCandidate[] | null;
}

export interface RoomStateResponse {
  room: RoomSnapshot;
  viewer: ViewerInfo;
}

export interface CreateRoomResponse {
  roomId: string;
  hostToken: string;
  room: RoomSnapshot;
}

export interface JoinRoomResponse {
  playerId: string;
  editToken: string;
  room: RoomSnapshot;
  viewer: ViewerInfo;
}

export interface TeamCandidatesResponse {
  candidates: TeamCandidate[];
  room: RoomSnapshot;
  viewer: ViewerInfo;
}

export interface PublicConfig {
  serviceName: string;
  turnstileSiteKey: string;
}

/** 参加登録／更新の入力 */
export interface PlayerInput {
  displayName: string;
  eligibleRoles: Role[];
  rolePreferenceGroups: PreferenceGroups;
  roleRanks: RoleRanks;
}

/* ---------------- WebSocket メッセージ ---------------- */

export type ClientMessage =
  { type: 'auth'; token: string } | { type: 'refresh' } | { type: 'ping' };

export type ServerMessage =
  | { type: 'snapshot'; room: RoomSnapshot; viewer: ViewerInfo }
  | { type: 'expired'; roomId: string }
  | { type: 'pong' }
  | { type: 'error'; code: string; message: string };
