/**
 * APIエラーコードと、利用者向けの日本語メッセージ。
 * コード（開発者向け・機械可読）とメッセージ（利用者向け）を分離して扱う。
 */

export const ERROR_CODES = {
  BAD_REQUEST: 'BAD_REQUEST',
  INVALID_JSON: 'INVALID_JSON',
  UNSUPPORTED_MEDIA_TYPE: 'UNSUPPORTED_MEDIA_TYPE',
  PAYLOAD_TOO_LARGE: 'PAYLOAD_TOO_LARGE',
  METHOD_NOT_ALLOWED: 'METHOD_NOT_ALLOWED',
  VALIDATION_ERROR: 'VALIDATION_ERROR',
  TURNSTILE_REQUIRED: 'TURNSTILE_REQUIRED',
  TURNSTILE_FAILED: 'TURNSTILE_FAILED',
  RATE_LIMITED: 'RATE_LIMITED',
  UNAUTHORIZED: 'UNAUTHORIZED',
  FORBIDDEN: 'FORBIDDEN',
  NOT_FOUND: 'NOT_FOUND',
  ROOM_NOT_FOUND: 'ROOM_NOT_FOUND',
  ROOM_EXPIRED: 'ROOM_EXPIRED',
  ROOM_CLOSED: 'ROOM_CLOSED',
  ROOM_FULL: 'ROOM_FULL',
  PLAYER_NOT_FOUND: 'PLAYER_NOT_FOUND',
  DUPLICATE_DISPLAY_NAME: 'DUPLICATE_DISPLAY_NAME',
  ACTIVE_COUNT_INVALID: 'ACTIVE_COUNT_INVALID',
  NO_VALID_LINEUP: 'NO_VALID_LINEUP',
  CANDIDATE_NOT_FOUND: 'CANDIDATE_NOT_FOUND',
  CANDIDATES_NOT_GENERATED: 'CANDIDATES_NOT_GENERATED',
  DRAFT_NOT_ACTIVE: 'DRAFT_NOT_ACTIVE',
  NOT_YOUR_TURN: 'NOT_YOUR_TURN',
  CONFIG_ERROR: 'CONFIG_ERROR',
  INTERNAL_ERROR: 'INTERNAL_ERROR',
  NETWORK_ERROR: 'NETWORK_ERROR',
} as const;

export type ErrorCode = (typeof ERROR_CODES)[keyof typeof ERROR_CODES];

/** コードごとの既定の利用者向けメッセージ */
export const ERROR_MESSAGES: Record<ErrorCode, string> = {
  BAD_REQUEST: 'リクエストの内容が正しくありません。',
  INVALID_JSON: 'リクエストの形式が正しくありません。',
  UNSUPPORTED_MEDIA_TYPE: 'サポートされていない形式のリクエストです。',
  PAYLOAD_TOO_LARGE: '送信されたデータが大きすぎます。',
  METHOD_NOT_ALLOWED: 'この操作は許可されていません。',
  VALIDATION_ERROR: '入力内容を確認してください。',
  TURNSTILE_REQUIRED: '認証（Turnstile）を完了してください。',
  TURNSTILE_FAILED: '認証に失敗しました。もう一度お試しください。',
  RATE_LIMITED: '操作が多すぎます。しばらく待ってから再度お試しください。',
  UNAUTHORIZED: 'この操作を行う権限がありません。',
  FORBIDDEN: 'この操作を行う権限がありません。',
  NOT_FOUND: '対象が見つかりません。',
  ROOM_NOT_FOUND: '部屋が見つかりません。URLをご確認ください。',
  ROOM_EXPIRED: 'この部屋は有効期限切れ、または削除されています。',
  ROOM_CLOSED: 'この部屋は現在募集を締め切っています。',
  ROOM_FULL: '参加者が上限に達しています。',
  PLAYER_NOT_FOUND: '参加者が見つかりません。',
  DUPLICATE_DISPLAY_NAME: 'その表示名はすでに使われています。別の名前をご利用ください。',
  ACTIVE_COUNT_INVALID: 'チーム分けにはアクティブ参加者がちょうど10人必要です。',
  NO_VALID_LINEUP: '現在の希望ロールでは有効な構成を作れません。',
  CANDIDATE_NOT_FOUND: '指定されたチーム候補が見つかりません。',
  CANDIDATES_NOT_GENERATED: '先にチーム候補を作成してください。',
  DRAFT_NOT_ACTIVE: '進行中のドラフトがありません。',
  NOT_YOUR_TURN: 'いまはあなたの手番ではありません。',
  CONFIG_ERROR: 'サーバー設定に問題があります。管理者にお問い合わせください。',
  INTERNAL_ERROR: 'サーバーでエラーが発生しました。時間をおいて再度お試しください。',
  NETWORK_ERROR: '通信に失敗しました。接続状況をご確認ください。',
};

/** 統一APIレスポンス形式 */
export interface ApiErrorBody {
  code: ErrorCode;
  message: string;
  /** バリデーション詳細など（秘密情報は含めない） */
  details?: string[];
}

export type ApiResponse<T> = { ok: true; data: T } | { ok: false; error: ApiErrorBody };

export function errorMessageFor(code: ErrorCode): string {
  return ERROR_MESSAGES[code] ?? ERROR_MESSAGES.INTERNAL_ERROR;
}
