/** 破壊的操作の前に表示する確認ダイアログ（キーボード操作対応）。 */

import { useEffect, useRef } from 'react';
import { useMessages } from '../hooks/useI18n';

export interface ConfirmDialogProps {
  open: boolean;
  title: string;
  description: string;
  /** 省略時は「実行する」相当の既定文言を使う */
  confirmLabel?: string;
  cancelLabel?: string;
  destructive?: boolean;
  busy?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

export function ConfirmDialog({
  open,
  title,
  description,
  confirmLabel,
  cancelLabel,
  destructive = true,
  busy = false,
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  const messages = useMessages();
  const confirmRef = useRef<HTMLButtonElement | null>(null);
  const dialogRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!open) return;
    const previouslyFocused = document.activeElement as HTMLElement | null;
    confirmRef.current?.focus();

    const handleKeyDown = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') {
        event.preventDefault();
        onCancel();
        return;
      }
      if (event.key !== 'Tab') return;
      // 単純なフォーカストラップ
      const focusable = dialogRef.current?.querySelectorAll<HTMLElement>('button:not([disabled])');
      if (!focusable || focusable.length === 0) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      previouslyFocused?.focus?.();
    };
  }, [open, onCancel]);

  if (!open) return null;

  return (
    <div className="dialog-backdrop" onClick={onCancel}>
      <div
        className="dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="confirm-dialog-title"
        aria-describedby="confirm-dialog-description"
        ref={dialogRef}
        onClick={(event) => event.stopPropagation()}
      >
        <h2 id="confirm-dialog-title">{title}</h2>
        <p id="confirm-dialog-description">{description}</p>
        <div className="dialog-actions">
          <button type="button" className="button button-ghost" onClick={onCancel} disabled={busy}>
            {cancelLabel ?? messages.common.cancel}
          </button>
          <button
            type="button"
            className={destructive ? 'button button-danger' : 'button button-primary'}
            onClick={onConfirm}
            ref={confirmRef}
            disabled={busy}
          >
            {busy ? messages.dialog.processing : (confirmLabel ?? messages.dialog.defaultConfirm)}
          </button>
        </div>
      </div>
    </div>
  );
}
