/** 部屋ページ。権限に応じて参加者向け／主催者向けの表示を切り替える。 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { MAX_PLAYERS, REQUIRED_ACTIVE_PLAYERS, SERVICE_NAME } from '../../shared/constants';
import type { LineupSlot } from '../../shared/balancer';
import type { Role } from '../../shared/constants';
import { formatDiscordResult } from '../../shared/discord';
import type {
  PlayerInput,
  PlayerPublic,
  RoomSnapshot,
  TeamCandidate,
  ViewerInfo,
} from '../../shared/types';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { DraftBoard, DraftSetup } from '../components/DraftBoard';
import { LineupEditor } from '../components/LineupEditor';
import { ConnectionBadge } from '../components/ConnectionBadge';
import { PlayerForm } from '../components/PlayerForm';
import { PlayerList, RoleRankTags } from '../components/PlayerList';
import { SelectedTeams, TeamCandidateCard } from '../components/TeamView';
import { useToast } from '../components/Toast';
import { useConfig } from '../hooks/useConfig';
import { useI18n } from '../hooks/useI18n';
import { useRoomChannel } from '../hooks/useRoomChannel';
import { ApiError, api } from '../lib/api';
import { copyText } from '../lib/clipboard';
import { formatDateTimeLocal, formatRemaining } from '../lib/format';
import {
  clearDraft,
  clearHostToken,
  clearPlayerCredential,
  loadHostToken,
  loadPlayerCredential,
  savePlayerCredential,
  saveHostToken,
} from '../lib/storage';
import { Link, navigate } from '../router';

type PendingAction =
  | { kind: 'none' }
  | { kind: 'withdraw' }
  | { kind: 'removePlayer'; player: PlayerPublic }
  | { kind: 'deleteRoom' }
  | { kind: 'clearSelection' };

/** URL フラグメントから主催者トークンを取り出して保存し、URL からは消す */
function consumeHostFragment(roomId: string): string | null {
  const hash = window.location.hash;
  if (!hash.startsWith('#')) return null;
  const params = new URLSearchParams(hash.slice(1));
  const token = params.get('host');
  if (!token) return null;
  saveHostToken(roomId, token);
  // フラグメントはサーバーへ送信されない。表示後は履歴からも消す。
  window.history.replaceState({}, '', `${window.location.pathname}${window.location.search}`);
  return token;
}

