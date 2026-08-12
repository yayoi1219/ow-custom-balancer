import { describe, expect, it } from 'vitest';
import {
  evaluateLineup,
  generateTeamCandidates,
  type BalancePlayer,
  type LineupSlot,
} from '../src/shared/balancer';
import { REQUIRED_ACTIVE_PLAYERS, type Role } from '../src/shared/constants';
import { lineupFromCandidate, swapLineupSlots } from '../src/shared/lineup';

function player(id: string, roles: Role[], rank: number): BalancePlayer {
  const roleRanks: Partial<Record<Role, number>> = {};
  for (const role of roles) roleRanks[role] = rank;
  return {
    id,
    displayName: id,
    eligibleRoles: roles,
    rolePreferenceGroups: [roles],
    roleRanks,
  };
}

/** Tank2 / Damage4 / Support4 がちょうど揃う10人 */
function roster(): BalancePlayer[] {
  return [
    player('t1', ['tank'], 30),
    player('t2', ['tank'], 20),
    player('d1', ['damage'], 28),
    player('d2', ['damage'], 22),
    player('d3', ['damage'], 18),
    player('d4', ['damage'], 12),
    player('s1', ['support'], 26),
    player('s2', ['support'], 24),
    player('s3', ['support'], 16),
    player('s4', ['support'], 10),
  ];
}

function baseLineup(): LineupSlot[] {
  return [
    { playerId: 't1', role: 'tank', team: 'A' },
    { playerId: 'd1', role: 'damage', team: 'A' },
    { playerId: 'd4', role: 'damage', team: 'A' },
    { playerId: 's1', role: 'support', team: 'A' },
    { playerId: 's4', role: 'support', team: 'A' },
    { playerId: 't2', role: 'tank', team: 'B' },
    { playerId: 'd2', role: 'damage', team: 'B' },
    { playerId: 'd3', role: 'damage', team: 'B' },
    { playerId: 's2', role: 'support', team: 'B' },
    { playerId: 's3', role: 'support', team: 'B' },
  ];
}

describe('編成の手動調整', () => {
  it('有効な編成を自動生成と同じ計算式で採点する', () => {
    const result = evaluateLineup(roster(), baseLineup());
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const c = result.candidate;
    // A: 30+28+12+26+10 = 106 / B: 20+22+18+24+16 = 100
    expect(c.teamA.totalRank).toBe(106);
    expect(c.teamB.totalRank).toBe(100);
    expect(c.totalRankDiff).toBe(6);
    expect(c.tankRankDiff).toBe(10);
    expect(c.preferencePenalty).toBe(0);
  });

  it('自動生成した候補をそのまま評価すると同じ指標になる', () => {
    const generated = generateTeamCandidates(roster());
    expect(generated.ok).toBe(true);
    if (!generated.ok) return;
    const best = generated.candidates[0];
    const result = evaluateLineup(roster(), lineupFromCandidate(best));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.candidate.score).toBe(best.score);
    expect(result.candidate.totalRankDiff).toBe(best.totalRankDiff);
    expect(result.candidate.positionalRankDiff).toBe(best.positionalRankDiff);
    expect(result.candidate.id).toBe(best.id);
  });

  it('入れ替えでロール枠の人数が崩れない', () => {
    const swapped = swapLineupSlots(baseLineup(), 't1', 't2');
    const result = evaluateLineup(roster(), swapped);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    for (const team of [result.candidate.teamA, result.candidate.teamB]) {
      expect(team.players.filter((p) => p.role === 'tank')).toHaveLength(1);
      expect(team.players.filter((p) => p.role === 'damage')).toHaveLength(2);
      expect(team.players.filter((p) => p.role === 'support')).toHaveLength(2);
    }
    // Tank を入れ替えたので合計も入れ替わる
    expect(result.candidate.teamA.totalRank).toBe(96);
    expect(result.candidate.teamB.totalRank).toBe(110);
  });

  it('同じチーム内でロールをまたぐ入れ替えも枠を保つ', () => {
    // どちらのロールも担当できる2人を用意する
    const players = roster();
    players[2] = player('d1', ['damage', 'support'], 28);
    players[6] = player('s1', ['support', 'damage'], 26);
    const swapped = swapLineupSlots(baseLineup(), 'd1', 's1');
    const result = evaluateLineup(players, swapped);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const assigned = [...result.candidate.teamA.players, ...result.candidate.teamB.players];
    expect(assigned.find((p) => p.playerId === 'd1')?.role).toBe('support');
    expect(assigned.find((p) => p.playerId === 's1')?.role).toBe('damage');
  });

  it('担当できないロールへの割り当ては拒否する', () => {
    // t1 は tank しかできないのに damage 枠へ置く
    const invalid = baseLineup().map((slot) =>
      slot.playerId === 't1' ? { ...slot, role: 'damage' as Role } : slot,
    );
    const result = evaluateLineup(roster(), invalid);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.message).toContain('t1');
    expect(result.message).toContain('Damage');
  });

  it('ロール枠の人数が合わない編成は拒否する', () => {
    // Team A の Tank を2人にする
    const invalid = baseLineup().map((slot) =>
      slot.playerId === 't2' ? { ...slot, team: 'A' as const } : slot,
    );
    const result = evaluateLineup(roster(), invalid);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reasons.join(' ')).toContain('Tank');
  });

  it('人数が足りない編成は拒否する', () => {
    const result = evaluateLineup(roster(), baseLineup().slice(0, 9));
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.message).toContain(`${REQUIRED_ACTIVE_PLAYERS}人`);
  });

  it('同じ参加者が重複する編成は拒否する', () => {
    const invalid = baseLineup().map((slot, index) =>
      index === 9 ? { ...slot, playerId: 's2' } : slot,
    );
    const result = evaluateLineup(roster(), invalid);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.message).toContain('重複');
  });

  it('参加者以外を含む編成は拒否する', () => {
    const invalid = baseLineup().map((slot, index) =>
      index === 0 ? { ...slot, playerId: 'stranger' } : slot,
    );
    const result = evaluateLineup(roster(), invalid);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.message).toContain('参加者以外');
  });

  it('候補と編成データの相互変換が往復する', () => {
    const generated = generateTeamCandidates(roster());
    expect(generated.ok).toBe(true);
    if (!generated.ok) return;
    const lineup = lineupFromCandidate(generated.candidates[0]);
    expect(lineup).toHaveLength(REQUIRED_ACTIVE_PLAYERS);
    expect(lineup.filter((slot) => slot.team === 'A')).toHaveLength(5);
    expect(lineup.filter((slot) => slot.team === 'B')).toHaveLength(5);
  });
});
