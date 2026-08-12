/**
 * チーム分けロジック（UI・ストレージから独立した純粋関数）。
 *
 * 10人を Tank×2 / Damage×4 / Support×4 に割り当て、
 * さらに各チーム Tank×1 / Damage×2 / Support×2 へ分割した候補を評価する。
 */

import {
  BALANCE_WEIGHTS,
  MAX_CANDIDATES,
  PREFERENCE_PENALTIES,
  PREFERENCE_PENALTY_FALLBACK,
  REQUIRED_ACTIVE_PLAYERS,
  ROLES,
  ROLE_LABELS,
  TEAM_ROLE_SLOTS,
  TOTAL_ROLE_SLOTS,
  type Role,
  type RoleExperience,
} from './constants';
import { preferenceIndexOf, type PreferenceGroups } from './preferences';
import { MAX_RANK_SCORE, MIN_RANK_SCORE } from './ranks';
import type { AssignedPlayer, TeamCandidate, TeamComposition } from './types';

/** チーム分けへ渡す1人分の入力。ランクは 0〜39 のスコア。 */
export interface BalancePlayer {
  id: string;
  displayName: string;
  eligibleRoles: Role[];
  /** 希望順位グループ。同じグループ内は同順位。eligibleRoles と同じ集合であること。 */
  rolePreferenceGroups: PreferenceGroups;
  /** eligibleRoles に含まれるロールのランクスコア（表示用） */
  roleRanks: Partial<Record<Role, number>>;
  /**
   * 評価に使う内部レート。省略時は roleRanks をそのまま使う。
   * ランク + プレイ歴から算出した値を渡す。
   */
  roleRatings?: Partial<Record<Role, number>>;
  /** ランクが本人の推定値（未計測）かどうか。表示にのみ使う。 */
  estimatedRanks?: Partial<Record<Role, boolean>>;
  /** ロールごとのプレイ歴（自己申告）。表示にのみ使う。 */
  roleExperiences?: Partial<Record<Role, RoleExperience>>;
}

export type BalanceFailureCode = 'INVALID_INPUT' | 'NO_VALID_LINEUP';

export type BalanceResult =
  | { ok: true; candidates: TeamCandidate[] }
  | { ok: false; code: BalanceFailureCode; message: string; reasons: string[] };

/** 4人から2人を選ぶ組み合わせ（残り2人が相手チーム） */
const PAIRS_OF_FOUR: ReadonlyArray<readonly [number, number]> = [
  [0, 1],
  [0, 2],
  [0, 3],
  [1, 2],
  [1, 3],
  [2, 3],
];

/** ロール部分集合（Hallの条件による枝刈りに使用） */
const ROLE_SUBSETS: ReadonlyArray<ReadonlyArray<Role>> = [
  ['tank'],
  ['damage'],
  ['support'],
  ['tank', 'damage'],
  ['tank', 'support'],
  ['damage', 'support'],
  ['tank', 'damage', 'support'],
];

/** 希望順位（0始まり）からペナルティを求める */
export function preferencePenaltyFor(preferenceIndex: number): number {
  if (preferenceIndex < 0) return PREFERENCE_PENALTY_FALLBACK;
  return PREFERENCE_PENALTIES[preferenceIndex] ?? PREFERENCE_PENALTY_FALLBACK;
}

/** 文字列から決定的な短いIDを作る（FNV-1a 32bit） */
function stableHash(input: string): string {
  let hash = 0x811c9dc5;
  for (let i = 0; i < input.length; i += 1) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash.toString(16).padStart(8, '0');
}

/** 入力の妥当性チェック。UI 以前にロジック側でも必ず検証する。 */
function validateInput(players: BalancePlayer[]): string[] {
  const reasons: string[] = [];
  if (players.length !== REQUIRED_ACTIVE_PLAYERS) {
    reasons.push(
      `チーム分けにはちょうど${REQUIRED_ACTIVE_PLAYERS}人が必要です（現在${players.length}人）。`,
    );
    return reasons;
  }
  const ids = new Set<string>();
  for (const player of players) {
    if (ids.has(player.id)) {
      reasons.push('参加者IDが重複しています。');
      break;
    }
    ids.add(player.id);
  }
  for (const player of players) {
    if (player.eligibleRoles.length === 0) {
      reasons.push(`${player.displayName} の参加可能ロールが設定されていません。`);
      continue;
    }
    const unique = new Set(player.eligibleRoles);
    if (unique.size !== player.eligibleRoles.length) {
      reasons.push(`${player.displayName} の参加可能ロールが重複しています。`);
    }
    for (const role of player.eligibleRoles) {
      const rank = player.roleRanks[role];
      if (
        typeof rank !== 'number' ||
        !Number.isInteger(rank) ||
        rank < MIN_RANK_SCORE ||
        rank > MAX_RANK_SCORE
      ) {
        reasons.push(`${player.displayName} の ${ROLE_LABELS[role]} のランクが不正です。`);
      }
      if (preferenceIndexOf(player.rolePreferenceGroups, role) < 0) {
        reasons.push(
          `${player.displayName} の希望順位に ${ROLE_LABELS[role]} が含まれていません。`,
        );
      }
    }
  }
  return reasons;
}

