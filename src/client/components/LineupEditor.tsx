/**
 * 確定チームの手動調整。
 *
 * 2人を選ぶと配置（ロールと所属チーム）を入れ替える。
 * 指標はサーバーと同じ evaluateLineup で再計算するため、
 * 画面に出ている数値と確定後の数値が一致する。
 */

import { useMemo, useRef, useState, type ReactElement } from 'react';
import { evaluateLineup, type LineupSlot } from '../../shared/balancer';
import { ROLES, type Role } from '../../shared/constants';
import { formatRankLocalized } from '../../shared/i18n';
import { lineupFromCandidate, swapLineupSlots, toBalancePlayers } from '../../shared/lineup';
import { scoreToRank } from '../../shared/ranks';
import type { PlayerPublic, TeamCandidate, TeamSide } from '../../shared/types';
import { useMessages } from '../hooks/useI18n';
import { formatNumber } from '../lib/format';
import { CandidateMetrics } from './TeamView';

export interface LineupEditorProps {
  candidate: TeamCandidate;
  /** アクティブな参加者（ロール適性の判定に使う） */
  players: PlayerPublic[];
  busy: boolean;
  onSave: (lineup: LineupSlot[]) => void;
  onCancel: () => void;
}

export function LineupEditor({ candidate, players, busy, onSave, onCancel }: LineupEditorProps) {
  const messages = useMessages();
  const [lineup, setLineup] = useState<LineupSlot[]>(() => lineupFromCandidate(candidate));
  const [picked, setPickedState] = useState<string | null>(null);
  // 連続クリックが同一タスクにまとまっても取りこぼさないよう、選択中の値は ref でも保持する
  const pickedRef = useRef<string | null>(null);
  const setPicked = (value: string | null): void => {
    pickedRef.current = value;
    setPickedState(value);
  };
  const [message, setMessage] = useState<string | null>(null);

  const balancePlayers = useMemo(() => toBalancePlayers(players), [players]);
  const playerById = useMemo(
    () => new Map(players.map((player) => [player.id, player])),
    [players],
  );

  // 現在の編成を、サーバーと同じ計算式で採点する
  const evaluated = useMemo(
    () => evaluateLineup(balancePlayers, lineup, messages),
    [balancePlayers, lineup, messages],
  );
  const preview = evaluated.ok ? evaluated.candidate : null;
  const changed = useMemo(() => {
    const original = lineupFromCandidate(candidate);
    const key = (slots: LineupSlot[]): string =>
      [...slots]
        .sort((a, b) => (a.playerId < b.playerId ? -1 : 1))
        .map((slot) => `${slot.playerId}:${slot.team}:${slot.role}`)
        .join('|');
    return key(original) !== key(lineup);
  }, [candidate, lineup]);

  const handlePick = (playerId: string): void => {
    setMessage(null);
    const current = pickedRef.current;
    if (current === null) {
      setPicked(playerId);
      return;
    }
    if (current === playerId) {
      setPicked(null);
      return;
    }
    const target = lineup.find((slot) => slot.playerId === playerId);
    const source = lineup.find((slot) => slot.playerId === current);
    if (!target || !source) return;

    // 入れ替え先のロールを担当できない場合は、理由を出して入れ替えない
    const sourcePlayer = playerById.get(source.playerId);
    const targetPlayer = playerById.get(target.playerId);
    const blocked: string[] = [];
    if (sourcePlayer && !sourcePlayer.eligibleRoles.includes(target.role)) {
      blocked.push(
        messages.balance.cannotPlayRole(sourcePlayer.displayName, messages.roles[target.role]),
      );
    }
    if (targetPlayer && !targetPlayer.eligibleRoles.includes(source.role)) {
      blocked.push(
        messages.balance.cannotPlayRole(targetPlayer.displayName, messages.roles[source.role]),
      );
    }
    if (blocked.length > 0) {
      setMessage(blocked.join(' '));
      setPicked(null);
      return;
    }

    setLineup((slots) => swapLineupSlots(slots, current, playerId));
    setPicked(null);
  };

  const slotsOf = (team: TeamSide): LineupSlot[] =>
    ROLES.flatMap((role) => lineup.filter((slot) => slot.team === team && slot.role === role));

  const renderTeam = (team: TeamSide): ReactElement => (
    <div className={`team-block team-${team === 'A' ? 'a' : 'b'}`}>
      <div className="team-heading">
        <span className="team-mark" aria-hidden="true">
          {team === 'A' ? '🔵' : '🔴'}
        </span>
        <h4>TEAM {team}</h4>
        <span className="team-total">
          {preview
            ? messages.teams.total(team === 'A' ? preview.teamA.totalRank : preview.teamB.totalRank)
            : '-'}
        </span>
      </div>
      <ul className="team-members">
        {slotsOf(team).map((slot) => {
          const player = playerById.get(slot.playerId);
          const assigned = preview
            ? [...preview.teamA.players, ...preview.teamB.players].find(
                (entry) => entry.playerId === slot.playerId,
              )
            : undefined;
          const isPicked = picked === slot.playerId;
          return (
            <li key={slot.playerId} className="team-member">
              <button
                type="button"
                className={`lineup-slot${isPicked ? ' is-picked' : ''}`}
                onClick={() => handlePick(slot.playerId)}
                disabled={busy}
                aria-pressed={isPicked}
              >
                <span className="role-badge">{messages.roles[slot.role]}</span>
                <span className="team-member-name">{player?.displayName ?? slot.playerId}</span>
                {assigned ? (
                  <span className={`team-member-rank tier-${scoreToRank(assigned.rankScore).tier}`}>
                    {formatRankLocalized(messages, scoreToRank(assigned.rankScore))}
                  </span>
                ) : null}
                <span
                  className={`pref-badge${assigned?.preferenceRank === 1 ? ' pref-first' : ''}`}
                >
                  {assigned && assigned.preferenceRank > 0
                    ? messages.teams.preferenceNth(assigned.preferenceRank)
                    : messages.teams.outOfPreference}
                </span>
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );

  return (
    <div className="lineup-editor">
      <p className="field-help">{messages.lineup.help}</p>

      {preview ? (
        <>
          <CandidateMetrics candidate={preview} />
          <p className="lineup-diff">
            {messages.lineup.diffLabel}:{' '}
            {changed
              ? messages.lineup.scoreChange(
                  formatNumber(candidate.score),
                  formatNumber(preview.score),
                )
              : messages.lineup.noChange}
          </p>
        </>
      ) : (
        <p className="field-error" role="alert">
          {evaluated.ok ? '' : evaluated.message}
        </p>
      )}

      <div className="teams">
        {renderTeam('A')}
        {renderTeam('B')}
      </div>

      {message ? (
        <p className="field-error" role="alert">
          {message}
        </p>
      ) : null}

      <div className="button-row">
        <button
          type="button"
          className="button button-primary"
          onClick={() => onSave(lineup)}
          disabled={busy || !preview || !changed}
        >
          {messages.lineup.save}
        </button>
        <button
          type="button"
          className="button"
          onClick={() => {
            setLineup(lineupFromCandidate(candidate));
            setPicked(null);
            setMessage(null);
          }}
          disabled={busy || !changed}
        >
          {messages.lineup.reset}
        </button>
        <button type="button" className="button button-ghost" onClick={onCancel} disabled={busy}>
          {messages.lineup.stop}
        </button>
      </div>
    </div>
  );
}

/** ロール適性を持たない参加者が混ざっていないかの簡易チェック（呼び出し側の事前判定用） */
export function canEditLineup(candidate: TeamCandidate, players: PlayerPublic[]): boolean {
  const ids = new Set(players.map((player) => player.id));
  return [...candidate.teamA.players, ...candidate.teamB.players].every((entry) =>
    ids.has(entry.playerId),
  );
}

/** 参加者がそのロールを担当できるか（表示補助） */
export function isEligible(player: PlayerPublic | undefined, role: Role): boolean {
  return player?.eligibleRoles.includes(role) ?? false;
}
