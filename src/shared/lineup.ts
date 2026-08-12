/**
 * 参加者情報とチーム分け入力の変換。
 *
 * サーバー（Durable Object）とクライアント（手動調整UI）の双方が
 * 同じ関数を使うことで、画面に出る指標とサーバーの検証結果がずれないようにする。
 */

import type { LineupSlot, BalancePlayer } from './balancer';
import type { Role, RoleExperience } from './constants';
import { computeRating } from './rating';
import type { PlayerPublic, TeamCandidate } from './types';

/** 参加者の公開情報から、チーム分けの入力（内部レート込み）を作る */
export function toBalancePlayers(players: PlayerPublic[]): BalancePlayer[] {
  return players.map((player) => {
    const roleRanks: Partial<Record<Role, number>> = {};
    const roleRatings: Partial<Record<Role, number>> = {};
    const estimatedRanks: Partial<Record<Role, boolean>> = {};
    const roleExperiences: Partial<Record<Role, RoleExperience>> = {};
    for (const role of player.eligibleRoles) {
      const rank = player.roleRanks[role];
      if (!rank) continue;
      // ランク + プレイ歴から内部レートを求める
      const rating = computeRating({ rank, experience: rank.experience });
      roleRanks[role] = rating.rankScore;
      roleRatings[role] = rating.rating;
      if (rank.estimated) estimatedRanks[role] = true;
      if (rank.experience) roleExperiences[role] = rank.experience;
    }
    return {
      id: player.id,
      displayName: player.displayName,
      eligibleRoles: player.eligibleRoles,
      rolePreferenceGroups: player.rolePreferenceGroups,
      roleRanks,
      roleRatings,
      estimatedRanks,
      roleExperiences,
    };
  });
}

/** チーム候補から、手動調整に使う編成データへ変換する */
export function lineupFromCandidate(candidate: TeamCandidate): LineupSlot[] {
  return [
    ...candidate.teamA.players.map((player) => ({
      playerId: player.playerId,
      role: player.role,
      team: 'A' as const,
    })),
    ...candidate.teamB.players.map((player) => ({
      playerId: player.playerId,
      role: player.role,
      team: 'B' as const,
    })),
  ];
}

/**
 * 2人の配置を入れ替えた編成を返す。
 * ロールと所属チームの両方を交換するので、ロール枠の人数は必ず保たれる。
 */
export function swapLineupSlots(
  lineup: LineupSlot[],
  firstPlayerId: string,
  secondPlayerId: string,
): LineupSlot[] {
  const first = lineup.find((slot) => slot.playerId === firstPlayerId);
  const second = lineup.find((slot) => slot.playerId === secondPlayerId);
  if (!first || !second) return lineup;
  return lineup.map((slot) => {
    if (slot.playerId === firstPlayerId) {
      return { playerId: slot.playerId, role: second.role, team: second.team };
    }
    if (slot.playerId === secondPlayerId) {
      return { playerId: slot.playerId, role: first.role, team: first.team };
    }
    return slot;
  });
}
