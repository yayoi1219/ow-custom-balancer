/**
 * キャプテンドラフトの進行画面。
 *
 * 参加者全員がリアルタイムで盤面を見られ、
 * 手番のキャプテンは自分の端末から指名できる（主催者は代理指名も可能）。
 */

import { useState } from 'react';
import { ROLES, TEAM_ROLE_SLOTS, type Role } from '../../shared/constants';
import { currentTurn, openSlots, pickableRoles, remainingPlayers } from '../../shared/draft';
import { formatRankLocalized } from '../../shared/i18n';
import type { DraftState, PlayerPublic, TeamSide } from '../../shared/types';
import { useMessages } from '../hooks/useI18n';

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
  const messages = useMessages();
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
          <span className="team-total">
            {messages.draft.captainOf(nameOf(draft.captains[team]))}
          </span>
        </div>
        <ul className="team-members">
          {ROLES.map((role) => {
            const picked = draft.picks.filter((pick) => pick.team === team && pick.role === role);
            const empty = Array.from({ length: open[role] });
            return [
              ...picked.map((pick) => (
                <li key={`${role}-${pick.playerId}`} className="team-member">
                  <span className="role-badge">{messages.roles[role]}</span>
                  <span className="team-member-name">{nameOf(pick.playerId)}</span>
                  {pick.playerId === draft.captains[team] ? (
                    <span className="badge badge-host">{messages.draft.captainMark}</span>
                  ) : null}
                </li>
              )),
              ...empty.map((_, index) => (
                <li key={`${role}-empty-${index}`} className="team-member draft-empty-slot">
                  <span className="role-badge">{messages.roles[role]}</span>
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
          <p className="notice">{messages.draft.completedNotice}</p>
        ) : (
          <p className={`notice${isMyTurn ? ' notice-warn' : ''}`}>
            {turn ? (
              <>
                {messages.draft.currentTurn(turn, nameOf(draft.captains[turn]))}
                {isMyTurn ? ` — ${messages.draft.yourTurn}` : ''}
                {' / '}
                {messages.draft.remainingPicks(draft.order.length)}
              </>
            ) : (
              messages.draft.finished
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
          <p className="field-label">{messages.draft.poolTitle(pool.length)}</p>
          {!canPick ? <p className="field-help">{messages.draft.waitingForCaptain}</p> : null}
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
                            <span className="rank-tag-role">{messages.roles[role]}</span>
                            <span className="rank-tag-rank">
                              {rank ? formatRankLocalized(messages, rank) : '-'}
                            </span>
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
                          {messages.draft.pickAs(messages.roles[role])}
                        </button>
                      ))}
                      {roles.length === 0 ? (
                        <span className="field-help">{messages.draft.noOpenSlot}</span>
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
            {messages.draft.cancelDraft}
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
  const messages = useMessages();
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
        <label htmlFor={`captain-${side}`}>{messages.draft.captainFor(side)}</label>
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
            aria-label={messages.draft.captainRoleFor(side)}
            onChange={(event) => setRole(event.target.value as Role)}
          >
            {rolesOf(id).map((option) => (
              <option key={option} value={option}>
                {messages.roles[option]}
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
        {messages.draft.setupHelp(
          TEAM_ROLE_SLOTS.tank,
          TEAM_ROLE_SLOTS.damage,
          TEAM_ROLE_SLOTS.support,
        )}
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
          {messages.draft.start}
        </button>
        <button type="button" className="button button-ghost" onClick={onCancel} disabled={busy}>
          {messages.draft.stop}
        </button>
      </div>
    </div>
  );
}