/** ロール別の担当可能人数が足りているかを調べる */
function checkRoleSupply(players: BalancePlayer[]): string[] {
  const reasons: string[] = [];
  for (const role of ROLES) {
    const capable = players.filter((p) => p.eligibleRoles.includes(role)).length;
    const required = TOTAL_ROLE_SLOTS[role];
    if (capable < required) {
      reasons.push(
        `${ROLE_LABELS[role]}を担当可能な参加者が${required}人必要です（現在${capable}人）。`,
      );
    }
  }
  return reasons;
}

interface ScoredCandidate {
  key: string;
  score: number;
  totalRankDiff: number;
  tankRankDiff: number;
  damageAvgDiff: number;
  supportAvgDiff: number;
  positionalRankDiff: number;
  preferencePenalty: number;
  /** チームA/Bのプレイヤーインデックスとロール */
  teamA: Array<{ index: number; role: Role }>;
  teamB: Array<{ index: number; role: Role }>;
}

/** 候補の決定的な比較順序（スコア→ペナルティ→各差分→キー） */
function compareCandidates(a: ScoredCandidate, b: ScoredCandidate): number {
  if (a.score !== b.score) return a.score - b.score;
  if (a.preferencePenalty !== b.preferencePenalty) return a.preferencePenalty - b.preferencePenalty;
  if (a.totalRankDiff !== b.totalRankDiff) return a.totalRankDiff - b.totalRankDiff;
  if (a.tankRankDiff !== b.tankRankDiff) return a.tankRankDiff - b.tankRankDiff;
  if (a.damageAvgDiff !== b.damageAvgDiff) return a.damageAvgDiff - b.damageAvgDiff;
  if (a.supportAvgDiff !== b.supportAvgDiff) return a.supportAvgDiff - b.supportAvgDiff;
  if (a.positionalRankDiff !== b.positionalRankDiff)
    return a.positionalRankDiff - b.positionalRankDiff;
  return a.key < b.key ? -1 : a.key > b.key ? 1 : 0;
}

/**
 * バランスのよいチーム候補を最大 MAX_CANDIDATES 件生成する。
 * 同じ入力からは常に同じ順序の候補を返す。
 */
