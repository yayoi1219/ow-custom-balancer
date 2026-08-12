/** 公開設定（Turnstile の site key など）をサーバーから取得する。 */

import { useEffect, useState } from 'react';
import type { PublicConfig } from '../../shared/types';
import { api } from '../lib/api';

export interface ConfigState {
  config: PublicConfig | null;
  loading: boolean;
  error: string | null;
}

export function useConfig(): ConfigState {
  const [config, setConfig] = useState<PublicConfig | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    api
      .getConfig(controller.signal)
      .then((value) => {
        setConfig(value);
        setLoading(false);
      })
      .catch((caught: unknown) => {
        if (caught instanceof DOMException && caught.name === 'AbortError') return;
        setError('設定の取得に失敗しました。ページを再読み込みしてください。');
        setLoading(false);
      });
    return () => controller.abort();
  }, []);

  return { config, loading, error };
}
