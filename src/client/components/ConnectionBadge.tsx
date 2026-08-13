/** 接続状態の表示。色だけに頼らずアイコンと文言でも状態を示す。 */

import { useMessages } from '../hooks/useI18n';
import type { ConnectionState } from '../hooks/useRoomChannel';

const ICONS: Record<ConnectionState, string> = {
  connecting: '◌',
  open: '●',
  reconnecting: '◍',
  offline: '✕',
};

export function ConnectionBadge({ state }: { state: ConnectionState }) {
  const messages = useMessages();
  return (
    <span className={`connection connection-${state}`} role="status" aria-live="polite">
      <span aria-hidden="true" className="connection-icon">
        {ICONS[state]}
      </span>
      {messages.connection[state]}
    </span>
  );
}
