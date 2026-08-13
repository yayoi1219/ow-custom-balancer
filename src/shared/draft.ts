/**
 * キャプテンドラフト。
 *
 * 主催者が2人のキャプテンとその担当ロールを決め、
 * 残り8人をスネークドラフト（A B B A A B B A）でキャプテン自身が交互に指名する。
 *
 * 各チームは Tank×1 / Damage×2 / Support×2 を満たす必要があるため、
 * 「指名した結果、残りの人では枠を埋められない」状態にならないよう
 * 毎回の指名で実行可能性（Hallの条件）を検証する。
 */

import type { LineupSlot } from './balancer';
import { ROLES, TEAM_ROLE_SLOTS, type Role } from './constants';
import { ja, type Messages } from './i18n/ja';
import type { DraftPick, DraftState, PlayerPublic, TeamSide } from './types';

/**
 * キャプテンを除く8人の指名順（スネークドラフト）。
 * 先手の有利を打ち消すため、2巡目以降は順序を折り返す。
 */
export const DRAFT_PICK_ORDER: readonly TeamSide[] = ['A', 'B', 'B', 'A', 'A', 'B', 'B', 'A'];

/** ロール部分集合（実行可能性の判定に使う） */
const ROLE_SUBSETS: ReadonlyArray<ReadonlyArray<Role>> = [
  ['tank'],
  ['damage'],
  ['support'],
  ['tank', 'damage'],
  ['tank', 'support'],
  ['damage', 'support'],
  ['tank', 'damage', 'support'],
];

export type DraftResult<T> = { ok: true; value: T } | { ok: false; message: string };

/** 次に指名する側。完了していれば null。 */
export function currentTurn(draft: DraftState): TeamSide | null {
  if (draft.status !== 'active') return null;
  return draft.order[0] ?? null;
}

/** まだ指名されていない参加者 */
export function remainingPlayers(draft: DraftState, players: PlayerPublic[]): PlayerPublic[] {
  const picked = new Set(draft.picks.map((pick) => pick.playerId));
  return players.filter((player) => !picked.has(player.id));
}

/** そのチームで、まだ空いているロール枠の数 */
export function openSlots(draft: DraftState, team: TeamSide): Record<Role, number> {
  const open = {} as Record<Role, number>;
  for (const role of ROLES) {
    const used = draft.picks.filter((pick) => pick.team === team && pick.role === role).length;
    open[role] = TEAM_ROLE_SLOTS[role] - used;
  }
  return open;
}

/**
 * 残りの参加者で、残りの枠をすべて埋められるか（Hallの条件）。
 * 片方のチームだけで判定すると破綻を見逃すため、両チームの空き枠を合算して判定する。
 */
function canFillRemaining(draft: DraftState, players: PlayerPublic[]): boolean {
  const openA = openSlots(draft, 'A');
  const openB = openSlots(draft, 'B');
  const needed = {} as Record<Role, number>;
  for (const role of ROLES) needed[role] = openA[role] + openB[role];

  const pool = remainingPlayers(draft, players);
  for (const subset of ROLE_SUBSETS) {
    let need = 0;
    for (const role of subset) need += needed[role];
    const capable = pool.filter((player) =>
      subset.some((role) => player.eligibleRoles.includes(role)),
    ).length;
    if (need > capable) return false;
  }
  return true;
}

/** ドラフトを開始する（キャプテン2人と、その担当ロールを決める） */
export function startDraft(
  players: PlayerPublic[],
  captainA: { playerId: string; role: Role },
  captainB: { playerId: string; role: Role },
  messages: Messages = ja,
): DraftResult<DraftState> {
  const byId = new Map(players.map((player) => [player.id, player]));
  for (const captain of [captainA, captainB]) {
    const player = byId.get(captain.playerId);
    if (!player) return { ok: false, message: messages.draftLogic.captainNotFound };
    if (!player.eligibleRoles.includes(captain.role)) {
      return {
        ok: false,
        message: messages.balance.cannotPlayRole(player.displayName, messages.roles[captain.role]),
      };
    }
  }
  if (captainA.playerId === captainB.playerId) {
    return { ok: false, message: messages.draftLogic.captainsMustDiffer };
  }

  const draft: DraftState = {
    status: 'active',
    captains: { A: captainA.playerId, B: captainB.playerId },
    picks: [
      { playerId: captainA.playerId, role: captainA.role, team: 'A' },
      { playerId: captainB.playerId, role: captainB.role, team: 'B' },
    ],
    order: [...DRAFT_PICK_ORDER],
  };

  if (!canFillRemaining(draft, players)) {
    return {
      ok: false,
      message: messages.draftLogic.captainRoleInfeasible,
    };
  }
  return { ok: true, value: draft };
}

/** 1人指名する */
export function applyPick(
  draft: DraftState,
  players: PlayerPublic[],
  pick: { playerId: string; role: Role },
  messages: Messages = ja,
): DraftResult<DraftState> {
  if (draft.status !== 'active') {
    return { ok: false, message: messages.draftLogic.alreadyFinished };
  }
  const team = currentTurn(draft);
  if (!team) return { ok: false, message: messages.draftLogic.alreadyFinished };

  const player = players.find((entry) => entry.id === pick.playerId);
  if (!player) return { ok: false, message: messages.draftLogic.playerNotFound };
  if (draft.picks.some((entry) => entry.playerId === pick.playerId)) {
    return { ok: false, message: messages.draftLogic.alreadyPicked(player.displayName) };
  }
  if (!player.eligibleRoles.includes(pick.role)) {
    return {
      ok: false,
      message: messages.balance.cannotPlayRole(player.displayName, messages.roles[pick.role]),
    };
  }
  if (openSlots(draft, team)[pick.role] <= 0) {
    return {
      ok: false,
      message: messages.draftLogic.slotFull(team, messages.roles[pick.role]),
    };
  }

  const nextPicks: DraftPick[] = [...draft.picks, { ...pick, team }];
  const nextOrder = draft.order.slice(1);
  const next: DraftState = {
    ...draft,
    picks: nextPicks,
    order: nextOrder,
    status: nextOrder.length === 0 ? 'completed' : 'active',
  };

  // この指名によって残りの枠が埋められなくなる場合は受け付けない
  if (next.status === 'active' && !canFillRemaining(next, players)) {
    return {
      ok: false,
      message: messages.draftLogic.wouldBreakLineup(player.displayName, messages.roles[pick.role]),
    };
  }
  return { ok: true, value: next };
}

/** ドラフト結果を編成データへ変換する */
export function draftToLineup(draft: DraftState): LineupSlot[] {
  return draft.picks.map((pick) => ({
    playerId: pick.playerId,
    role: pick.role,
    team: pick.team,
  }));
}

/**
 * その参加者を指名できるロールの一覧（現在の手番のチームで）。
 * UI で選べるロールを絞るために使う。
 */
export function pickableRoles(
  draft: DraftState,
  players: PlayerPublic[],
  playerId: string,
): Role[] {
  const team = currentTurn(draft);
  if (!team) return [];
  const player = players.find((entry) => entry.id === playerId);
  if (!player) return [];
  return player.eligibleRoles.filter((role) => applyPick(draft, players, { playerId, role }).ok);
}
