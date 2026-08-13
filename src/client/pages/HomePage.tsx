/** トップページ: サービス説明と部屋作成。 */

import { useEffect, useState, type FormEvent } from 'react';
import { ROOM_TITLE_MAX_LENGTH, SERVICE_NAME } from '../../shared/constants';
import { Turnstile } from '../components/Turnstile';
import { useConfig } from '../hooks/useConfig';
import { useMessages } from '../hooks/useI18n';
import { ApiError, api } from '../lib/api';
import { saveHostToken } from '../lib/storage';
import { Link, navigate } from '../router';

export function HomePage() {
  const messages = useMessages();
  const { config, loading: configLoading, error: configError } = useConfig();
  const [title, setTitle] = useState('');
  const [turnstileToken, setTurnstileToken] = useState<string | null>(null);
  const [turnstileResetKey, setTurnstileResetKey] = useState(0);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    document.title = `${SERVICE_NAME} - ${messages.home.titleSuffix}`;
  }, [messages]);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>): Promise<void> => {
    event.preventDefault();
    setError(null);
    if (title.trim().length === 0) {
      setError(messages.home.roomNameRequired);
      return;
    }
    if (!turnstileToken) {
      setError(messages.errors.TURNSTILE_REQUIRED);
      return;
    }
    setSubmitting(true);
    try {
      const result = await api.createRoom(title, turnstileToken);
      // 主催者トークンは localStorage に保存し、URLフラグメント経由で共有できるようにする
      saveHostToken(result.roomId, result.hostToken);
      navigate(`/room/${result.roomId}#host=${encodeURIComponent(result.hostToken)}`);
    } catch (caught) {
      const message =
        caught instanceof ApiError
          ? (messages.errors[caught.code] ?? caught.message)
          : messages.home.createFailed;
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
        <p className="lead">{messages.common.serviceTagline}</p>
      </section>

      <form className="card form" onSubmit={handleSubmit} noValidate>
        <h2>{messages.home.createRoom}</h2>
        <div className="field">
          <label htmlFor="room-title">
            {messages.home.roomName} <span className="required">{messages.common.required}</span>
          </label>
          <input
            id="room-title"
            type="text"
            value={title}
            maxLength={ROOM_TITLE_MAX_LENGTH * 2}
            autoComplete="off"
            disabled={submitting}
            placeholder={messages.home.roomNamePlaceholder}
            onChange={(event) => setTitle(event.target.value)}
            aria-describedby="room-title-help"
          />
          <p className="field-help" id="room-title-help">
            {messages.home.roomNameHelp}
          </p>
        </div>

        {configLoading ? (
          <p className="loading">{messages.home.preparingTurnstile}</p>
        ) : configError ? (
          <p className="field-error" role="alert">
            {messages.home.configLoadFailed}
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
            {submitting ? messages.home.creating : messages.home.createButton}
          </button>
        </div>
      </form>

      <section className="card">
        <h2>{messages.home.howToUse}</h2>
        <ol className="steps">
          <li>{messages.home.step1}</li>
          <li>{messages.home.step2}</li>
          <li>{messages.home.step3}</li>
          <li>{messages.home.step4}</li>
          <li>{messages.home.step5}</li>
          <li>{messages.home.step6}</li>
        </ol>
        <p className="note">{messages.home.retentionNote}</p>
      </section>

      <section className="card">
        <h2>{messages.home.aboutTitle}</h2>
        <p>{messages.home.aboutBody}</p>
        <p className="links">
          <Link href="/privacy">{messages.common.privacy}</Link>
          <span aria-hidden="true"> / </span>
          <Link href="/terms">{messages.common.terms}</Link>
        </p>
      </section>
    </div>
  );
}
