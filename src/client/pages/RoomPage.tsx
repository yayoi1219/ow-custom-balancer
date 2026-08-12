/** 部屋ページ。権限に応じて参加者向け／主催者向けの表示を切り替える。 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { MAX_PLAYERS, REQUIRED_ACTIVE_PLAYERS, SERVICE_NAME } from '../../shared/constants';
import { formatDiscordResult } from '../../shared/discord';
import type {
  PlayerInput,
  PlayerPublic,
  RoomSnapshot,
  TeamCandidate,
  ViewerInfo,
} from '../../shared/types';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { ConnectionBadge } from '../components/ConnectionBadge';
import { PlayerForm } from '../components/PlayerForm';
import { PlayerList, RoleRankTags } from '../components/PlayerList';
import { SelectedTeams, TeamCandidateCard } from '../components/TeamView';
import { useToast } from '../components/Toast';
import { useConfig } from '../hooks/useConfig';
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

  const handleApiError = useCallback((caught: unknown, fallback: string): string => {
    if (caught instanceof ApiError) return caught.message;
    return fallback;
  }, []);

  const participantUrl = `${window.location.origin}/room/${roomId}`;

  const copyToClipboard = useCallback(
    async (text: string, successMessage: string): Promise<void> => {
      const copied = await copyText(text);
      showToast(
        copied ? successMessage : 'コピーできませんでした。テキストを選択してコピーしてください。',
        copied ? 'success' : 'error',
      );
    },
    [showToast],
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
      showToast('参加登録が完了しました。');
    } catch (caught) {
      setFormError(handleApiError(caught, '参加登録に失敗しました。'));
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
      showToast('登録内容を更新しました。');
    } catch (caught) {
      setFormError(handleApiError(caught, '更新に失敗しました。'));
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
      showToast('参加を辞退しました。');
    } catch (caught) {
      setActionError(handleApiError(caught, '辞退に失敗しました。'));
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
      showToast(status === 'open' ? '募集を開始しました。' : '募集を締め切りました。');
    }, '募集状態の変更に失敗しました。');
  };

  const handleApplySelection = (): void => {
    void runHostAction(async (token) => {
      const result = await api.setActivePlayers(roomId, selection, token);
      channel.applyState(result.room, result.viewer);
      showToast('アクティブ参加者を更新しました。');
    }, 'アクティブ参加者の更新に失敗しました。');
  };

  const handleGenerate = (): void => {
    setLineupReasons([]);
    void runHostAction(async (token) => {
      try {
        const result = await api.generateCandidates(roomId, token);
        channel.applyState(result.room, result.viewer);
        showToast(`チーム候補を${result.candidates.length}件作成しました。`);
      } catch (caught) {
        if (caught instanceof ApiError && caught.details.length > 0) {
          setLineupReasons(caught.details);
        }
        throw caught;
      }
    }, 'チーム候補の作成に失敗しました。');
  };

  const handleSelectCandidate = (candidate: TeamCandidate): void => {
    void runHostAction(async (token) => {
      const result = await api.selectCandidate(roomId, candidate.id, token);
      channel.applyState(result.room, result.viewer);
      showToast('チームを確定しました。');
    }, 'チームの確定に失敗しました。');
  };

  const handleClearSelection = (): void => {
    void runHostAction(async (token) => {
      const result = await api.clearSelectedCandidate(roomId, token);
      channel.applyState(result.room, result.viewer);
      showToast('確定を解除しました。');
    }, '確定の解除に失敗しました。');
    setPending({ kind: 'none' });
  };

  const handleRemovePlayer = (player: PlayerPublic): void => {
    void runHostAction(async (token) => {
      const result = await api.removePlayer(roomId, player.id, token);
      channel.applyState(result.room, result.viewer);
      showToast(`${player.displayName} を削除しました。`);
    }, '参加者の削除に失敗しました。');
    setPending({ kind: 'none' });
  };

  const handleDeleteRoom = (): void => {
    void runHostAction(async (token) => {
      await api.deleteRoom(roomId, token);
      clearHostToken(roomId);
      clearPlayerCredential(roomId);
      clearDraft(roomId);
      showToast('部屋を削除しました。');
      navigate('/');
    }, '部屋の削除に失敗しました。');
    setPending({ kind: 'none' });
  };

  /* ---------------- 表示 ---------------- */

  if (!initialized || loading) {
    return (
      <div className="page">
        <div className="card">
          <p className="loading">読み込み中…</p>
        </div>
      </div>
    );
  }

  if (notFound) {
    return (
      <div className="page">
        <div className="card">
          <h1>部屋が見つかりません</h1>
          <p>URL が正しいか確認してください。部屋は作成から24時間で削除されます。</p>
          <p className="links">
            <Link href="/">トップページへ戻る</Link>
          </p>
        </div>
      </div>
    );
  }

  if (expired) {
    return (
      <div className="page">
        <div className="card">
          <h1>この部屋は終了しました</h1>
          <p>
            有効期限切れ、または主催者によって削除されたため、参加者情報とチーム結果は削除されました。
          </p>
          <p className="links">
            <Link href="/">新しい部屋を作る</Link>
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
            {channel.errorMessage ?? '部屋の情報を取得できませんでした。'}
          </p>
          <button type="button" className="button" onClick={channel.refresh}>
            再読み込み
          </button>
        </div>
      </div>
    );
  }

  const players = room.players;
  const activeCount = players.filter((player) => player.active).length;
  const selectionEnabled = isHost && players.length > REQUIRED_ACTIVE_PLAYERS;
  const discordText = room.selectedCandidate
    ? formatDiscordResult(room.selectedCandidate, room.title)
    : '';

  return (
    <div className="page">
      <header className="room-header card">
        <div className="room-header-main">
          <h1>{room.title}</h1>
          <div className="room-badges">
            <span className={`badge badge-status-${room.status}`}>
              {room.status === 'open' ? '募集中' : '募集締切'}
            </span>
            {isHost ? <span className="badge badge-host">主催者</span> : null}
            <ConnectionBadge state={connection} />
          </div>
        </div>
        <dl className="room-meta">
          <div>
            <dt>参加者</dt>
            <dd>
              {players.length} / {MAX_PLAYERS}人（アクティブ {activeCount}人）
            </dd>
          </div>
          <div>
            <dt>有効期限</dt>
            <dd>
              {formatDateTimeLocal(room.expiresAt)}（{formatRemaining(room.expiresAt)}）
            </dd>
          </div>
        </dl>
        {connection === 'reconnecting' || connection === 'offline' ? (
          <p className="notice notice-warn" role="status">
            {connection === 'offline'
              ? 'オフラインです。接続が回復すると自動的に再接続します。入力中の内容は保持されます。'
              : '再接続中です。しばらくお待ちください。'}
          </p>
        ) : null}
      </header>

      {isHost ? (
        <section className="card host-panel">
          <h2>主催者メニュー</h2>
          <div className="field">
            <p className="field-label">参加者用URL</p>
            <div className="copy-row">
              <input type="text" value={participantUrl} readOnly aria-label="参加者用URL" />
              <button
                type="button"
                className="button"
                onClick={() =>
                  void copyToClipboard(participantUrl, '参加者用URLをコピーしました。')
                }
              >
                コピー
              </button>
            </div>
            <p className="field-help">
              このURLを Discord などに貼ってください。主催者用のURLは共有しないでください。
            </p>
          </div>

          <div className="button-row">
            <button
              type="button"
              className="button"
              onClick={() => handleStatusChange(room.status === 'open' ? 'closed' : 'open')}
              disabled={busy}
            >
              {room.status === 'open' ? '募集を締め切る' : '募集を再開する'}
            </button>
            <button
              type="button"
              className="button button-primary"
              onClick={handleGenerate}
              disabled={busy || activeCount !== REQUIRED_ACTIVE_PLAYERS}
            >
              チーム候補を作成
            </button>
            {room.selectedCandidate ? (
              <button
                type="button"
                className="button button-ghost"
                onClick={() => setPending({ kind: 'clearSelection' })}
                disabled={busy}
              >
                確定を解除
              </button>
            ) : null}
            <button
              type="button"
              className="button button-danger"
              onClick={() => setPending({ kind: 'deleteRoom' })}
              disabled={busy}
            >
              部屋を削除
            </button>
          </div>

          {activeCount !== REQUIRED_ACTIVE_PLAYERS ? (
            <p className="notice">
              チーム候補の作成にはアクティブ参加者がちょうど{REQUIRED_ACTIVE_PLAYERS}
              人必要です（現在
              {activeCount}人）。
            </p>
          ) : null}

          {selectionEnabled ? (
            <div className="field">
              <p className="field-label">
                今回参加する{REQUIRED_ACTIVE_PLAYERS}人を選択（選択中 {selection.length}人）
              </p>
              <button
                type="button"
                className="button"
                onClick={handleApplySelection}
                disabled={busy || selection.length !== REQUIRED_ACTIVE_PLAYERS}
              >
                この{REQUIRED_ACTIVE_PLAYERS}人で確定
              </button>
              <p className="field-help">
                下の参加者一覧のチェックボックスで選択し、このボタンを押してください。
              </p>
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
            <h2>あなたの登録</h2>
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
              登録内容を編集
            </button>
            <button
              type="button"
              className="button button-danger"
              onClick={() => setPending({ kind: 'withdraw' })}
              disabled={busy}
            >
              参加を辞退
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
              <h2>参加登録</h2>
              <p className="empty-state">参加者が上限（{MAX_PLAYERS}人）に達しています。</p>
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
            <h2>参加登録</h2>
            <p className="empty-state">現在は募集を締め切っています。</p>
          </section>
        )
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
      />

      {room.selectedCandidate ? (
        <section className="card">
          <div className="card-header">
            <h2>確定チーム</h2>
          </div>
          <SelectedTeams candidate={room.selectedCandidate} />
          <div className="button-row">
            <button
              type="button"
              className="button button-primary"
              onClick={() =>
                void copyToClipboard(discordText, 'Discord用テキストをコピーしました。')
              }
            >
              Discord用テキストをコピー
            </button>
          </div>
          <details className="copy-fallback">
            <summary>コピーできない場合はこちら</summary>
            <textarea readOnly rows={12} value={discordText} aria-label="Discord用テキスト" />
          </details>
        </section>
      ) : null}

      {isHost && room.candidates && room.candidates.length > 0 ? (
        <section className="card">
          <div className="card-header">
            <h2>チーム候補（{room.candidates.length}件）</h2>
            <p className="card-meta">スコアが低いほどバランスが良い候補です。</p>
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
        title="参加を辞退しますか？"
        description="登録内容が削除されます。再度参加するには、もう一度登録が必要です。"
        confirmLabel="辞退する"
        busy={busy}
        onConfirm={() => void handleWithdraw()}
        onCancel={() => setPending({ kind: 'none' })}
      />
      <ConfirmDialog
        open={pending.kind === 'removePlayer'}
        title="この参加者を削除しますか？"
        description={
          pending.kind === 'removePlayer'
            ? `${pending.player.displayName} の登録内容を削除します。`
            : ''
        }
        confirmLabel="削除する"
        busy={busy}
        onConfirm={() => {
          if (pending.kind === 'removePlayer') handleRemovePlayer(pending.player);
        }}
        onCancel={() => setPending({ kind: 'none' })}
      />
      <ConfirmDialog
        open={pending.kind === 'deleteRoom'}
        title="部屋を削除しますか？"
        description="参加者情報と確定結果がすべて削除され、URLは使用できなくなります。"
        confirmLabel="削除する"
        busy={busy}
        onConfirm={handleDeleteRoom}
        onCancel={() => setPending({ kind: 'none' })}
      />
      <ConfirmDialog
        open={pending.kind === 'clearSelection'}
        title="チームの確定を解除しますか？"
        description="全参加者の画面から確定結果が消えます。候補からもう一度選び直せます。"
        confirmLabel="解除する"
        busy={busy}
        onConfirm={handleClearSelection}
        onCancel={() => setPending({ kind: 'none' })}
      />
    </div>
  );
}
