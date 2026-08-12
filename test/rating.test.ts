import { describe, expect, it } from 'vitest';
import { generateTeamCandidates, type BalancePlayer } from '../src/shared/balancer';
import { EXPERIENCE_ADJUSTMENT, REQUIRED_ACTIVE_PLAYERS, type Role } from '../src/shared/constants';
import { MAX_RANK_SCORE, rankToScore } from '../src/shared/ranks';
import { computeRating } from '../src/shared/rating';

describe('内部レートの算出', () => {
  it('実測ランクならプレイ歴で補正しない', () => {
    const result = computeRating({
      rank: { tier: 'diamond', division: 3 },
      experience: 'rare',
    });
    expect(result.rankScore).toBe(rankToScore({ tier: 'diamond', division: 3 }));
    expect(result.adjustment).toBe(0);
    expect(result.rating).toBe(result.rankScore);
  });

  it('未計測（推定）ならプレイ歴で下方修正する', () => {
    const base = rankToScore({ tier: 'diamond', division: 3 });
    for (const experience of ['main', 'sub', 'rare'] as const) {
      const result = computeRating({
        rank: { tier: 'diamond', division: 3, estimated: true },
        experience,
      });
      expect(result.rankScore).toBe(base);
      expect(result.adjustment).toBe(EXPERIENCE_ADJUSTMENT[experience]);
      expect(result.rating).toBe(base + EXPERIENCE_ADJUSTMENT[experience]);
    }
  });

  it('補正しても取り得る範囲を超えない', () => {
    const low = computeRating({
      rank: { tier: 'bronze', division: 5, estimated: true },
      experience: 'rare',
    });
    expect(low.rating).toBe(0);

    const high = computeRating({ rank: { tier: 'champion' } });
    expect(high.rating).toBe(MAX_RANK_SCORE);
  });

  it('プレイ歴の指定が無ければ補正しない', () => {
    const result = computeRating({ rank: { tier: 'gold', division: 3, estimated: true } });
    expect(result.adjustment).toBe(0);
  });
});

describe('チーム分けは内部レートで評価する', () => {
  /** 全員が別ロール専任の10人。1人だけレートを差し替えられる。 */
  function roster(
    overrides: Partial<Record<string, Partial<BalancePlayer>>> = {},
  ): BalancePlayer[] {
    const spec: Array<[string, Role]> = [
      ['t1', 'tank'],
      ['t2', 'tank'],
      ['d1', 'damage'],
      ['d2', 'damage'],
      ['d3', 'damage'],
      ['d4', 'damage'],
      ['s1', 'support'],
      ['s2', 'support'],
      ['s3', 'support'],
      ['s4', 'support'],
    ];
    return spec.map(([id, role]) => ({
      id,
      displayName: id,
      eligibleRoles: [role],
      rolePreferenceGroups: [[role]],
      roleRanks: { [role]: 20 },
      ...overrides[id],
    }));
  }

  it('roleRatings があればそちらで評価し、表示は元のランクを保つ', () => {
    // t1 は表示上 Diamond 相当(20)だが、内部レートは 15 として扱う
    const players = roster({
      t1: { roleRanks: { tank: 20 }, roleRatings: { tank: 15 } },
    });
    const result = generateTeamCandidates(players);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const best = result.candidates[0];
    const t1 = [...best.teamA.players, ...best.teamB.players].find((p) => p.playerId === 't1');
    // 表示用のランクは入力どおり
    expect(t1?.rankScore).toBe(20);
    // 評価に使われた内部レートは補正後
    expect(t1?.rating).toBe(15);
    // Tank 差は内部レート基準（15 vs 20 = 5）
    expect(best.tankRankDiff).toBe(5);
  });

  it('roleRatings を省略した場合は roleRanks をそのまま使う', () => {
    const result = generateTeamCandidates(roster());
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const best = result.candidates[0];
    expect(best.score).toBe(0);
    for (const assigned of [...best.teamA.players, ...best.teamB.players]) {
      expect(assigned.rating).toBe(assigned.rankScore);
    }
  });

  it('チーム合計は内部レートの合計になる', () => {
    const players = roster({
      t1: { roleRanks: { tank: 20 }, roleRatings: { tank: 15 } },
    });
    const result = generateTeamCandidates(players);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const best = result.candidates[0];
    const totals = [best.teamA, best.teamB].map((team) => team.totalRank);
    // 10人中1人だけ 20→15 なので、合計は 100 と 95 になる
    expect(totals.sort((a, b) => a - b)).toEqual([95, 100]);
    expect(best.teamA.players.length + best.teamB.players.length).toBe(REQUIRED_ACTIVE_PLAYERS);
  });

  it('プレイ歴と推定フラグが割り当て結果へ引き継がれる', () => {
    const players = roster({
      d1: {
        roleRanks: { damage: 20 },
        roleRatings: { damage: 15 },
        estimatedRanks: { damage: true },
        roleExperiences: { damage: 'rare' },
      },
    });
    const result = generateTeamCandidates(players);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const best = result.candidates[0];
    const d1 = [...best.teamA.players, ...best.teamB.players].find((p) => p.playerId === 'd1');
    expect(d1?.rankEstimated).toBe(true);
    expect(d1?.experience).toBe('rare');
  });
});
