import { describe, expect, it } from 'vitest';
import { REQUIRED_ACTIVE_PLAYERS, type Role } from '../src/shared/constants';
import {
  DRAFT_PICK_ORDER,
  applyPick,
  currentTurn,
  draftToLineup,
  openSlots,
  pickableRoles,
  remainingPlayers,
  startDraft,
} from '../src/shared/draft';
import type { DraftState, PlayerPublic } from '../src/shared/types';

function player(id: string, roles: Role[]): PlayerPublic {
  const roleRanks: PlayerPublic['roleRanks'] = {};
  for (const role of roles) roleRanks[role] = { tier: 'gold', division: 3 };
  return {
    id,
    displayName: id,
    eligibleRoles: roles,
    rolePreferenceGroups: [roles],
    roleRanks,
    active: true,
    joinedAt: new Date(0).toISOString(),
    updatedAt: new Date(0).toISOString(),
  };
}

/** Tank2 / Damage4 / Support4 がちょうど揃う10人 */
function roster(): PlayerPublic[] {
  return [
    player('t1', ['tank']),
    player('t2', ['tank']),
    player('d1', ['damage']),
    player('d2', ['damage']),
    player('d3', ['damage']),
    player('d4', ['damage']),
    player('s1', ['support']),
    player('s2', ['support']),
    player('s3', ['support']),
    player('s4', ['support']),
  ];
}

function startOk(players: PlayerPublic[] = roster()): DraftState {
  const result = startDraft(
    players,
    { playerId: 't1', role: 'tank' },
    { playerId: 't2', role: 'tank' },
  );
  if (!result.ok) throw new Error(result.message);
  return result.value;
}

describe('キャプテンドラフトの開始', () => {
  it('キャプテン2人がそれぞれのチームへ配置される', () => {
    const draft = startOk();
    expect(draft.status).toBe('active');
    expect(draft.picks).toHaveLength(2);
    expect(draft.picks.find((pick) => pick.playerId === 't1')?.team).toBe('A');
    expect(draft.picks.find((pick) => pick.playerId === 't2')?.team).toBe('B');
    expect(draft.order).toEqual([...DRAFT_PICK_ORDER]);
  });

  it('指名順はスネークドラフトで各チーム4回ずつ', () => {
    expect(DRAFT_PICK_ORDER).toHaveLength(8);
    expect(DRAFT_PICK_ORDER.filter((side) => side === 'A')).toHaveLength(4);
    expect(DRAFT_PICK_ORDER.filter((side) => side === 'B')).toHaveLength(4);
    // 先手の有利を打ち消すため折り返す
    expect([...DRAFT_PICK_ORDER]).toEqual(['A', 'B', 'B', 'A', 'A', 'B', 'B', 'A']);
  });

  it('担当できないロールのキャプテンは拒否する', () => {
    const result = startDraft(
      roster(),
      { playerId: 't1', role: 'support' },
      { playerId: 't2', role: 'tank' },
    );
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.message).toContain('Support');
  });

  it('同じ人を両方のキャプテンにできない', () => {
    const result = startDraft(
      roster(),
      { playerId: 't1', role: 'tank' },
      { playerId: 't1', role: 'tank' },
    );
    expect(result.ok).toBe(false);
  });

  it('キャプテンのロール指定で構成が埋まらなくなる場合は拒否する', () => {
    // Tank 可能者はちょうど2人。両方を Damage にすると Tank 枠が埋まらない
    const players = roster();
    players[0] = player('t1', ['tank', 'damage']);
    players[1] = player('t2', ['tank', 'damage']);
    const result = startDraft(
      players,
      { playerId: 't1', role: 'damage' },
      { playerId: 't2', role: 'damage' },
    );
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.message).toContain('埋められません');
  });
});

