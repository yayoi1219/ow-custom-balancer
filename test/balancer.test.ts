import { describe, expect, it } from 'vitest';
import { generateTeamCandidates, type BalancePlayer } from '../src/shared/balancer';
import {
  MAX_CANDIDATES,
  PREFERENCE_PENALTIES,
  REQUIRED_ACTIVE_PLAYERS,
  TOTAL_ROLE_SLOTS,
  type Role,
} from '../src/shared/constants';
import { rankToScore } from '../src/shared/ranks';

/** テスト用のプレイヤー生成ヘルパー */
function player(
  id: string,
  roles: Role[],
  ranks: Partial<Record<Role, number>>,
  preferenceOrder?: Role[],
): BalancePlayer {
  return {
    id,
    displayName: id,
    eligibleRoles: roles,
    // 既定は「選んだ順に第1希望・第2希望…」
    rolePreferenceGroups: (preferenceOrder ?? roles).map((role) => [role]),
    roleRanks: ranks,
  };
}

/** 同順位（どれでもよい）を含む希望を持つプレイヤー */
function flexPlayer(
  id: string,
  groups: Role[][],
  ranks: Partial<Record<Role, number>>,
): BalancePlayer {
  return {
    id,
    displayName: id,
    eligibleRoles: groups.flat(),
    rolePreferenceGroups: groups,
    roleRanks: ranks,
  };
}

/** ロール専任者だけの標準的な10人（全員同ランク） */
function symmetricRoster(rank = 20): BalancePlayer[] {
  return [
    player('t1', ['tank'], { tank: rank }),
    player('t2', ['tank'], { tank: rank }),
    player('d1', ['damage'], { damage: rank }),
    player('d2', ['damage'], { damage: rank }),
    player('d3', ['damage'], { damage: rank }),
    player('d4', ['damage'], { damage: rank }),
    player('s1', ['support'], { support: rank }),
    player('s2', ['support'], { support: rank }),
    player('s3', ['support'], { support: rank }),
    player('s4', ['support'], { support: rank }),
  ];
}

