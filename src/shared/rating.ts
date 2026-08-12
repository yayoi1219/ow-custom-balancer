/**
 * 内部レートの算出。
 *
 * Overwatch 2 のランクを機械的に取得できる公式APIは存在せず、
 * 非公式APIはスクレイピングに依拠するため利用しない。
 * よって入力はすべて本人の自己申告（ランク + プレイ歴）とし、
 * そこからチーム分けに使う内部レートをこちら側で推定する。
 *
 *   内部レート = ランクスコア + プレイ歴補正
 *
 * 実測ランクがある場合は、ランク自体がそのロールの実力を表しているため補正しない。
 * 未計測（推定申告）の場合のみ、プレイ歴で下方修正して過大評価を防ぐ。
 */

import {
  APPLY_EXPERIENCE_ADJUSTMENT_ONLY_WHEN_ESTIMATED,
  EXPERIENCE_ADJUSTMENT,
  type RoleExperience,
} from './constants';
import { MAX_RANK_SCORE, MIN_RANK_SCORE, rankToScore, type RankValue } from './ranks';

export interface RatingInput {
  rank: RankValue;
  experience?: RoleExperience;
}

export interface RatingResult {
  /** 表示用のランクスコア（本人が入力したまま） */
  rankScore: number;
  /** チーム分けの評価に使う内部レート */
  rating: number;
  /** 適用された補正値（0なら補正なし） */
  adjustment: number;
}

function clamp(value: number): number {
  return Math.min(MAX_RANK_SCORE, Math.max(MIN_RANK_SCORE, value));
}

/** ランクとプレイ歴から内部レートを求める */
export function computeRating(input: RatingInput): RatingResult {
  const rankScore = rankToScore(input.rank);
  const estimated = input.rank.estimated === true;
  const shouldAdjust = APPLY_EXPERIENCE_ADJUSTMENT_ONLY_WHEN_ESTIMATED ? estimated : true;
  const adjustment = shouldAdjust && input.experience ? EXPERIENCE_ADJUSTMENT[input.experience] : 0;
  return {
    rankScore,
    rating: clamp(rankScore + adjustment),
    adjustment,
  };
}
