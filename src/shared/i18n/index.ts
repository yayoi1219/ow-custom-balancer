/**
 * 多言語辞書のエントリポイント。
 *
 * 辞書は「純粋なデータ + 純粋な関数」だけで構成し、クライアント／Worker の
 * どちらからも同じように使えるようにしている（React 依存はここには置かない）。
 */

import type { Role } from '../constants';
import type { ErrorCode } from '../errors';
import type { RankTier, RankValue } from '../ranks';
import { RANK_TIER_SHORT_LABELS, tierHasDivisions } from '../ranks';
import { en } from './en';
import { ja, type Messages } from './ja';
import { ko } from './ko';
import { LOCALES, isLocale, resolveLocale, type Locale } from './types';
import { zh } from './zh';

export { ja, en, ko, zh };
export type { Messages };
export * from './types';

const BUNDLES: Record<Locale, Messages> = { ja, en, ko, zh };

/** 既定の言語。辞書の正本でもある。 */
export const DEFAULT_LOCALE: Locale = 'ja';

export function getMessages(locale: Locale): Messages {
  return BUNDLES[locale] ?? BUNDLES[DEFAULT_LOCALE];
}

/**
 * `Accept-Language` ヘッダーから対応言語を選ぶ。
 * 品質値（q=）を考慮し、対応していない言語は読み飛ばす。
 */
export function localeFromAcceptLanguage(header: string | null | undefined): Locale | null {
  if (!header) return null;
  const entries = header
    .split(',')
    .map((part) => {
      const [tag, ...params] = part.trim().split(';');
      const q = params
        .map((p) => p.trim())
        .find((p) => p.startsWith('q='))
        ?.slice(2);
      const quality = q === undefined ? 1 : Number.parseFloat(q);
      return { tag: tag.trim(), quality: Number.isFinite(quality) ? quality : 0 };
    })
    .filter((entry) => entry.tag.length > 0 && entry.quality > 0)
    .sort((a, b) => b.quality - a.quality);
  return resolveLocale(entries.map((entry) => entry.tag));
}

/**
 * リクエストから言語を決める。
 * 明示ヘッダー（利用者が画面で選んだ言語）を最優先し、次にブラウザ設定を見る。
 */
export const LOCALE_HEADER = 'X-OWCB-Locale';

export function localeFromRequest(request: Request): Locale {
  const explicit = request.headers.get(LOCALE_HEADER);
  if (isLocale(explicit)) return explicit;
  return localeFromAcceptLanguage(request.headers.get('Accept-Language')) ?? DEFAULT_LOCALE;
}

/** エラーコードを、その言語のメッセージへ変換する */
export function translateErrorCode(messages: Messages, code: ErrorCode): string {
  return messages.errors[code] ?? messages.errors.INTERNAL_ERROR;
}

/**
 * バリデーションのキー（例: `displayName.tooLong`）を訳文へ変換する。
 * 未知のキーはそのまま返さず、汎用メッセージへ落とす（内部キーを画面に出さないため）。
 */
export function translateValidationKey(messages: Messages, key: string): string {
  const table: Record<string, string> = messages.validation;
  return table[key] ?? messages.errors.VALIDATION_ERROR;
}

export function translateValidationKeys(messages: Messages, keys: readonly string[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const key of keys) {
    const text = translateValidationKey(messages, key);
    if (seen.has(text)) continue;
    seen.add(text);
    result.push(text);
  }
  return result;
}

/** その言語でのロール名 */
export function roleLabel(messages: Messages, role: Role): string {
  return messages.roles[role];
}

/** その言語でのティア名 */
export function tierLabel(messages: Messages, tier: RankTier): string {
  return messages.tiers[tier];
}

/** 「Diamond 3」「冠军」のような表示文字列を、その言語で作る */
export function formatRankLocalized(messages: Messages, rank: RankValue): string {
  const label = tierLabel(messages, rank.tier);
  if (!tierHasDivisions(rank.tier)) return label;
  return `${label} ${String(rank.division)}`;
}

/**
 * 一覧用の短縮表記。
 * 短縮コード（BRZ/DIA など）は桁数が揃っていて言語に依存しないため全言語で共通にする。
 */
export function formatRankShortLocalized(_messages: Messages, rank: RankValue): string {
  const label = RANK_TIER_SHORT_LABELS[rank.tier];
  if (!tierHasDivisions(rank.tier)) return label;
  return `${label}${String(rank.division)}`;
}

/** 対応言語の一覧（切り替えUI用） */
export const SUPPORTED_LOCALES = LOCALES;
