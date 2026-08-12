/**
 * キャプテンドラフトの進行画面。
 *
 * 参加者全員がリアルタイムで盤面を見られ、
 * 手番のキャプテンは自分の端末から指名できる（主催者は代理指名も可能）。
 */

import { useState } from 'react';
import { ROLES, ROLE_LABELS, TEAM_ROLE_SLOTS, type Role } from '../../shared/constants';
import { currentTurn, openSlots, pickableRoles, remainingPlayers } from '../../shared/draft';
import { formatRank } from '../../shared/ranks';
import type { DraftState, PlayerPublic, TeamSide } from '../../shared/types';

export interface DraftBoardProps {
  draft: DraftState;
  /** アクティブな参加者10人 */
  players: PlayerPublic[];
  /** 自分の参加者ID（キャプテン判定に使う） */
  myPlayerId: string | null;
  isHost: boolean;
  busy: boolean;
  errorMessage: string | null;
  onPick: (playerId: string, role: Role) => void;
  onCancel: () => void;
}

export function DraftBoard({
  draft,
  players,
  myPlayerId,
  isHost,
  busy,
  errorMessage,
  onPick,
  onCancel,
}: DraftBoardProps) {
  const [selectedPlayerId, setSelectedPlayerId] = useState<string | null>(null);
  const byId = new Map(players.map((player) => [player.id, player]));
  const turn = currentTurn(draft);
  const pool = remainingPlayers(draft, players);

  const nameOf = (playerId: string): string => byId.get(playerId)?.displayName ?? playerId;
  const isMyTurn = turn !== null && myPlayerId !== null && draft.captains[turn] === myPlayerId;
  const canPick = turn !== null && (isMyTurn || isHost);

  const renderTeam = (team: TeamSide) => {
    const open = openSlots(draft, team);
    return (
      <div
        className={`team-block team-${team === 'A' ? 'a' : 'b'}${turn === team ? ' is-turn' : ''}`}
      >
        <div className="team-heading">
          <span className="team-mark" aria-hidden="true">
            {team === 'A' ? '🔵' : '🔴'}
          </span>
          <h4>TEAM {team}</h4>
          <span className="team-total">キャプテン: {nameOf(draft.captains[team])}</span>
        </div>
        <ul className="team-members">
          {ROLES.map((role) => {
            const picked = draft.picks.filter((pick) => pick.team === team && pick.role === role);
            const empty = Array.from({ length: open[role] });
            return [
              ...picked.map((pick) => (
                <li key={`${role}-${pick.playerId}`} className="team-member">
                  <span className="role-badge">{ROLE_LABELS[role]}</span>
                  <span className="team-member-name">{nameOf(pick.playerId)}</span>
                  {pick.playerId === draft.captains[team] ? (
                    <span className="badge badge-host">C</span>
                  ) : null}
                </li>
              )),
              ...empty.map((_, index) => (
                <li key={`${role}-empty-${index}`} className="team-member draft-empty-slot">
                  <span className="role-badge">{ROLE_LABELS[role]}</span>
                  <span className="team-member-name">—</span>
                </li>
              )),
            ];
          })}
        </ul>
      </div>
    );
  };

  return (
    <div className="draft-board">
      <div className="draft-status">
        {draft.status === 'completed' ? (
          <p className="notice">ドラフトが完了しました。下の確定チームをご確認ください。</p>
        ) : (
          <p className={`notice${isMyTurn ? ' notice-warn' : ''}`}>
            {turn ? (
              <>
                現在の手番: <strong>TEAM {turn}</strong>（{nameOf(draft.captains[turn])}）
                {isMyTurn ? ' — あなたの番です' : ''}
                {' / '}
                残り {draft.order.length} 指名
              </>
            ) : (
              'ドラフトは終了しています。'
            )}
          </p>
        )}
      </div>

      <div className="teams">
        {renderTeam('A')}
        {renderTeam('B')}
      </div>

      {draft.status === 'active' ? (
        <div className="draft-pool">
          <p className="field-label">未指名（{pool.length}人）</p>
          {!canPick ? (
            <p className="field-help">
              手番のキャプテンが指名するのを待っています。画面は自動で更新されます。
            </p>
          ) : null}
          <ul className="draft-pool-list">
            {pool.map((player) => {
              const roles = canPick ? pickableRoles(draft, players, player.id) : [];
              const isSelected = selectedPlayerId === player.id;
              return (
                <li key={player.id} className={`draft-pool-item${isSelected ? ' is-picked' : ''}`}>
                  <button
                    type="button"
                    className="draft-pool-name"
                    onClick={() => setSelectedPlayerId(isSelected ? null : player.id)}
                    disabled={!canPick || busy || roles.length === 0}
                    aria-pressed={isSelected}
                  >
                    <span className="player-name">{player.displayName}</span>
                    <span className="rank-tags">
                      {player.eligibleRoles.map((role) => {
                        const rank = player.roleRanks[role];
                        return (
                          <span
                            key={role}
                            className={`rank-tag tier-${rank ? rank.tier : 'unknown'}`}
                          >
                            <span className="rank-tag-role">{ROLE_LABELS[role]}</span>
                            <span className="rank-tag-rank">{rank ? formatRank(rank) : '-'}</span>
                          </span>
                        );
                      })}
                    </span>
                  </button>
                  {isSelected && canPick ? (
                    <div className="draft-role-buttons">
                      {roles.map((role) => (
                        <button
                          key={role}
                          type="button"
                          className="button button-primary button-small"
                          onClick={() => {
                            setSelectedPlayerId(null);
                            onPick(player.id, role);
                          }}
                          disabled={busy}
                        >
                          {ROLE_LABELS[role]} で指名
                        </button>
                      ))}
                      {roles.length === 0 ? (
                        <span className="field-help">空いている枠に入れられません。</span>
                      ) : null}
                    </div>
                  ) : null}
                </li>
              );
            })}
          </ul>
        </div>
      ) : null}

      {errorMessage ? (
        <p className="field-error" role="alert">
          {errorMessage}
        </p>
      ) : null}

      {isHost ? (
        <div className="button-row">
          <button type="button" className="button button-ghost" onClick={onCancel} disabled={busy}>
            ドラフトを中止
          </button>
        </div>
      ) : null}
    </div>
  );
}

