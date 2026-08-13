/**
 * 表示言語の管理。
 *
 * 優先順位は「利用者が画面で選んだ言語 → ブラウザの言語設定 → 日本語」。
 * 選択は localStorage に保存し、次回以降も引き継ぐ。
 */

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import {
  DEFAULT_LOCALE,
  getMessages,
  isLocale,
  LOCALE_HTML_LANG,
  resolveLocale,
  type Locale,
  type Messages,
} from '../../shared/i18n';
import { setActiveLocale } from '../lib/api';

const STORAGE_KEY = 'owcb.locale';

interface I18nValue {
  locale: Locale;
  messages: Messages;
  setLocale: (locale: Locale) => void;
}

const I18nContext = createContext<I18nValue | null>(null);

function readStoredLocale(): Locale | null {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    return isLocale(raw) ? raw : null;
  } catch {
    // プライベートモード等で localStorage が使えない場合は無視する
    return null;
  }
}

function storeLocale(locale: Locale): void {
  try {
    window.localStorage.setItem(STORAGE_KEY, locale);
  } catch {
    // 保存できなくても表示自体は継続できるため無視する
  }
}

function detectInitialLocale(): Locale {
  const stored = readStoredLocale();
  if (stored) return stored;
  const languages = navigator.languages.length > 0 ? navigator.languages : [navigator.language];
  return resolveLocale(languages) ?? DEFAULT_LOCALE;
}

export function I18nProvider({ children }: { children: ReactNode }) {
  const [locale, setLocaleState] = useState<Locale>(detectInitialLocale);

  // サーバーが返す文面（チーム分けの失敗理由など）も同じ言語になるようにする。
  // 子の useEffect は親より先に走るため、初回リクエストに間に合わせるには
  // レンダー時点で設定しておく必要がある（モジュール変数への代入のみで冪等）。
  setActiveLocale(locale);

  useEffect(() => {
    document.documentElement.lang = LOCALE_HTML_LANG[locale];
    setActiveLocale(locale);
  }, [locale]);

  const setLocale = useCallback((next: Locale) => {
    setLocaleState(next);
    storeLocale(next);
  }, []);

  const value = useMemo<I18nValue>(
    () => ({ locale, messages: getMessages(locale), setLocale }),
    [locale, setLocale],
  );

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n(): I18nValue {
  const value = useContext(I18nContext);
  if (!value) {
    throw new Error('useI18n must be used inside <I18nProvider>');
  }
  return value;
}

/** 文面だけが必要な場合の短縮形 */
export function useMessages(): Messages {
  return useI18n().messages;
}
