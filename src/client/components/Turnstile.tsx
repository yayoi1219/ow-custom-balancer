/**
 * Cloudflare Turnstile ウィジェット。
 * 取得したトークンは1回しか使えないため、失敗・期限切れ時は resetKey を変えて張り直す。
 */

import { useEffect, useRef, useState } from 'react';

interface TurnstileRenderOptions {
  sitekey: string;
  callback: (token: string) => void;
  'error-callback'?: () => void;
  'expired-callback'?: () => void;
  'timeout-callback'?: () => void;
  theme?: 'auto' | 'light' | 'dark';
  language?: string;
  action?: string;
  appearance?: 'always' | 'execute' | 'interaction-only';
}

interface TurnstileApi {
  render: (element: HTMLElement, options: TurnstileRenderOptions) => string;
  remove: (widgetId: string) => void;
  reset: (widgetId?: string) => void;
}

declare global {
  interface Window {
    turnstile?: TurnstileApi;
  }
}

const SCRIPT_ID = 'cf-turnstile-script';
const SCRIPT_SRC = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';

let scriptPromise: Promise<void> | null = null;

function loadTurnstileScript(): Promise<void> {
  if (window.turnstile) return Promise.resolve();
  if (scriptPromise) return scriptPromise;
  scriptPromise = new Promise<void>((resolve, reject) => {
    const existing = document.getElementById(SCRIPT_ID);
    if (existing) {
      existing.addEventListener('load', () => resolve());
      existing.addEventListener('error', () => reject(new Error('turnstile script failed')));
      return;
    }
    const script = document.createElement('script');
    script.id = SCRIPT_ID;
    script.src = SCRIPT_SRC;
    script.async = true;
    script.defer = true;
    script.addEventListener('load', () => resolve());
    script.addEventListener('error', () => {
      scriptPromise = null;
      reject(new Error('turnstile script failed'));
    });
    document.head.appendChild(script);
  });
  return scriptPromise;
}

export interface TurnstileProps {
  siteKey: string;
  action: string;
  /** 値を変えるとウィジェットを作り直す */
  resetKey: number;
  onToken: (token: string | null) => void;
}

export function Turnstile({ siteKey, action, resetKey, onToken }: TurnstileProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const onTokenRef = useRef(onToken);
  const [failed, setFailed] = useState(false);
  onTokenRef.current = onToken;

  useEffect(() => {
    let widgetId: string | null = null;
    let cancelled = false;
    setFailed(false);

    void loadTurnstileScript()
      .then(() => {
        if (cancelled || !containerRef.current || !window.turnstile) return;
        containerRef.current.innerHTML = '';
        widgetId = window.turnstile.render(containerRef.current, {
          sitekey: siteKey,
          action,
          theme: 'auto',
          language: 'ja',
          callback: (token: string) => onTokenRef.current(token),
          'error-callback': () => {
            setFailed(true);
            onTokenRef.current(null);
          },
          'expired-callback': () => onTokenRef.current(null),
          'timeout-callback': () => onTokenRef.current(null),
        });
      })
      .catch(() => {
        if (!cancelled) setFailed(true);
      });

    return () => {
      cancelled = true;
      if (widgetId && window.turnstile) {
        try {
          window.turnstile.remove(widgetId);
        } catch {
          // 無視
        }
      }
    };
  }, [siteKey, action, resetKey]);

  return (
    <div className="turnstile">
      <div ref={containerRef} aria-label="ロボットではないことの確認" />
      {failed ? (
        <p className="field-error" role="alert">
          認証ウィジェットを読み込めませんでした。通信環境を確認して再読み込みしてください。
        </p>
      ) : null}
    </div>
  );
}