export function RoomPage({ roomId }: { roomId: string }) {
  const { showToast } = useToast();
  const { config } = useConfig();
  const { locale, messages } = useI18n();

  const [hostToken, setHostToken] = useState<string | null>(null);
  const [playerCredential, setPlayerCredential] = useState<{
    playerId: string;
    editToken: string;
  } | null>(null);
  const [initialized, setInitialized] = useState(false);

  useEffect(() => {
    const fromFragment = consumeHostFragment(roomId);
    setHostToken(fromFragment ?? loadHostToken(roomId));
    setPlayerCredential(loadPlayerCredential(roomId));
    setInitialized(true);
  }, [roomId]);

  const channelToken = hostToken ?? playerCredential?.editToken ?? null;
  const channel = useRoomChannel(roomId, initialized ? channelToken : null);
  const { room, viewer, connection, expired, notFound, loading } = channel;

  const isHost = viewer.role === 'host';
  const myPlayerId = playerCredential?.playerId ?? viewer.playerId;
  const myPlayer = useMemo(
    () => room?.players.find((player) => player.id === myPlayerId) ?? null,
    [room, myPlayerId],
  );

  const [editing, setEditing] = useState(false);
  const [formSubmitting, setFormSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [formErrorDetails, setFormErrorDetails] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [pending, setPending] = useState<PendingAction>({ kind: 'none' });
  const [selection, setSelection] = useState<string[]>([]);
  const [lineupReasons, setLineupReasons] = useState<string[]>([]);
  const [editingLineup, setEditingLineup] = useState(false);
  const [hostEditingPlayer, setHostEditingPlayer] = useState<PlayerPublic | null>(null);
  const [hostEditError, setHostEditError] = useState<string | null>(null);
  const [showDraftSetup, setShowDraftSetup] = useState(false);
  const [draftError, setDraftError] = useState<string | null>(null);

  useEffect(() => {
    document.title = room ? `${room.title} - ${SERVICE_NAME}` : SERVICE_NAME;
  }, [room]);

  // サーバー側のアクティブ状態が変わったときだけローカル選択へ反映する
  // （他人の更新でホストの選択途中の状態を消さないため）
  const lastServerActiveRef = useRef<string>('');
  useEffect(() => {
    if (!room) return;
    const serverActive = room.players
      .filter((player) => player.active)
      .map((player) => player.id)
      .sort();
    const key = serverActive.join(',');
    if (key !== lastServerActiveRef.current) {
      lastServerActiveRef.current = key;
      setSelection(serverActive);
    }
  }, [room]);

  // 登録済みなのにサーバー側に存在しない場合は資格情報を破棄する
  useEffect(() => {
    if (!room || !playerCredential) return;
    const exists = room.players.some((player) => player.id === playerCredential.playerId);
    if (!exists && room.status !== 'expired' && room.status !== 'deleted') {
      clearPlayerCredential(roomId);
      setPlayerCredential(null);
    }
  }, [room, playerCredential, roomId]);

  /**
   * API エラーを画面の言語の文面に変換する。
   * サーバーは動的な理由（誰がどのロールで、など）も返すため、
   * コードに対応する定型文がある場合を除き、サーバーの文面を尊重する。
   */
  const handleApiError = useCallback(
    (caught: unknown, fallback: string): string => {
      if (caught instanceof ApiError) {
        if (caught.code === 'VALIDATION_ERROR' || caught.code === 'NO_VALID_LINEUP') {
          return caught.message;
        }
        return messages.errors[caught.code] ?? caught.message;
      }
      return fallback;
    },
    [messages],
  );

  const participantUrl = `${window.location.origin}/room/${roomId}`;

  const copyToClipboard = useCallback(
    async (text: string, successMessage: string): Promise<void> => {
      const copied = await copyText(text);
      showToast(copied ? successMessage : messages.copy.failed, copied ? 'success' : 'error');
    },
    [showToast, messages],
  );

  /**
   * 参加者としての操作結果を反映する。
   * 主催者が自分自身を参加登録した場合、参加者スコープのレスポンスで
   * 権限表示が下がってしまわないよう、主催者権限はサーバーから取り直す。
   */
  const applyPlayerScopedResult = (nextRoom: RoomSnapshot, nextViewer: ViewerInfo): void => {
    if (hostToken && nextViewer.role !== 'host') {
      channel.applyState(nextRoom, viewer);
      channel.refresh();
      return;
    }
    channel.applyState(nextRoom, nextViewer);
  };

  /* ---------------- 参加登録・編集 ---------------- */

  const handleJoin = async (input: PlayerInput, turnstileToken: string | null): Promise<void> => {
    setFormSubmitting(true);
    setFormError(null);
    setFormErrorDetails([]);
    try {
      const result = await api.joinRoom(roomId, input, turnstileToken ?? '');
      savePlayerCredential(roomId, { playerId: result.playerId, editToken: result.editToken });
      setPlayerCredential({ playerId: result.playerId, editToken: result.editToken });
      clearDraft(roomId);
      applyPlayerScopedResult(result.room, result.viewer);
      showToast(messages.player.joined);
    } catch (caught) {
      setFormError(handleApiError(caught, messages.player.joinFailed));
      if (caught instanceof ApiError) setFormErrorDetails(caught.details);
    } finally {
      setFormSubmitting(false);
    }
  };

  const handleUpdate = async (input: PlayerInput): Promise<void> => {
    if (!playerCredential) return;
    setFormSubmitting(true);
    setFormError(null);
    setFormErrorDetails([]);
    try {
      const result = await api.updatePlayer(
        roomId,
        playerCredential.playerId,
        input,
        playerCredential.editToken,
      );
      applyPlayerScopedResult(result.room, result.viewer);
      setEditing(false);
      showToast(messages.player.updated);
    } catch (caught) {
      setFormError(handleApiError(caught, messages.player.updateFailed));
      if (caught instanceof ApiError) setFormErrorDetails(caught.details);
    } finally {
      setFormSubmitting(false);
    }
  };

  const handleWithdraw = async (): Promise<void> => {
    if (!playerCredential) return;
    setBusy(true);
    try {
      await api.removePlayer(roomId, playerCredential.playerId, playerCredential.editToken);
      clearPlayerCredential(roomId);
      setPlayerCredential(null);
      setEditing(false);
      channel.refresh();
      showToast(messages.player.withdrew);
    } catch (caught) {
      setActionError(handleApiError(caught, messages.player.withdrawFailed));
    } finally {
      setBusy(false);
      setPending({ kind: 'none' });
    }
  };

  /* ---------------- 主催者操作 ---------------- */

  const runHostAction = async (
    action: (token: string) => Promise<void>,
    fallbackMessage: string,
  ): Promise<void> => {
    if (!hostToken) return;
    setBusy(true);
    setActionError(null);
    try {
      await action(hostToken);
    } catch (caught) {
      setActionError(handleApiError(caught, fallbackMessage));
    } finally {
      setBusy(false);
    }
  };

  const handleStatusChange = (status: 'open' | 'closed'): void => {
    void runHostAction(async (token) => {
      const result = await api.setStatus(roomId, status, token);
      channel.applyState(result.room, result.viewer);
      showToast(status === 'open' ? messages.host.statusOpened : messages.host.statusClosed);
    }, messages.host.statusChangeFailed);
  };

  const handleApplySelection = (): void => {
    void runHostAction(async (token) => {
      const result = await api.setActivePlayers(roomId, selection, token);
      channel.applyState(result.room, result.viewer);
      showToast(messages.host.activeUpdated);
    }, messages.host.activeUpdateFailed);
  };

  const handleGenerate = (): void => {
    setLineupReasons([]);
    void runHostAction(async (token) => {
      try {
        const result = await api.generateCandidates(roomId, token);
        channel.applyState(result.room, result.viewer);
        showToast(messages.host.candidatesCreated(result.candidates.length));
      } catch (caught) {
        if (caught instanceof ApiError && caught.details.length > 0) {
          setLineupReasons(caught.details);
        }
        throw caught;
      }
    }, messages.host.generateFailed);
  };

  const handleSelectCandidate = (candidate: TeamCandidate): void => {
    void runHostAction(async (token) => {
      const result = await api.selectCandidate(roomId, candidate.id, token);
      channel.applyState(result.room, result.viewer);
      showToast(messages.host.teamConfirmed);
    }, messages.host.confirmFailed);
  };

  /* ---------------- キャプテンドラフト ---------------- */

  const handleStartDraft = (
    captainA: { playerId: string; role: Role },
    captainB: { playerId: string; role: Role },
  ): void => {
    setDraftError(null);
    void runHostAction(async (token) => {
      try {
        const result = await api.startDraft(roomId, captainA, captainB, token);
        channel.applyState(result.room, result.viewer);
        setShowDraftSetup(false);
        showToast(messages.draft.started);
      } catch (caught) {
        setDraftError(handleApiError(caught, messages.draft.startFailed));
        throw caught;
      }
    }, messages.draft.startFailed);
  };

  /** 指名は手番のキャプテン本人か主催者が行う。使うトークンもそれに合わせる。 */
  const handleDraftPick = async (playerId: string, role: Role): Promise<void> => {
    const token = hostToken ?? playerCredential?.editToken;
    if (!token) return;
    setBusy(true);
    setDraftError(null);
    try {
      const result = await api.draftPick(roomId, playerId, role, token);
      channel.applyState(result.room, result.viewer);
    } catch (caught) {
      setDraftError(handleApiError(caught, messages.draft.pickFailed));
    } finally {
      setBusy(false);
    }
  };

  const handleCancelDraft = (): void => {
    void runHostAction(async (token) => {
      const result = await api.cancelDraft(roomId, token);
      channel.applyState(result.room, result.viewer);
      setDraftError(null);
      showToast(messages.draft.cancelled);
    }, messages.draft.cancelFailed);
  };

  /** 主催者が参加者の登録内容を修正する */
  const handleHostEditPlayer = async (player: PlayerPublic, input: PlayerInput): Promise<void> => {
    if (!hostToken) return;
    setBusy(true);
    setHostEditError(null);
    try {
      const result = await api.updatePlayer(roomId, player.id, input, hostToken);
      channel.applyState(result.room, result.viewer);
      setHostEditingPlayer(null);
      showToast(messages.host.playerUpdated(player.displayName));
    } catch (caught) {
      // エラーはフォーム内に出す（一覧まで戻らずに直せるように）
      setHostEditError(handleApiError(caught, messages.host.editPlayerFailed));
    } finally {
      setBusy(false);
    }
  };

  /** 主催者が手動調整した編成を確定する */
  const handleSaveLineup = (lineup: LineupSlot[]): void => {
    void runHostAction(async (token) => {
      const result = await api.selectLineup(roomId, lineup, token);
      channel.applyState(result.room, result.viewer);
      setEditingLineup(false);
      showToast(messages.lineup.saved);
    }, messages.lineup.saveFailed);
  };

  const handleClearSelection = (): void => {
    void runHostAction(async (token) => {
      const result = await api.clearSelectedCandidate(roomId, token);
      channel.applyState(result.room, result.viewer);
      showToast(messages.host.selectionCleared);
    }, messages.host.clearFailed);
    setPending({ kind: 'none' });
  };

  const handleRemovePlayer = (player: PlayerPublic): void => {
    void runHostAction(async (token) => {
      const result = await api.removePlayer(roomId, player.id, token);
      channel.applyState(result.room, result.viewer);
      showToast(messages.host.playerRemoved(player.displayName));
    }, messages.host.removeFailed);
    setPending({ kind: 'none' });
  };

  const handleDeleteRoom = (): void => {
    void runHostAction(async (token) => {
      await api.deleteRoom(roomId, token);
      clearHostToken(roomId);
      clearPlayerCredential(roomId);
      clearDraft(roomId);
      showToast(messages.host.roomDeleted);
      navigate('/');
    }, messages.host.deleteRoomFailed);
    setPending({ kind: 'none' });
  };

  /* ---------------- 表示 ---------------- */

  if (!initialized || loading) {
    return (
      <div className="page">
        <div className="card">
          <p className="loading">{messages.common.loading}</p>
        </div>
      </div>
    );
  }

  if (notFound) {
    return (
      <div className="page">
        <div className="card">
          <h1>{messages.room.notFoundTitle}</h1>
          <p>{messages.room.notFoundBody}</p>
          <p className="links">
            <Link href="/">{messages.common.backToTop}</Link>
          </p>
        </div>
      </div>
    );
  }

  if (expired) {
    return (
      <div className="page">
        <div className="card">
          <h1>{messages.room.expiredTitle}</h1>
          <p>{messages.room.expiredBody}</p>
          <p className="links">
            <Link href="/">{messages.room.createNewRoom}</Link>
          </p>
        </div>
      </div>
    );
  }

  if (!room) {
    return (
      <div className="page">
        <div className="card">
          <p className="field-error" role="alert">
            {channel.errorMessage ?? messages.room.loadFailed}
          </p>
          <button type="button" className="button" onClick={channel.refresh}>
            {messages.common.reload}
          </button>
        </div>
      </div>
    );
  }

  const players = room.players;
  const activeCount = players.filter((player) => player.active).length;
  const selectionEnabled = isHost && players.length > REQUIRED_ACTIVE_PLAYERS;
  const discordText = room.selectedCandidate
    ? formatDiscordResult(room.selectedCandidate, room.title, messages)
    : '';

  return (
    <div className="page">
      <header className="room-header card">
        <div className="room-header-main">
          <h1>{room.title}</h1>
          <div className="room-badges">
            <span className={`badge badge-status-${room.status}`}>
              {room.status === 'open' ? messages.room.recruiting : messages.room.closed}
            </span>
            {isHost ? <span className="badge badge-host">{messages.room.hostBadge}</span> : null}
            <ConnectionBadge state={connection} />
          </div>
        </div>
        <dl className="room-meta">
          <div>
            <dt>{messages.room.playersLabel}</dt>
            <dd>{messages.room.playersValue(players.length, MAX_PLAYERS, activeCount)}</dd>
          </div>
          <div>
            <dt>{messages.room.expiresAt}</dt>
            <dd>
              {formatDateTimeLocal(room.expiresAt, locale)} (
              {formatRemaining(room.expiresAt, messages)})
            </dd>
          </div>
        </dl>
        {connection === 'reconnecting' || connection === 'offline' ? (
          <p className="notice notice-warn" role="status">
            {connection === 'offline' ? messages.room.offline : messages.room.reconnecting}
          </p>
        ) : null}
      </header>

      {isHost ? (
        <section className="card host-panel">
          <h2>{messages.host.menu}</h2>
          <div className="field">
            <p className="field-label">{messages.host.participantUrl}</p>
            <div className="copy-row">
              <input
                type="text"
                value={participantUrl}
                readOnly
                aria-label={messages.host.participantUrl}
              />
              <button
                type="button"
                className="button"
                onClick={() => void copyToClipboard(participantUrl, messages.host.urlCopied)}
              >
                {messages.common.copy}
              </button>
            </div>
            <p className="field-help">{messages.host.participantUrlHelp}</p>
          </div>

          <div className="button-row">
            <button
              type="button"
              className="button"
              onClick={() => handleStatusChange(room.status === 'open' ? 'closed' : 'open')}
              disabled={busy}
            >
              {room.status === 'open'
                ? messages.host.closeRecruiting
                : messages.host.reopenRecruiting}
            </button>
            <button
              type="button"
              className="button button-primary"
              onClick={handleGenerate}
              disabled={busy || activeCount !== REQUIRED_ACTIVE_PLAYERS}
            >
              {messages.host.generateCandidates}
            </button>
            {room.selectedCandidate ? (
              <button
                type="button"
                className="button button-ghost"
                onClick={() => setPending({ kind: 'clearSelection' })}
                disabled={busy}
              >
                {messages.host.clearSelection}
              </button>
            ) : null}
            {!room.draft ? (
              <button
                type="button"
                className="button"
                onClick={() => {
                  setDraftError(null);
                  setShowDraftSetup((current) => !current);
                }}
                disabled={busy || activeCount !== REQUIRED_ACTIVE_PLAYERS}
              >
                {messages.host.captainDraft}
              </button>
            ) : null}
            <button
              type="button"
              className="button button-danger"
              onClick={() => setPending({ kind: 'deleteRoom' })}
              disabled={busy}
            >
              {messages.host.deleteRoom}
            </button>
          </div>

          {activeCount !== REQUIRED_ACTIVE_PLAYERS ? (
            <p className="notice">
              {messages.host.activeCountNotice(REQUIRED_ACTIVE_PLAYERS, activeCount)}
            </p>
          ) : null}

          {selectionEnabled ? (
            <div className="field">
              <p className="field-label">
                {messages.host.selectActiveLabel(REQUIRED_ACTIVE_PLAYERS, selection.length)}
              </p>
              <button
                type="button"
                className="button"
                onClick={handleApplySelection}
                disabled={busy || selection.length !== REQUIRED_ACTIVE_PLAYERS}
              >
                {messages.host.applySelection(REQUIRED_ACTIVE_PLAYERS)}
              </button>
              <p className="field-help">{messages.host.selectActiveHelp}</p>
            </div>
          ) : null}

          {lineupReasons.length > 0 ? (
            <ul className="reason-list" role="alert">
              {lineupReasons.map((reason) => (
                <li key={reason}>{reason}</li>
              ))}
            </ul>
          ) : null}

          {actionError ? (
            <p className="field-error" role="alert">
              {actionError}
            </p>
          ) : null}
        </section>
      ) : null}

      {myPlayer && !editing ? (
        <section className="card">
          <div className="card-header">
            <h2>{messages.player.myRegistration}</h2>
          </div>
          <p className="my-name">{myPlayer.displayName}</p>
          <RoleRankTags player={myPlayer} />
          <div className="button-row">
            <button
              type="button"
              className="button"
              onClick={() => setEditing(true)}
              disabled={busy}
            >
              {messages.player.editRegistration}
            </button>
            <button
              type="button"
              className="button button-danger"
              onClick={() => setPending({ kind: 'withdraw' })}
              disabled={busy}
            >
              {messages.player.withdraw}
            </button>
          </div>
        </section>
      ) : null}

      {myPlayer && editing ? (
        <PlayerForm
          mode="edit"
          roomId={roomId}
          initialValue={{
            displayName: myPlayer.displayName,
            eligibleRoles: myPlayer.eligibleRoles,
            rolePreferenceGroups: myPlayer.rolePreferenceGroups,
            roleRanks: myPlayer.roleRanks,
          }}
          submitting={formSubmitting}
          errorMessage={formError}
          errorDetails={formErrorDetails}
          onSubmit={(input) => void handleUpdate(input)}
          onCancel={() => {
            setEditing(false);
            setFormError(null);
          }}
        />
      ) : null}

      {!myPlayer ? (
        room.status === 'open' ? (
          players.length >= MAX_PLAYERS ? (
            <section className="card">
              <h2>{messages.player.roomFullTitle}</h2>
              <p className="empty-state">{messages.player.roomFullBody(MAX_PLAYERS)}</p>
            </section>
          ) : (
            <PlayerForm
              mode="create"
              roomId={roomId}
              submitting={formSubmitting}
              errorMessage={formError}
              errorDetails={formErrorDetails}
              turnstileSiteKey={config?.turnstileSiteKey ?? null}
              onSubmit={(input, token) => void handleJoin(input, token)}
            />
          )
        ) : (
          <section className="card">
            <h2>{messages.player.roomFullTitle}</h2>
            <p className="empty-state">{messages.player.closedBody}</p>
          </section>
        )
      ) : null}

      {/* キャプテンドラフト（開始フォームは主催者のみ、盤面は全員に見せる） */}
      {isHost && showDraftSetup && !room.draft ? (
        <section className="card">
          <div className="card-header">
            <h2>{messages.draft.title}</h2>
          </div>
          <DraftSetup
            players={players.filter((player) => player.active)}
            busy={busy}
            errorMessage={draftError}
            onStart={handleStartDraft}
            onCancel={() => {
              setShowDraftSetup(false);
              setDraftError(null);
            }}
          />
        </section>
      ) : null}

      {room.draft ? (
        <section className="card">
          <div className="card-header">
            <h2>{messages.draft.title}</h2>
            <p className="card-meta">
              {room.draft.status === 'completed'
                ? messages.draft.completed
                : messages.draft.inProgress}
            </p>
          </div>
          <DraftBoard
            draft={room.draft}
            players={players.filter((player) => player.active)}
            myPlayerId={myPlayerId}
            isHost={isHost}
            busy={busy}
            errorMessage={draftError}
            onPick={(playerId, role) => void handleDraftPick(playerId, role)}
            onCancel={handleCancelDraft}
          />
        </section>
      ) : null}

      <PlayerList
        players={players}
        myPlayerId={myPlayerId}
        isHost={isHost}
        selectionEnabled={selectionEnabled}
        busy={busy}
        onToggleActive={(playerId, nextActive) => {
          setSelection((current) =>
            nextActive
              ? current.includes(playerId)
                ? current
                : [...current, playerId]
              : current.filter((id) => id !== playerId),
          );
        }}
        onRemove={(player) => setPending({ kind: 'removePlayer', player })}
        onEdit={(player) => {
          setHostEditError(null);
          setHostEditingPlayer(player);
        }}
      />

      {/* 主催者による参加者の修正 */}
      {isHost && hostEditingPlayer ? (
        <PlayerForm
          key={hostEditingPlayer.id}
          mode="edit"
          roomId={roomId}
          subjectName={hostEditingPlayer.displayName}
          initialValue={{
            displayName: hostEditingPlayer.displayName,
            eligibleRoles: hostEditingPlayer.eligibleRoles,
            rolePreferenceGroups: hostEditingPlayer.rolePreferenceGroups,
            roleRanks: hostEditingPlayer.roleRanks,
          }}
          submitting={busy}
          errorMessage={hostEditError}
          onSubmit={(input) => void handleHostEditPlayer(hostEditingPlayer, input)}
          onCancel={() => {
            setHostEditingPlayer(null);
            setHostEditError(null);
          }}
        />
      ) : null}

      {room.selectedCandidate ? (
        <section className="card">
          <div className="card-header">
            <h2>{messages.teams.confirmedTitle}</h2>
          </div>
          {editingLineup && isHost ? (
            <LineupEditor
              candidate={room.selectedCandidate}
              players={players.filter((player) => player.active)}
              busy={busy}
              onSave={handleSaveLineup}
              onCancel={() => setEditingLineup(false)}
            />
          ) : (
            <>
              <SelectedTeams candidate={room.selectedCandidate} />
              <div className="button-row">
                <button
                  type="button"
                  className="button button-primary"
                  onClick={() => void copyToClipboard(discordText, messages.teams.copied)}
                >
                  {messages.teams.copyDiscord}
                </button>
                {isHost ? (
                  <button
                    type="button"
                    className="button"
                    onClick={() => setEditingLineup(true)}
                    disabled={busy}
                  >
                    {messages.teams.manualAdjust}
                  </button>
                ) : null}
              </div>
            </>
          )}
          <details className="copy-fallback">
            <summary>{messages.teams.copyFallback}</summary>
            <textarea
              readOnly
              rows={12}
              value={discordText}
              aria-label={messages.teams.discordTextLabel}
            />
          </details>
        </section>
      ) : null}

      {isHost && room.candidates && room.candidates.length > 0 ? (
        <section className="card">
          <div className="card-header">
            <h2>{messages.teams.candidatesTitle(room.candidates.length)}</h2>
            <p className="card-meta">{messages.teams.candidatesHint}</p>
          </div>
          <div className="candidate-grid">
            {room.candidates.map((candidate, index) => (
              <TeamCandidateCard
                key={candidate.id}
                candidate={candidate}
                index={index}
                selected={room.selectedCandidate?.id === candidate.id}
                onSelect={handleSelectCandidate}
                busy={busy}
              />
            ))}
          </div>
        </section>
      ) : null}

      <ConfirmDialog
        open={pending.kind === 'withdraw'}
        title={messages.dialog.withdrawTitle}
        description={messages.dialog.withdrawBody}
        confirmLabel={messages.dialog.withdrawConfirm}
        busy={busy}
        onConfirm={() => void handleWithdraw()}
        onCancel={() => setPending({ kind: 'none' })}
      />
      <ConfirmDialog
        open={pending.kind === 'removePlayer'}
        title={messages.dialog.removePlayerTitle}
        description={
          pending.kind === 'removePlayer'
            ? messages.dialog.removePlayerBody(pending.player.displayName)
            : ''
        }
        confirmLabel={messages.dialog.removeConfirm}
        busy={busy}
        onConfirm={() => {
          if (pending.kind === 'removePlayer') handleRemovePlayer(pending.player);
        }}
        onCancel={() => setPending({ kind: 'none' })}
      />
      <ConfirmDialog
        open={pending.kind === 'deleteRoom'}
        title={messages.dialog.deleteRoomTitle}
        description={messages.dialog.deleteRoomBody}
        confirmLabel={messages.dialog.removeConfirm}
        busy={busy}
        onConfirm={handleDeleteRoom}
        onCancel={() => setPending({ kind: 'none' })}
      />
      <ConfirmDialog
        open={pending.kind === 'clearSelection'}
        title={messages.dialog.clearSelectionTitle}
        description={messages.dialog.clearSelectionBody}
        confirmLabel={messages.dialog.clearSelectionConfirm}
        busy={busy}
        onConfirm={handleClearSelection}
        onCancel={() => setPending({ kind: 'none' })}
      />
    </div>
  );
}
