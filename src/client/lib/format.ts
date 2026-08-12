/** 表示用のフォーマット。日時は UTC(ISO 8601) で受け取り、表示時のみローカル化する。 */

export function formatDateTimeLocal(isoString: string): string {
  const date = new Date(isoString);
  if (Number.isNaN(date.getTime())) return '-';
  return new Intl.DateTimeFormat('ja-JP', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date);
}

/** 「あと約3時間」のような残り時間表示 */
export function formatRemaining(isoString: string, now: number = Date.now()): string {
  const target = new Date(isoString).getTime();
  if (Number.isNaN(target)) return '-';
  const diff = target - now;
  if (diff <= 0) return '期限切れ';
  const minutes = Math.floor(diff / 60000);
  if (minutes < 60) return `あと約${minutes}分`;
  const hours = Math.floor(minutes / 60);
  return `あと約${hours}時間`;
}

/** 小数を短く表示する（例: 2, 2.5） */
export function formatNumber(value: number): string {
  return Number.isInteger(value) ? String(value) : value.toFixed(1);
}