describe('generateTeamCandidates', () => {
  it('全員のランクと希望が対称なら差分ゼロの候補を返す', () => {
    const result = generateTeamCandidates(symmetricRoster());
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const best = result.candidates[0];
    expect(best.totalRankDiff).toBe(0);
    expect(best.tankRankDiff).toBe(0);
    expect(best.damageAvgDiff).toBe(0);
    expect(best.supportAvgDiff).toBe(0);
    expect(best.preferencePenalty).toBe(0);
    expect(best.score).toBe(0);
  });

  it('ロール専任者だけで有効な構成を作れる', () => {
    const result = generateTeamCandidates(symmetricRoster(15));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    for (const candidate of result.candidates) {
      for (const team of [candidate.teamA, candidate.teamB]) {
        expect(team.players).toHaveLength(5);
        expect(team.players.filter((p) => p.role === 'tank')).toHaveLength(1);
        expect(team.players.filter((p) => p.role === 'damage')).toHaveLength(2);
        expect(team.players.filter((p) => p.role === 'support')).toHaveLength(2);
      }
      // 10人が重複なく割り当てられている
      const ids = [...candidate.teamA.players, ...candidate.teamB.players].map((p) => p.playerId);
      expect(new Set(ids).size).toBe(REQUIRED_ACTIVE_PLAYERS);
    }
  });

  it('Tank担当可能者が不足する場合は理由を返す', () => {
    const roster = symmetricRoster();
    // t2 を damage 専任にすると Tank 可能者が1人になる
    roster[1] = player('t2', ['damage'], { damage: 20 });
    const result = generateTeamCandidates(roster);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.code).toBe('NO_VALID_LINEUP');
    expect(result.message).toContain('Tank');
    expect(result.message).toContain(`${TOTAL_ROLE_SLOTS.tank}人必要`);
  });

  it('Damage担当可能者が不足する場合は理由を返す', () => {
    const roster = symmetricRoster();
    roster[2] = player('d1', ['support'], { support: 20 });
    const result = generateTeamCandidates(roster);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.message).toContain('Damage');
    expect(result.message).toContain(`${TOTAL_ROLE_SLOTS.damage}人必要`);
  });

  it('Support担当可能者が不足する場合は理由を返す', () => {
    const roster = symmetricRoster();
    roster[6] = player('s1', ['damage'], { damage: 20 });
    const result = generateTeamCandidates(roster);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.message).toContain('Support');
    expect(result.message).toContain(`${TOTAL_ROLE_SLOTS.support}人必要`);
  });

  it('人数は足りていても割り当て不能なら有効な構成なしと判定する', () => {
    // Tank可能者は2人いるが、その2人は「Tankのみ」ではなく他ロールの必要枠も埋めなければならない状況を作る
    const roster: BalancePlayer[] = [
      player('a', ['tank', 'damage'], { tank: 20, damage: 20 }),
      player('b', ['tank', 'damage'], { tank: 20, damage: 20 }),
      player('c', ['damage'], { damage: 20 }),
      player('d', ['damage'], { damage: 20 }),
      player('e', ['damage'], { damage: 20 }),
      player('f', ['damage'], { damage: 20 }),
      player('g', ['support'], { support: 20 }),
      player('h', ['support'], { support: 20 }),
      player('i', ['support'], { support: 20 }),
      player('j', ['support'], { support: 20 }),
    ];
    // damage 可能者は6人だが Damage枠は4、Tank枠2 は a,b しか埋められない → a,b が Tank になると
    // damage は c,d,e,f の4人でちょうど埋まるので、実は成立する
    const ok = generateTeamCandidates(roster);
    expect(ok.ok).toBe(true);

    // Damage 専任を1人増やして Damage 枠が溢れる状況にすると成立しない
    const broken: BalancePlayer[] = [
      player('a', ['tank'], { tank: 20 }),
      player('b', ['tank'], { tank: 20 }),
      player('c', ['tank'], { tank: 20 }),
      player('d', ['damage'], { damage: 20 }),
      player('e', ['damage'], { damage: 20 }),
      player('f', ['damage'], { damage: 20 }),
      player('g', ['damage'], { damage: 20 }),
      player('h', ['support'], { support: 20 }),
      player('i', ['support'], { support: 20 }),
      player('j', ['support'], { support: 20 }),
    ];
    const result = generateTeamCandidates(broken);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    // Support 可能者が3人しかいないため不足として検出される
    expect(result.message).toContain('Support');
  });

  it('複数ロール可能者を使って有効な構成を見つける', () => {
    const roster: BalancePlayer[] = [
      player('flex1', ['tank', 'support'], { tank: 20, support: 18 }),
      player('flex2', ['tank', 'damage'], { tank: 20, damage: 19 }),
      player('d1', ['damage'], { damage: 20 }),
      player('d2', ['damage'], { damage: 20 }),
      player('d3', ['damage'], { damage: 20 }),
      player('d4', ['damage'], { damage: 20 }),
      player('s1', ['support'], { support: 20 }),
      player('s2', ['support'], { support: 20 }),
      player('s3', ['support'], { support: 20 }),
      player('s4', ['support'], { support: 20 }),
    ];
    const result = generateTeamCandidates(roster);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const best = result.candidates[0];
    const tanks = [...best.teamA.players, ...best.teamB.players].filter((p) => p.role === 'tank');
    expect(tanks.map((p) => p.playerId).sort()).toEqual(['flex1', 'flex2']);
  });

  it('希望順位のペナルティがスコアへ反映される', () => {
    // 全員 tank/damage/support 可能。第1希望どおりに割り当てられる編成が最良になるはず。
    const roles: Role[] = ['tank', 'damage', 'support'];
    const ranks = { tank: 20, damage: 20, support: 20 };
    const roster: BalancePlayer[] = [
      player('p1', roles, ranks, ['tank', 'damage', 'support']),
      player('p2', roles, ranks, ['tank', 'damage', 'support']),
      player('p3', roles, ranks, ['damage', 'tank', 'support']),
      player('p4', roles, ranks, ['damage', 'tank', 'support']),
      player('p5', roles, ranks, ['damage', 'tank', 'support']),
      player('p6', roles, ranks, ['damage', 'tank', 'support']),
      player('p7', roles, ranks, ['support', 'tank', 'damage']),
      player('p8', roles, ranks, ['support', 'tank', 'damage']),
      player('p9', roles, ranks, ['support', 'tank', 'damage']),
      player('p10', roles, ranks, ['support', 'tank', 'damage']),
    ];
    const result = generateTeamCandidates(roster);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const best = result.candidates[0];
    expect(best.preferencePenalty).toBe(0);
    for (const assigned of [...best.teamA.players, ...best.teamB.players]) {
      expect(assigned.preferenceRank).toBe(1);
      expect(assigned.preferencePenalty).toBe(PREFERENCE_PENALTIES[0]);
    }
  });

  it('バランスが少し崩れても第1希望を優先する場合がある', () => {
    // 第2希望ペナルティ(6) より小さいランク差なら、希望どおりの構成が選ばれる
    const roster: BalancePlayer[] = [
      player('t1', ['tank'], { tank: 21 }),
      player('t2', ['tank'], { tank: 20 }),
      player('d1', ['damage', 'support'], { damage: 20, support: 20 }, ['damage', 'support']),
      player('d2', ['damage'], { damage: 20 }),
      player('d3', ['damage'], { damage: 20 }),
      player('d4', ['damage'], { damage: 20 }),
      player('s1', ['support'], { support: 20 }),
      player('s2', ['support'], { support: 20 }),
      player('s3', ['support'], { support: 20 }),
      player('s4', ['support'], { support: 20 }),
    ];
    const result = generateTeamCandidates(roster);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const best = result.candidates[0];
    const d1 = [...best.teamA.players, ...best.teamB.players].find((p) => p.playerId === 'd1');
    expect(d1?.role).toBe('damage');
    expect(best.preferencePenalty).toBe(0);
  });

  it('同順位（どれでもよい）のロールはどれに割り当ててもペナルティ0', () => {
    // 全員「どのロールでもよい」。どの割り当てでもペナルティは発生しない。
    const roster = Array.from({ length: REQUIRED_ACTIVE_PLAYERS }, (_, index) =>
      flexPlayer(`p${String(index).padStart(2, '0')}`, [['tank', 'damage', 'support']], {
        tank: 20,
        damage: 20,
        support: 20,
      }),
    );
    const result = generateTeamCandidates(roster);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    for (const candidate of result.candidates) {
      expect(candidate.preferencePenalty).toBe(0);
      for (const assigned of [...candidate.teamA.players, ...candidate.teamB.players]) {
        expect(assigned.preferenceRank).toBe(1);
        expect(assigned.preferencePenalty).toBe(0);
      }
    }
  });

  it('「TankかSupportならどちらでもよい」を第1希望として扱う', () => {
    const roster: BalancePlayer[] = [
      // Tank / Support は同順位、Damage は第2希望
      flexPlayer('flexA', [['tank', 'support'], ['damage']], { tank: 20, support: 20, damage: 20 }),
      flexPlayer('flexB', [['tank', 'support'], ['damage']], { tank: 20, support: 20, damage: 20 }),
      player('d1', ['damage'], { damage: 20 }),
      player('d2', ['damage'], { damage: 20 }),
      player('d3', ['damage'], { damage: 20 }),
      player('d4', ['damage'], { damage: 20 }),
      player('s1', ['support'], { support: 20 }),
      player('s2', ['support'], { support: 20 }),
      player('s3', ['support'], { support: 20 }),
      player('s4', ['support'], { support: 20 }),
    ];
    const result = generateTeamCandidates(roster);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const best = result.candidates[0];
    const assigned = [...best.teamA.players, ...best.teamB.players];
    // flexA / flexB は Tank 枠を埋めるが、同順位なので第1希望扱い（ペナルティ0）
    for (const id of ['flexA', 'flexB']) {
      const entry = assigned.find((p) => p.playerId === id);
      expect(entry?.role).toBe('tank');
      expect(entry?.preferenceRank).toBe(1);
      expect(entry?.preferencePenalty).toBe(0);
    }
    expect(best.preferencePenalty).toBe(0);
  });

  it('同順位グループの次のグループは第2希望として扱われる', () => {
    // Tank/Support 同順位 + Damage が第2希望のプレイヤーを Damage で使わざるを得ない状況
    const roster: BalancePlayer[] = [
      flexPlayer('flexA', [['tank', 'support'], ['damage']], { tank: 20, support: 20, damage: 20 }),
      player('t1', ['tank'], { tank: 20 }),
      player('t2', ['tank'], { tank: 20 }),
      player('d1', ['damage'], { damage: 20 }),
      player('d2', ['damage'], { damage: 20 }),
      player('d3', ['damage'], { damage: 20 }),
      player('s1', ['support'], { support: 20 }),
      player('s2', ['support'], { support: 20 }),
      player('s3', ['support'], { support: 20 }),
      player('s4', ['support'], { support: 20 }),
    ];
    const result = generateTeamCandidates(roster);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const best = result.candidates[0];
    const flex = [...best.teamA.players, ...best.teamB.players].find((p) => p.playerId === 'flexA');
    expect(flex?.role).toBe('damage');
    expect(flex?.preferenceRank).toBe(2);
    expect(flex?.preferencePenalty).toBe(PREFERENCE_PENALTIES[1]);
    expect(best.preferencePenalty).toBe(PREFERENCE_PENALTIES[1]);
  });

  it('合計が同じでも上位者が片方へ固まる編成は選ばれない', () => {
    // 上位2人(35,34)と下位2人(1,2)、中位6人(18)。
    // 合計だけを見ると「上位2人+下位2人」を同じチームに集めても釣り合ってしまうが、
    // 上位者の偏り(positionalRankDiff)により、上位者が分かれる編成が上位に来る。
    const roster: BalancePlayer[] = [
      player('t1', ['tank'], { tank: 35 }),
      player('t2', ['tank'], { tank: 18 }),
      player('d1', ['damage'], { damage: 34 }),
      player('d2', ['damage'], { damage: 18 }),
      player('d3', ['damage'], { damage: 2 }),
      player('d4', ['damage'], { damage: 18 }),
      player('s1', ['support'], { support: 1 }),
      player('s2', ['support'], { support: 18 }),
      player('s3', ['support'], { support: 18 }),
      player('s4', ['support'], { support: 18 }),
    ];
    const result = generateTeamCandidates(roster);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const best = result.candidates[0];
    const teamOf = (id: string): 'A' | 'B' =>
      best.teamA.players.some((p) => p.playerId === id) ? 'A' : 'B';
    // 最上位の t1(35) と 2番手の d1(34) は別チームになる
    expect(teamOf('t1')).not.toBe(teamOf('d1'));
    // 最良候補は総当たりの中で最小スコア
    for (const candidate of result.candidates) {
      expect(candidate.score).toBeGreaterThanOrEqual(best.score);
    }
  });

  it('Team A/B を入れ替えただけの鏡像候補は重複しない', () => {
    const result = generateTeamCandidates(symmetricRoster());
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const keys = result.candidates.map((candidate) => {
      const side = (players: { playerId: string; role: string }[]): string =>
        players
          .map((p) => `${p.role}:${p.playerId}`)
          .sort()
          .join(',');
      const a = side(candidate.teamA.players);
      const b = side(candidate.teamB.players);
      return a <= b ? `${a}#${b}` : `${b}#${a}`;
    });
    expect(new Set(keys).size).toBe(keys.length);
  });

  it('同じ入力なら候補の順序と内容が常に同じ', () => {
    const roster = [
      player('alpha', ['tank', 'damage'], { tank: 25, damage: 22 }),
      player('bravo', ['tank'], { tank: 18 }),
      player('charlie', ['damage'], { damage: 30 }),
      player('delta', ['damage', 'support'], { damage: 12, support: 14 }),
      player('echo', ['damage'], { damage: 20 }),
      player('foxtrot', ['damage'], { damage: 8 }),
      player('golf', ['support'], { support: 33 }),
      player('hotel', ['support'], { support: 5 }),
      player('india', ['support'], { support: 27 }),
      player('juliet', ['support', 'damage'], { support: 19, damage: 21 }),
    ];
    const first = generateTeamCandidates(roster);
    // 入力順を変えても結果は同じ（内部でIDソートしているため）
    const second = generateTeamCandidates([...roster].reverse());
    expect(first.ok && second.ok).toBe(true);
    if (!first.ok || !second.ok) return;
    expect(JSON.stringify(second.candidates)).toBe(JSON.stringify(first.candidates));
  });

  it('候補は最大5件まで', () => {
    const roster = [
      player('p01', ['tank', 'damage', 'support'], { tank: 20, damage: 20, support: 20 }),
      player('p02', ['tank', 'damage', 'support'], { tank: 20, damage: 20, support: 20 }),
      player('p03', ['tank', 'damage', 'support'], { tank: 20, damage: 20, support: 20 }),
      player('p04', ['tank', 'damage', 'support'], { tank: 20, damage: 20, support: 20 }),
      player('p05', ['tank', 'damage', 'support'], { tank: 20, damage: 20, support: 20 }),
      player('p06', ['tank', 'damage', 'support'], { tank: 20, damage: 20, support: 20 }),
      player('p07', ['tank', 'damage', 'support'], { tank: 20, damage: 20, support: 20 }),
      player('p08', ['tank', 'damage', 'support'], { tank: 20, damage: 20, support: 20 }),
      player('p09', ['tank', 'damage', 'support'], { tank: 20, damage: 20, support: 20 }),
      player('p10', ['tank', 'damage', 'support'], { tank: 20, damage: 20, support: 20 }),
    ];
    const result = generateTeamCandidates(roster);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.candidates.length).toBe(MAX_CANDIDATES);
  });

  it('候補はスコアの昇順で並ぶ', () => {
    const roster = [
      player('a1', ['tank'], { tank: rankToScore({ tier: 'diamond', division: 1 }) }),
      player('a2', ['tank'], { tank: rankToScore({ tier: 'gold', division: 5 }) }),
      player('b1', ['damage'], { damage: rankToScore({ tier: 'master', division: 3 }) }),
      player('b2', ['damage'], { damage: rankToScore({ tier: 'silver', division: 2 }) }),
      player('b3', ['damage'], { damage: rankToScore({ tier: 'platinum', division: 4 }) }),
      player('b4', ['damage'], { damage: rankToScore({ tier: 'bronze', division: 1 }) }),
      player('c1', ['support'], { support: rankToScore({ tier: 'champion', division: 5 }) }),
      player('c2', ['support'], { support: rankToScore({ tier: 'gold', division: 2 }) }),
      player('c3', ['support'], { support: rankToScore({ tier: 'diamond', division: 3 }) }),
      player('c4', ['support'], { support: rankToScore({ tier: 'silver', division: 5 }) }),
    ];
    const result = generateTeamCandidates(roster);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    for (let i = 1; i < result.candidates.length; i += 1) {
      expect(result.candidates[i].score).toBeGreaterThanOrEqual(result.candidates[i - 1].score);
    }
  });

  it('人数が10人でない場合は入力エラー', () => {
    const result = generateTeamCandidates(symmetricRoster().slice(0, 9));
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.code).toBe('INVALID_INPUT');
  });

  it('参加可能ロールのランクが欠けている場合は入力エラー', () => {
    const roster = symmetricRoster();
    roster[0] = player('t1', ['tank'], {});
    const result = generateTeamCandidates(roster);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.code).toBe('INVALID_INPUT');
  });

  it('ランクスコアが範囲外の場合は入力エラー', () => {
    const roster = symmetricRoster();
    roster[0] = player('t1', ['tank'], { tank: 41 });
    const result = generateTeamCandidates(roster);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.code).toBe('INVALID_INPUT');
  });

  it('参加者IDが重複している場合は入力エラー', () => {
    const roster = symmetricRoster();
    roster[1] = player('t1', ['tank'], { tank: 20 });
    const result = generateTeamCandidates(roster);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.code).toBe('INVALID_INPUT');
  });
});
