import type { RoleExperience } from './constants';

/**
 * Overwatch 2 の競技ランクと、チーム分けで使う連続整数スコアの相互変換。
 *
 * ティアは Bronze 〜 Champion の9段（Platinum と Diamond の間に Emerald）。
 * Bronze 〜 Grandmaster は各5ディビジョン（5が最下位、1が最上位）で、
 * **Champion のみディビジョンを持たない**。
 *
 *   Bronze 5      = 0
 *   Bronze 1      = 4
 *   Silver 5      = 5
 *   ...（Platinum の次は Emerald）
 *   Grandmaster 1 = 39
 *   Champion      = 40
 */

export const RANK_TIERS = [
  'bronze',
  'silver',
  'gold',
  'platinum',
  'emerald',
  'diamond',
  'master',
  'grandmaster',
  'champion',
] as const;

export type RankTier = (typeof RANK_TIERS)[number];

export const RANK_TIER_LABELS: Record<RankTier, string> = {
  bronze: 'Bronze',
  silver: 'Silver',
  gold: 'Gold',
  platinum: 'Platinum',
  emerald: 'Emerald',
  diamond: 'Diamond',
  master: 'Master',
  grandmaster: 'Grandmaster',
  champion: 'Champion',
};

/** 各ティアの短縮表記（一覧表示用） */
export const RANK_TIER_SHORT_LABELS: Record<RankTier, string> = {
  bronze: 'BRZ',
  silver: 'SLV',
  gold: 'GLD',
  platinum: 'PLT',
  emerald: 'EMR',
  diamond: 'DIA',
  master: 'MAS',
  grandmaster: 'GM',
  champion: 'CHM',
};

/**
 * ティアごとのディビジョン数。
 * Champion は 0（ディビジョンなし）で、ティア全体が1段として扱われる。
 */
export const TIER_DIVISION_COUNT: Record<RankTier, number> = {
  bronze: 5,
  silver: 5,
  gold: 5,
  platinum: 5,
  emerald: 5,
  diamond: 5,
  master: 5,
  grandmaster: 5,
  champion: 0,
};

/** ディビジョンを持つティアの選択肢（5が最下位、1が最上位） */
export const RANK_DIVISIONS = [5, 4, 3, 2, 1] as const;
export type RankDivision = (typeof RANK_DIVISIONS)[number];

/** そのティアがディビジョンを持つか */
export function tierHasDivisions(tier: RankTier): boolean {
  return TIER_DIVISION_COUNT[tier] > 0;
}

/** ティアごとのスコア開始位置（累積オフセット） */
const TIER_OFFSETS: Record<RankTier, number> = (() => {
  const offsets = {} as Record<RankTier, number>;
  let cursor = 0;
  for (const tier of RANK_TIERS) {
    offsets[tier] = cursor;
    // ディビジョンなしのティアも1段分は占める
    cursor += Math.max(1, TIER_DIVISION_COUNT[tier]);
  }
  return offsets;
})();

/** 取り得るランクスコアの最小値/最大値 */
export const MIN_RANK_SCORE = 0;
export const MAX_RANK_SCORE = (() => {
  const last = RANK_TIERS[RANK_TIERS.length - 1];
  return TIER_OFFSETS[last] + Math.max(1, TIER_DIVISION_COUNT[last]) - 1;
})();

export interface RankValue {
  tier: RankTier;
  /** ディビジョンを持つティアでは必須、Champion では指定しない */
  division?: number;
  /** 未計測で、本人が推定した値であることを示す */
  estimated?: boolean;
  /** そのロールのプレイ歴（自己申告）。内部レートの推定に使う。 */
  experience?: RoleExperience;
}

/** ランクを連続整数へ変換する */
export function rankToScore(rank: RankValue): number {
  const offset = TIER_OFFSETS[rank.tier];
  if (offset === undefined) {
    throw new Error(`unknown rank tier: ${String(rank.tier)}`);
  }
  const divisions = TIER_DIVISION_COUNT[rank.tier];
  if (divisions === 0) {
    // Champion はディビジョンを持たないので、指定されていても無視する
    return offset;
  }
  const division = rank.division;
  if (
    !Number.isInteger(division) ||
    division === undefined ||
    division < 1 ||
    division > divisions
  ) {
    throw new Error(`invalid rank division: ${String(rank.division)}`);
  }
  return offset + (divisions - division);
}

/** 連続整数からランクへ戻す */
export function scoreToRank(score: number): RankValue {
  if (!Number.isInteger(score) || score < MIN_RANK_SCORE || score > MAX_RANK_SCORE) {
    throw new Error(`invalid rank score: ${String(score)}`);
  }
  for (const tier of RANK_TIERS) {
    const offset = TIER_OFFSETS[tier];
    const divisions = TIER_DIVISION_COUNT[tier];
    const size = Math.max(1, divisions);
    if (score < offset + size) {
      if (divisions === 0) return { tier };
      return { tier, division: divisions - (score - offset) };
    }
  }
  throw new Error(`invalid rank score: ${String(score)}`);
}

/** 「Diamond 3」「Champion」のような表示文字列を作る */
export function formatRank(rank: RankValue): string {
  const label = RANK_TIER_LABELS[rank.tier];
  if (!tierHasDivisions(rank.tier)) return label;
  return `${label} ${String(rank.division)}`;
}

/** 「DIA3」「CHM」のような短縮表示 */
export function formatRankShort(rank: RankValue): string {
  const label = RANK_TIER_SHORT_LABELS[rank.tier];
  if (!tierHasDivisions(rank.tier)) return label;
  return `${label}${String(rank.division)}`;
}

/** スコアから直接表示文字列を作る */
export function formatRankScore(score: number): string {
  return formatRank(scoreToRank(score));
}

/**
 * 旧仕様で保存された値を現行仕様へ寄せる。
 *  - 旧称 "ultimate"（Ultimate Champion）は現在の "champion"
 *  - ディビジョンを持たないティアに付いているディビジョンは削除
 *  - ディビジョンを持つティアにディビジョンが無ければ最下位を補う
 */
export function normalizeLegacyRank(value: unknown): RankValue | null {
  if (typeof value !== 'object' || value === null) return null;
  const raw = value as {
    tier?: unknown;
    division?: unknown;
    estimated?: unknown;
    experience?: unknown;
  };
  const tierName = raw.tier === 'ultimate' ? 'champion' : raw.tier;
  if (typeof tierName !== 'string') return null;
  if (!(RANK_TIERS as readonly string[]).includes(tierName)) return null;
  const tier = tierName as RankTier;

  const result: RankValue = { tier };
  if (tierHasDivisions(tier)) {
    const divisions = TIER_DIVISION_COUNT[tier];
    const division = typeof raw.division === 'number' ? raw.division : divisions;
    result.division = Math.min(divisions, Math.max(1, Math.round(division)));
  }
  if (raw.estimated === true) result.estimated = true;
  if (typeof raw.experience === 'string') {
    result.experience = raw.experience as RoleExperience;
  }
  return result;
}
