/** 参加者一覧。ロール希望とランクを見やすく表示する。 */

import { REQUIRED_ACTIVE_PLAYERS, type Role } from '../../shared/constants';
import { formatRankLocalized } from '../../shared/i18n';
import type { PlayerPublic } from '../../shared/types';
import { useMessages } from '../hooks/useI18n';

export interface PlayerListProps {
  players: PlayerPublic[];
  myPlayerId: string | null;
  isHost: boolean;
  /** 11人以上のときにアクティブ選択を操作できるか */
  selectionEnabled: boolean;
  onToggleActive?: (playerId: string, nextActive: boolean) => void;
  onRemove?: (player: PlayerPublic) => void;
  /** 主催者が参加者の登録内容を修正する */
  onEdit?: (player: PlayerPublic) => void;
  busy?: boolean;
}

/**
 * 希望順位とランクのタグ表示。
 * 同順位のロールは同じ「第N希望」で並ぶ（例: 第1希望 Tank / 第1希望 Support）。
 * 色はロールではなく、そのロールでのランクティアを表す。
 */
export function RoleRankTags({ player }: { player: PlayerPublic }) {
  const messages = useMessages();
  return (
    <ul className="rank-tags">
      {player.rolePreferenceGroups.map((group, groupIndex) =>
        group.map((role: Role) => {
          const rank = player.roleRanks[role];
          const isTied = group.length > 1;
          return (
            <li
              key={role}
              className={`rank-tag tier-${rank ? rank.tier : 'unknown'}${isTied ? ' is-tied' : ''}`}
            >
              <span className="rank-tag-order">{messages.teams.preferenceNth(groupIndex + 1)}</span>
              <span className="rank-tag-role">{messages.roles[role]}</span>
              <span className="rank-tag-rank">
                {rank ? formatRankLocalized(messages, rank) : '-'}
              </span>
              {rank?.estimated ? (
                <span className="rank-tag-estimated">{messages.playerList.estimatedShort}</span>
              ) : null}
              {rank?.experience && rank.experience !== 'main' ? (
                <span className="rank-tag-experience">
                  {rank.experience === 'sub'
                    ? messages.experience.subShort
                    : messages.experience.rareShort}
                </span>
              ) : null}
            </li>
          );
        }),
      )}
      {player.rolePreferenceGroups.length === 1 && player.eligibleRoles.length > 1 ? (
        <li className="rank-tag rank-tag-note">{messages.playerList.anyRole}</li>
      ) : null}
    </ul>
  );
}

export function PlayerList({
  players,
  myPlayerId,
  isHost,
  selectionEnabled,
  onToggleActive,
  onRemove,
  onEdit,
  busy = false,
}: PlayerListProps) {
  const messages = useMessages();
  const activeCount = players.filter((player) => player.active).length;

  if (players.length === 0) {
    return (
      <div className="card">
        <h2>{messages.playerList.title}</h2>
        <p className="empty-state">{messages.playerList.empty}</p>
      </div>
    );
  }

  return (
    <div className="card">
      <div className="card-header">
        <h2>{messages.playerList.title}</h2>
        <p className="card-meta">
          {messages.playerList.summary(players.length, activeCount)}
          {selectionEnabled ? messages.playerList.selectHint(REQUIRED_ACTIVE_PLAYERS) : ''}
        </p>
      </div>
      <ul className="player-list">
        {players.map((player) => {
          const isMe = player.id === myPlayerId;
          return (
            <li
              key={player.id}
              className={`player-item${player.active ? ' is-active' : ' is-inactive'}${isMe ? ' is-me' : ''}`}
            >
              <div className="player-main">
                <div className="player-name-row">
                  {selectionEnabled && isHost && onToggleActive ? (
                    <label className="player-select">
                      <input
                        type="checkbox"
                        checked={player.active}
                        disabled={busy}
                        onChange={(event) => onToggleActive(player.id, event.target.checked)}
                      />
                      <span className="visually-hidden">
                        {messages.playerList.includeInDraw(player.displayName)}
                      </span>
                    </label>
                  ) : null}
                  <span className="player-name">{player.displayName}</span>
                  {isMe ? <span className="badge badge-me">{messages.playerList.you}</span> : null}
                  <span className={`badge ${player.active ? 'badge-active' : 'badge-inactive'}`}>
                    {player.active ? messages.playerList.active : messages.playerList.waiting}
                  </span>
                </div>
                <RoleRankTags player={player} />
              </div>
              {isHost ? (
                <div className="player-actions">
                  {onEdit ? (
                    <button
                      type="button"
                      className="button button-ghost button-small"
                      onClick={() => onEdit(player)}
                      disabled={busy}
                    >
                      {messages.playerList.edit}
                    </button>
                  ) : null}
                  {onRemove ? (
                    <button
                      type="button"
                      className="button button-ghost button-small"
                      onClick={() => onRemove(player)}
                      disabled={busy}
                    >
                      {messages.playerList.remove}
                    </button>
                  ) : null}
                </div>
              ) : null}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