/** ドラフト開始フォーム（主催者がキャプテン2人と担当ロールを決める） */
export function DraftSetup({
  players,
  busy,
  errorMessage,
  onStart,
  onCancel,
}: {
  players: PlayerPublic[];
  busy: boolean;
  errorMessage: string | null;
  onStart: (
    captainA: { playerId: string; role: Role },
    captainB: { playerId: string; role: Role },
  ) => void;
  onCancel: () => void;
}) {
  const [aId, setAId] = useState<string>(players[0]?.id ?? '');
  const [bId, setBId] = useState<string>(players[1]?.id ?? '');

  const rolesOf = (playerId: string): Role[] =>
    players.find((player) => player.id === playerId)?.eligibleRoles ?? [];
  const [aRole, setARole] = useState<Role>(rolesOf(players[0]?.id ?? '')[0] ?? 'tank');
  const [bRole, setBRole] = useState<Role>(rolesOf(players[1]?.id ?? '')[0] ?? 'tank');

  const changeCaptain = (side: TeamSide, playerId: string): void => {
    const roles = rolesOf(playerId);
    if (side === 'A') {
      setAId(playerId);
      if (!roles.includes(aRole)) setARole(roles[0] ?? 'tank');
    } else {
      setBId(playerId);
      if (!roles.includes(bRole)) setBRole(roles[0] ?? 'tank');
    }
  };

  const renderSide = (side: TeamSide) => {
    const id = side === 'A' ? aId : bId;
    const role = side === 'A' ? aRole : bRole;
    const setRole = side === 'A' ? setARole : setBRole;
    return (
      <div className="field">
        <label htmlFor={`captain-${side}`}>TEAM {side} のキャプテン</label>
        <div className="rank-field-row">
          <select
            id={`captain-${side}`}
            value={id}
            disabled={busy}
            onChange={(event) => changeCaptain(side, event.target.value)}
          >
            {players.map((player) => (
              <option key={player.id} value={player.id}>
                {player.displayName}
              </option>
            ))}
          </select>
          <select
            value={role}
            disabled={busy}
            aria-label={`TEAM ${side} のキャプテンの担当ロール`}
            onChange={(event) => setRole(event.target.value as Role)}
          >
            {rolesOf(id).map((option) => (
              <option key={option} value={option}>
                {ROLE_LABELS[option]}
              </option>
            ))}
          </select>
        </div>
      </div>
    );
  };

  return (
    <div className="draft-setup">
      <p className="field-help">
        キャプテン2人とその担当ロールを決めます。残り8人は
        {' A→B→B→A→A→B→B→A '}
        の順でキャプテンが交互に指名します（各チーム Tank×{TEAM_ROLE_SLOTS.tank} / Damage×
        {TEAM_ROLE_SLOTS.damage} / Support×{TEAM_ROLE_SLOTS.support}）。
      </p>
      {renderSide('A')}
      {renderSide('B')}
      {errorMessage ? (
        <p className="field-error" role="alert">
          {errorMessage}
        </p>
      ) : null}
      <div className="button-row">
        <button
          type="button"
          className="button button-primary"
          onClick={() => onStart({ playerId: aId, role: aRole }, { playerId: bId, role: bRole })}
          disabled={busy || aId === bId || !aId || !bId}
        >
          ドラフトを開始
        </button>
        <button type="button" className="button button-ghost" onClick={onCancel} disabled={busy}>
          やめる
        </button>
      </div>
    </div>
  );
}
