/** トップページ: サービス説明と部屋作成。 */

import { useEffect, useState, type FormEvent } from 'react';
import {
  MAX_PLAYERS,
  REQUIRED_ACTIVE_PLAYERS,
  ROOM_TITLE_MAX_LENGTH,
  SERVICE_DESCRIPTION,
  SERVICE_NAME,
} from '../../shared/constants';
import { Turnstile } from '../components/Turnstile';
import { useConfig } from '../hooks/useConfig';
import { ApiError, api } from '../lib/api';
import { saveHostToken } from '../lib/storage';
import { Link, navigate } from '../router';

export function HomePage() {
  const { config, loading: configLoading, error: configError } = useConfig();
  const [title, setTitle] = useState('');
  const [turnstileToken, setTurnstileToken] = useState<string | null>(null);
  const [turnstileResetKey, setTurnstileResetKey] = useState(0);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    document.title = `${SERVICE_NAME} - Overwatch 2 カスタム用チーム分け`;
  }, []);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>): Promise<void> => {
    event.preventDefault();
    setError(null);
    if (title.trim().length === 0) {
      setError('部屋名を入力してください。');
      return;
    }
    if (!turnstileToken) {
      setError('認証（Turnstile）を完了してください。');
      return;
    }
    setSubmitting(true);
    try {
      const result = await api.createRoom(title, turnstileToken);
      // 主催者トークンは localStorage に保存し、URLフラグメント経由で共有できるようにする
      saveHostToken(result.roomId, result.hostToken);
      navigate(`/room/${result.roomId}#host=${encodeURIComponent(result.hostToken)}`);
    } catch (caught) {
      const message = caught instanceof ApiError ? caught.message : '部屋の作成に失敗しました。';
      setError(message);
      // Turnstile トークンは使い回せないため必ず取り直す
      setTurnstileToken(null);
      setTurnstileResetKey((key) => key + 1);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="page">
      <section className="hero">
        <h1>{SERVICE_NAME}</h1>
        <p className="lead">{SERVICE_DESCRIPTION}</p>
      </section>

      <form className="card form" onSubmit={handleSubmit} noValidate>
        <h2>カスタム部屋を作る</h2>
        <div className="field">
          <label htmlFor="room-title">
            部屋名 <span className="required">必須</span>
          </label>
          <input
            id="room-title"
            type="text"
            value={title}
            maxLength={ROOM_TITLE_MAX_LENGTH * 2}
            autoComplete="off"
            disabled={submitting}
            placeholder="例: 金曜カスタム 22時"
            onChange={(event) => setTitle(event.target.value)}
            aria-describedby="room-title-help"
          />
          <p className="field-help" id="room-title-help">
            {ROOM_TITLE_MAX_LENGTH}文字以内。参加者にも表示されます。
          </p>
        </div>

        {configLoading ? (
          <p className="loading">認証ウィジェットを準備しています…</p>
        ) : configError ? (
          <p className="field-error" role="alert">
            {configError}
          </p>
        ) : config ? (
          <div className="field">
            <Turnstile
              siteKey={config.turnstileSiteKey}
              action="create-room"
              resetKey={turnstileResetKey}
              onToken={setTurnstileToken}
            />
          </div>
        ) : null}

        {error ? (
          <p className="field-error" role="alert">
            {error}
          </p>
        ) : null}

        <div className="form-actions">
          <button
            type="submit"
            className="button button-primary"
            disabled={submitting || configLoading}
          >
            {submitting ? '作成中…' : '部屋を作成する'}
          </button>
        </div>
      </form>

      <section className="card">
        <h2>使い方</h2>
        <ol className="steps">
          <li>部屋名を入力して部屋を作成します。</li>
          <li>発行された「参加者用URL」を Discord などに貼ります。</li>
          <li>参加者は名前・担当できるロール・希望順位・ロール別ランクを登録します。</li>
          <li>
            参加者が{MAX_PLAYERS}人まで集まったら、主催者が今回参加する
            {REQUIRED_ACTIVE_PLAYERS}人を選びます。
          </li>
          <li>「チーム候補を作成」でバランス案を最大5件表示し、1つを確定します。</li>
          <li>確定結果は全員の画面へ即時反映され、Discord用テキストとしてコピーできます。</li>
        </ol>
        <p className="note">
          部屋は作成から24時間で自動的に削除されます。アカウント登録は不要です。
        </p>
      </section>

      <section className="card">
        <h2>このサービスについて</h2>
        <p>
          Overwatch 2 のロールキュー構成（Tank×1・Damage×2・Support×2）に沿って、
          参加者の希望ロールとランクからバランスのよい 5vs5 を提案します。
        </p>
        <p className="links">
          <Link href="/privacy">プライバシーポリシー</Link>
          <span aria-hidden="true"> / </span>
          <Link href="/terms">利用規約</Link>
        </p>
      </section>
    </div>
  );
}
