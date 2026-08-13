/**
 * 多言語対応の型定義。
 *
 * 日本語（ja.ts）を唯一の正本とし、他の言語はその型に適合させる。
 * こうすることで、翻訳キーの追加漏れ・削除漏れが `npm run typecheck` で検出できる。
 * 言語を増やすときは、ja.ts と同じ形の辞書ファイルを1つ足して LOCALES へ登録するだけでよい。
 */

export const LOCALES = ['ja', 'en', 'ko', 'zh'] as const;
export type Locale = (typeof LOCALES)[number];

/** 言語切り替えUIに出す表示名（その言語自身の表記） */
export const LOCALE_LABELS: Record<Locale, string> = {
  ja: '日本語',
  en: 'English',
  ko: '한국어',
  zh: '简体中文',
};

/** `<html lang>` に設定する値 */
export const LOCALE_HTML_LANG: Record<Locale, string> = {
  ja: 'ja',
  en: 'en',
  ko: 'ko',
  zh: 'zh-Hans',
};

/**
 * 法的文面（プライバシーポリシー・利用規約）の正本は日本語とする。
 * 翻訳版で解釈が分かれた場合に備え、非日本語版には注記を表示する。
 */
export const AUTHORITATIVE_LOCALE: Locale = 'ja';

export function isLocale(value: unknown): value is Locale {
  return typeof value === 'string' && (LOCALES as readonly string[]).includes(value);
}

/**
 * ブラウザの言語設定から対応言語を選ぶ。
 * `ja-JP` → `ja`、`zh-CN` / `zh-Hans` → `zh` のように前方一致で解決する。
 */
export function resolveLocale(preferred: readonly string[]): Locale | null {
  for (const raw of preferred) {
    const lower = raw.toLowerCase();
    if (lower.startsWith('ja')) return 'ja';
    if (lower.startsWith('en')) return 'en';
    if (lower.startsWith('ko')) return 'ko';
    if (lower.startsWith('zh')) return 'zh';
  }
  return null;
}
