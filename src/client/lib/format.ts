/** 表示用のフォーマット。日時は UTC(ISO 8601) で受け取り、表示時のみローカル化する。 */

import { LOCALE_HTML_LANG, type Locale, type Messages } from '../../shared/i18n';

export function formatDateTimeLocal(isoString: string, locale: Locale): string {
  const date = new Date(isoString);
  if (Number.isNaN(date.getTime())) return '-';
  return new Intl.DateTimeFormat(LOCALE_HTML_LANG[locale], {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date);
}

/** 「あと約3時間」のような残り時間表示 */
export function formatRemaining(
  isoString: string,
  messages: Messages,
  now: number = Date.now(),
): string {
  const target = new Date(isoString).getTime();
  if (Number.isNaN(target)) return '-';
  const diff = target - now;
  if (diff <= 0) return messages.room.expiredShort;
  const minutes = Math.floor(diff / 60000);
  if (minutes < 60) return messages.room.remainingMinutes(minutes);
  const hours = Math.floor(minutes / 60);
  return messages.room.remainingHours(hours);
}

/** 小数を短く表示する（例: 2, 2.5） */
export function formatNumber(value: number): string {
  return Number.isInteger(value) ? String(value) : value.toFixed(1);
}