export function generateTeamCandidates(input: BalancePlayer[]): BalanceResult {
  const invalidReasons = validateInput(input);
  if (invalidReasons.length > 0) {
    return {
      ok: false,
      code: 'INVALID_INPUT',
      message: invalidReasons[0],
      reasons: invalidReasons,
    };
  }

  const supplyReasons = checkRoleSupply(input);
  if (supplyReasons.length > 0) {
    return {
      ok: false,
      code: 'NO_VALID_LINEUP',
      message: supplyReasons[0],
      reasons: supplyReasons,
    };
  }

  // 決定性を担保するため、参加者IDでソートしてから探索する
  const players = [...input].sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  const n = players.length;

  // 希望順位ペナルティを事前計算（ロール割り当てが決まれば分割に依存しない）
  const penaltyOf: Array<Partial<Record<Role, number>>> = players.map((player) => {
    const map: Partial<Record<Role, number>> = {};
    for (const role of player.eligibleRoles) {
      map[role] = preferencePenaltyFor(preferenceIndexOf(player.rolePreferenceGroups, role));
    }
    return map;
  });

  // suffixCount[s][i] = i 以降の参加者のうち、部分集合 s のいずれかを担当できる人数
  const suffixCount: number[][] = ROLE_SUBSETS.map(() => new Array<number>(n + 1).fill(0));
  for (let s = 0; s < ROLE_SUBSETS.length; s += 1) {
    const subset = ROLE_SUBSETS[s];
    for (let i = n - 1; i >= 0; i -= 1) {
      const canFill = subset.some((role) => players[i].eligibleRoles.includes(role));
      suffixCount[s][i] = suffixCount[s][i + 1] + (canFill ? 1 : 0);
    }
  }

  const remaining: Record<Role, number> = { ...TOTAL_ROLE_SLOTS };
  const roleOf = new Array<Role>(n);

  // 上位候補のみを保持する（重複判定も保持中の候補に対して行う）
  const top: ScoredCandidate[] = [];

  const pushCandidate = (candidate: ScoredCandidate): void => {
    if (top.length >= MAX_CANDIDATES) {
      const worst = top[top.length - 1];
      if (compareCandidates(candidate, worst) >= 0) return;
    }
    // 鏡像・同一構成の重複除外
    if (top.some((existing) => existing.key === candidate.key)) return;
    top.push(candidate);
    top.sort(compareCandidates);
    if (top.length > MAX_CANDIDATES) top.length = MAX_CANDIDATES;
  };

  const evaluateAssignment = (): void => {
    const tanks: number[] = [];
    const damages: number[] = [];
    const supports: number[] = [];
    let preferencePenalty = 0;
    for (let i = 0; i < n; i += 1) {
      const role = roleOf[i];
      preferencePenalty += penaltyOf[i][role] ?? PREFERENCE_PENALTY_FALLBACK;
      if (role === 'tank') tanks.push(i);
      else if (role === 'damage') damages.push(i);
      else supports.push(i);
    }

    // 評価はすべて内部レート（ランク + プレイ歴）で行う
    const rankAt = (index: number): number => {
      const player = players[index];
      const role = roleOf[index];
      return player.roleRatings?.[role] ?? player.roleRanks[role] ?? 0;
    };

    // Tank[0] を必ず Team A に置くことで、A/B を入れ替えただけの鏡像候補を生成しない
    const tankA = tanks[0];
    const tankB = tanks[1];
    const tankRankDiff = Math.abs(rankAt(tankA) - rankAt(tankB));

    for (const dmgPair of PAIRS_OF_FOUR) {
      const dmgA = [damages[dmgPair[0]], damages[dmgPair[1]]];
      const dmgB = damages.filter((idx) => !dmgA.includes(idx));
      const dmgSumA = rankAt(dmgA[0]) + rankAt(dmgA[1]);
      const dmgSumB = rankAt(dmgB[0]) + rankAt(dmgB[1]);
      const damageAvgDiff = Math.abs(dmgSumA - dmgSumB) / TEAM_ROLE_SLOTS.damage;

      for (const supPair of PAIRS_OF_FOUR) {
        const supA = [supports[supPair[0]], supports[supPair[1]]];
        const supB = supports.filter((idx) => !supA.includes(idx));
        const supSumA = rankAt(supA[0]) + rankAt(supA[1]);
        const supSumB = rankAt(supB[0]) + rankAt(supB[1]);
        const supportAvgDiff = Math.abs(supSumA - supSumB) / TEAM_ROLE_SLOTS.support;

        const totalA = rankAt(tankA) + dmgSumA + supSumA;
        const totalB = rankAt(tankB) + dmgSumB + supSumB;
        const totalRankDiff = Math.abs(totalA - totalB);

        // 上位者の偏り: 各チームをランク降順に並べ、1番手同士・2番手同士…を比較する。
        // 合計が同じでも上位者が片方へ固まっている編成はここで差が出る。
        const sortedA = [rankAt(tankA), ...dmgA.map(rankAt), ...supA.map(rankAt)].sort(
          (a, b) => b - a,
        );
        const sortedB = [rankAt(tankB), ...dmgB.map(rankAt), ...supB.map(rankAt)].sort(
          (a, b) => b - a,
        );
        let positionalRankDiff = 0;
        for (let slot = 0; slot < sortedA.length; slot += 1) {
          positionalRankDiff += Math.abs(sortedA[slot] - sortedB[slot]);
        }

        const score =
          BALANCE_WEIGHTS.totalRankDiff * totalRankDiff +
          BALANCE_WEIGHTS.tankRankDiff * tankRankDiff +
          BALANCE_WEIGHTS.damageAvgDiff * damageAvgDiff +
          BALANCE_WEIGHTS.supportAvgDiff * supportAvgDiff +
          BALANCE_WEIGHTS.positionalRankDiff * positionalRankDiff +
          preferencePenalty;

        // 上位候補に入らないものはキー生成すら行わない（無駄な計算を避ける）
        if (top.length >= MAX_CANDIDATES && score > top[top.length - 1].score) continue;

        const teamA = [
          { index: tankA, role: 'tank' as Role },
          ...dmgA.map((index) => ({ index, role: 'damage' as Role })),
          ...supA.map((index) => ({ index, role: 'support' as Role })),
        ];
        const teamB = [
          { index: tankB, role: 'tank' as Role },
          ...dmgB.map((index) => ({ index, role: 'damage' as Role })),
          ...supB.map((index) => ({ index, role: 'support' as Role })),
        ];

        pushCandidate({
          key: canonicalKey(players, teamA, teamB),
          score,
          totalRankDiff,
          tankRankDiff,
          damageAvgDiff,
          supportAvgDiff,
          positionalRankDiff,
          preferencePenalty,
          teamA,
          teamB,
        });
      }
    }
  };

  const assign = (i: number): void => {
    // Hall の条件による枝刈り: 残り枠を埋められる人数が足りなければ打ち切る
    for (let s = 0; s < ROLE_SUBSETS.length; s += 1) {
      let need = 0;
      for (const role of ROLE_SUBSETS[s]) need += remaining[role];
      if (need > suffixCount[s][i]) return;
    }
    if (i === n) {
      evaluateAssignment();
      return;
    }
    for (const role of ROLES) {
      if (remaining[role] === 0) continue;
      if (!players[i].eligibleRoles.includes(role)) continue;
      remaining[role] -= 1;
      roleOf[i] = role;
      assign(i + 1);
      remaining[role] += 1;
    }
  };

  assign(0);

  if (top.length === 0) {
    const message = '現在の希望ロールでは有効な構成を作れません。';
    return { ok: false, code: 'NO_VALID_LINEUP', message, reasons: [message] };
  }

  const candidates = top.map((candidate) => toTeamCandidate(players, penaltyOf, candidate));
  return { ok: true, candidates };
}

