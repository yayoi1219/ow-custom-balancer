/** 参加者一覧。ロール希望とランクを見やすく表示する。 */

import {
  REQUIRED_ACTIVE_PLAYERS,
  ROLE_EXPERIENCE_SHORT_LABELS,
  ROLE_LABELS,
  type Role,
} from '../../shared/constants';
import { formatRank } from '../../shared/ranks';
import type { PlayerPublic } from '../../shared/types';

export interface PlayerListProps {
  players: PlayerPublic[];
  myPlayerId: string | null;
  isHost: boolean;
  /** 11人以上のときにアクティブ選択を操作できるか */
  selectionEnabled: boolean;
  onToggleActive?: (playerId: string, nextActive: boolean) => void;
  onRemove?: (player: PlayerPublic) => void;
  busy?: boolean;
}

/**
 * 希望順位とランクのタグ表示。
 * 同順位のロールは同じ「第N希望」で並ぶ（例: 第1希望 Tank / 第1希望 Support）。
 * 色はロールではなく、そのロールでのランクティアを表す。
 */
export function RoleRankTags({ player }: { player: PlayerPublic }) {
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
              <span className="rank-tag-order">第{groupIndex + 1}希望</span>
              <span className="rank-tag-role">{ROLE_LABELS[role]}</span>
              <span className="rank-tag-rank">{rank ? formatRank(rank) : '-'}</span>
              {rank?.estimated ? <span className="rank-tag-estimated">推定</span> : null}
              {rank?.experience && rank.experience !== 'main' ? (
                <span className="rank-tag-experience">
                  {ROLE_EXPERIENCE_SHORT_LABELS[rank.experience]}
                </span>
              ) : null}
            </li>
          );
        }),
      )}
      {player.rolePreferenceGroups.length === 1 && player.eligibleRoles.length > 1 ? (
        <li className="rank-tag rank-tag-note">どれでもよい</li>
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
  busy = false,
}: PlayerListProps) {
  const activeCount = players.filter((player) => player.active).length;

  if (players.length === 0) {
    return (
      <div className="card">
        <h2>参加者一覧</h2>
        <p className="empty-state">まだ参加者がいません。参加用URLを共有してください。</p>
      </div>
    );
  }

  return (
    <div className="card">
      <div className="card-header">
        <h2>参加者一覧</h2>
        <p className="card-meta">
          {players.length}人 / アクティブ {activeCount}人
          {selectionEnabled ? `（${REQUIRED_ACTIVE_PLAYERS}人選択してください）` : ''}
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
                        {player.displayName} を今回のチーム分けに含める
                      </span>
                    </label>
                  ) : null}
                  <span className="player-name">{player.displayName}</span>
                  {isMe ? <span className="badge badge-me">あなた</span> : null}
                  <span className={`badge ${player.active ? 'badge-active' : 'badge-inactive'}`}>
                    {player.active ? '参加中' : '待機'}
                  </span>
                </div>
                <RoleRankTags player={player} />
              </div>
              {isHost && onRemove ? (
                <button
                  type="button"
                  className="button button-ghost button-small"
                  onClick={() => onRemove(player)}
                  disabled={busy}
                >
                  削除
                </button>
              ) : null}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
