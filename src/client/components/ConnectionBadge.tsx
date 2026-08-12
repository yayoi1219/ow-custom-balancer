/** 接続状態の表示。色だけに頼らずアイコンと文言でも状態を示す。 */

import type { ConnectionState } from '../hooks/useRoomChannel';

const LABELS: Record<ConnectionState, { text: string; icon: string }> = {
  connecting: { text: '接続中…', icon: '◌' },
  open: { text: 'リアルタイム接続中', icon: '●' },
  reconnecting: { text: '再接続中…', icon: '◍' },
  offline: { text: 'オフライン', icon: '✕' },
};

export function ConnectionBadge({ state }: { state: ConnectionState }) {
  const label = LABELS[state];
  return (
    <span className={`connection connection-${state}`} role="status" aria-live="polite">
      <span aria-hidden="true" className="connection-icon">
        {label.icon}
      </span>
      {label.text}
    </span>
  );
}