/** チーム構成から鏡像を区別しない一意キーを作る */
function canonicalKey(
  players: BalancePlayer[],
  teamA: Array<{ index: number; role: Role }>,
  teamB: Array<{ index: number; role: Role }>,
): string {
  const sideKey = (team: Array<{ index: number; role: Role }>): string =>
    ROLES.map(
      (role) =>
        `${role}:${team
          .filter((slot) => slot.role === role)
          .map((slot) => players[slot.index].id)
          .sort()
          .join(',')}`,
    ).join('|');
  const keyA = sideKey(teamA);
  const keyB = sideKey(teamB);
  return keyA <= keyB ? `${keyA}#${keyB}` : `${keyB}#${keyA}`;
}

function toTeamCandidate(
  players: BalancePlayer[],
  penaltyOf: Array<Partial<Record<Role, number>>>,
  candidate: ScoredCandidate,
): TeamCandidate {
  const build = (team: Array<{ index: number; role: Role }>): TeamComposition => {
    const assigned: AssignedPlayer[] = team.map((slot) => {
      const player = players[slot.index];
      const preferenceIndex = preferenceIndexOf(player.rolePreferenceGroups, slot.role);
      return {
        playerId: player.id,
        displayName: player.displayName,
        role: slot.role,
        rankScore: player.roleRanks[slot.role] ?? 0,
        rating: player.roleRatings?.[slot.role] ?? player.roleRanks[slot.role] ?? 0,
        rankEstimated: player.estimatedRanks?.[slot.role] === true,
        experience: player.roleExperiences?.[slot.role],
        preferenceRank: preferenceIndex >= 0 ? preferenceIndex + 1 : 0,
        preferencePenalty: penaltyOf[slot.index][slot.role] ?? PREFERENCE_PENALTY_FALLBACK,
      };
    });
    // 表示順を Tank → Damage → Support に固定
    assigned.sort((a, b) => {
      const roleDiff = ROLES.indexOf(a.role) - ROLES.indexOf(b.role);
      if (roleDiff !== 0) return roleDiff;
      const ratingA = a.rating ?? a.rankScore;
      const ratingB = b.rating ?? b.rankScore;
      if (ratingA !== ratingB) return ratingB - ratingA;
      return a.playerId < b.playerId ? -1 : 1;
    });
    return {
      players: assigned,
      // 表示する合計もチーム分けに使った内部レートの合計に揃える
      totalRank: assigned.reduce((sum, player) => sum + (player.rating ?? player.rankScore), 0),
    };
  };

  return {
    id: stableHash(candidate.key),
    teamA: build(candidate.teamA),
    teamB: build(candidate.teamB),
    score: candidate.score,
    totalRankDiff: candidate.totalRankDiff,
    tankRankDiff: candidate.tankRankDiff,
    damageAvgDiff: candidate.damageAvgDiff,
    supportAvgDiff: candidate.supportAvgDiff,
    positionalRankDiff: candidate.positionalRankDiff,
    preferencePenalty: candidate.preferencePenalty,
  };
}
