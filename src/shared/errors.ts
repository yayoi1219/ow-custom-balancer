/**
 * APIエラーコード。
 *
 * コード（開発者向け・機械可読）とメッセージ（利用者向け・多言語）を分離して扱う。
 * 実際の文面は `src/shared/i18n/` の辞書が持ち、ここではコードだけを定義する。
 */

import { ja, type Messages } from './i18n/ja';

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

/** 統一APIレスポンス形式 */
export interface ApiErrorBody {
  code: ErrorCode;
  message: string;
  /** バリデーション詳細など（秘密情報は含めない） */
  details?: string[];
}

export type ApiResponse<T> = { ok: true; data: T } | { ok: false; error: ApiErrorBody };

/** コードから利用者向けメッセージを引く。辞書を渡すとその言語で返す。 */
export function errorMessageFor(code: ErrorCode, messages: Messages = ja): string {
  return messages.errors[code] ?? messages.errors.INTERNAL_ERROR;
}