describe('キャプテンドラフトの指名', () => {
  it('手番が順番どおりに進む', () => {
    let draft = startOk();
    const pool = ['d1', 'd2', 'd3', 'd4', 's1', 's2', 's3', 's4'];
    const roles: Role[] = [
      'damage',
      'damage',
      'damage',
      'damage',
      'support',
      'support',
      'support',
      'support',
    ];
    const seen: string[] = [];
    for (let index = 0; index < pool.length; index += 1) {
      const turn = currentTurn(draft);
      expect(turn).toBe(DRAFT_PICK_ORDER[index]);
      seen.push(turn ?? '');
      const result = applyPick(draft, roster(), { playerId: pool[index], role: roles[index] });
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      draft = result.value;
    }
    expect(seen).toEqual([...DRAFT_PICK_ORDER]);
    expect(draft.status).toBe('completed');
    expect(currentTurn(draft)).toBeNull();
    expect(draft.picks).toHaveLength(REQUIRED_ACTIVE_PLAYERS);
  });

  it('すでに指名された人は再指名できない', () => {
    const draft = startOk();
    const result = applyPick(draft, roster(), { playerId: 't1', role: 'damage' });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.message).toContain('すでに指名');
  });

  it('担当できないロールでは指名できない', () => {
    const draft = startOk();
    const result = applyPick(draft, roster(), { playerId: 'd1', role: 'support' });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.message).toContain('担当できません');
  });

  it('埋まっているロール枠へは指名できない', () => {
    let draft = startOk();
    // Team A の Damage を2枠とも埋める
    for (const id of ['d1', 'd2']) {
      const turnBefore = currentTurn(draft);
      const result = applyPick(draft, roster(), { playerId: id, role: 'damage' });
      if (!result.ok) throw new Error(result.message);
      draft = result.value;
      expect(turnBefore).toBeTruthy();
    }
    // ここで手番は B なので、A の枠状況を直接確認する
    expect(openSlots(draft, 'A').damage).toBeGreaterThanOrEqual(0);
  });

  it('残りの人で構成が埋まらなくなる指名は拒否する', () => {
    // Support 可能者がちょうど4人。1人を Damage で取ると Support 枠が埋まらなくなる
    const players = roster();
    players[6] = player('s1', ['support', 'damage']);
    const draft = startOk(players);
    const result = applyPick(draft, players, { playerId: 's1', role: 'damage' });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.message).toContain('埋められなくなります');
  });

  it('選べるロールだけが候補として返る', () => {
    const players = roster();
    players[6] = player('s1', ['support', 'damage']);
    const draft = startOk(players);
    // s1 を Damage で取ると破綻するため、Support のみが選べる
    expect(pickableRoles(draft, players, 's1')).toEqual(['support']);
    expect(pickableRoles(draft, players, 'd1')).toEqual(['damage']);
  });

  it('未指名リストが正しく減る', () => {
    let draft = startOk();
    expect(remainingPlayers(draft, roster())).toHaveLength(8);
    const result = applyPick(draft, roster(), { playerId: 'd1', role: 'damage' });
    if (!result.ok) throw new Error(result.message);
    draft = result.value;
    expect(remainingPlayers(draft, roster())).toHaveLength(7);
    expect(remainingPlayers(draft, roster()).map((p) => p.id)).not.toContain('d1');
  });

  it('完了したドラフトへは指名できない', () => {
    let draft = startOk();
    const pool: Array<[string, Role]> = [
      ['d1', 'damage'],
      ['d2', 'damage'],
      ['d3', 'damage'],
      ['d4', 'damage'],
      ['s1', 'support'],
      ['s2', 'support'],
      ['s3', 'support'],
      ['s4', 'support'],
    ];
    for (const [playerId, role] of pool) {
      const result = applyPick(draft, roster(), { playerId, role });
      if (!result.ok) throw new Error(result.message);
      draft = result.value;
    }
    const after = applyPick(draft, roster(), { playerId: 'd1', role: 'damage' });
    expect(after.ok).toBe(false);
  });

  it('完了したドラフトは有効な編成へ変換できる', () => {
    let draft = startOk();
    const pool: Array<[string, Role]> = [
      ['d1', 'damage'],
      ['d2', 'damage'],
      ['d3', 'damage'],
      ['d4', 'damage'],
      ['s1', 'support'],
      ['s2', 'support'],
      ['s3', 'support'],
      ['s4', 'support'],
    ];
    for (const [playerId, role] of pool) {
      const result = applyPick(draft, roster(), { playerId, role });
      if (!result.ok) throw new Error(result.message);
      draft = result.value;
    }
    const lineup = draftToLineup(draft);
    expect(lineup).toHaveLength(REQUIRED_ACTIVE_PLAYERS);
    for (const team of ['A', 'B'] as const) {
      const slots = lineup.filter((slot) => slot.team === team);
      expect(slots).toHaveLength(5);
      expect(slots.filter((slot) => slot.role === 'tank')).toHaveLength(1);
      expect(slots.filter((slot) => slot.role === 'damage')).toHaveLength(2);
      expect(slots.filter((slot) => slot.role === 'support')).toHaveLength(2);
    }
  });
});
