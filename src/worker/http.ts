/** レスポンス生成とセキュリティヘッダー。 */

import { MAX_JSON_BODY_BYTES } from '../shared/constants';
import { ERROR_CODES, errorMessageFor, type ApiErrorBody, type ErrorCode } from '../shared/errors';
import type { Messages } from '../shared/i18n';
import { IS_DEV } from './env';

/** Turnstile のスクリプト／ウィジェット配信元 */
const TURNSTILE_ORIGIN = 'https://challenges.cloudflare.com';

/** すべてのレスポンスに付けるセキュリティヘッダー */
const BASE_SECURITY_HEADERS: Record<string, string> = {
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
  'Permissions-Policy':
    'camera=(), microphone=(), geolocation=(), payment=(), usb=(), interest-cohort=()',
  'X-Frame-Options': 'DENY',
  'Cross-Origin-Opener-Policy': 'same-origin',
};

function contentSecurityPolicy(): string {
  const scriptSrc = IS_DEV
    ? `'self' 'unsafe-inline' 'unsafe-eval' ${TURNSTILE_ORIGIN}`
    : `'self' ${TURNSTILE_ORIGIN}`;
  const connectSrc = IS_DEV ? `'self' ws: wss: ${TURNSTILE_ORIGIN}` : `'self' ${TURNSTILE_ORIGIN}`;
  return [
    "default-src 'self'",
    "base-uri 'self'",
    "object-src 'none'",
    "frame-ancestors 'none'",
    "form-action 'self'",
    "img-src 'self' data:",
    "font-src 'self'",
    "style-src 'self' 'unsafe-inline'",
    `script-src ${scriptSrc}`,
    `frame-src ${TURNSTILE_ORIGIN}`,
    `connect-src ${connectSrc}`,
  ].join('; ');
}

/** HTML を含む可能性のあるレスポンスへセキュリティヘッダーを付与する */
export function withSecurityHeaders(response: Response): Response {
  // WebSocket アップグレード（101）はヘッダーを書き換えずそのまま返す
  if (response.status === 101) return response;
  const headers = new Headers(response.headers);
  for (const [key, value] of Object.entries(BASE_SECURITY_HEADERS)) {
    headers.set(key, value);
  }
  headers.set('Content-Security-Policy', contentSecurityPolicy());
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

/** 成功レスポンス */
export function jsonOk<T>(data: T, status = 200, extraHeaders?: Record<string, string>): Response {
  return jsonResponse({ ok: true, data }, status, extraHeaders);
}

/** エラーレスポンス */
export function jsonError(
  code: ErrorCode,
  status: number,
  options?: {
    message?: string;
    details?: string[];
    headers?: Record<string, string>;
    /** 応答の言語。省略時は正本である日本語になる。 */
    messages?: Messages;
  },
): Response {
  const error: ApiErrorBody = {
    code,
    message: options?.message ?? errorMessageFor(code, options?.messages),
  };
  if (options?.details && options.details.length > 0) {
    error.details = options.details;
  }
  return jsonResponse({ ok: false, error }, status, options?.headers);
}

function jsonResponse(
  body: unknown,
  status: number,
  extraHeaders?: Record<string, string>,
): Response {
  const headers = new Headers({
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
    ...BASE_SECURITY_HEADERS,
    'Content-Security-Policy': "default-src 'none'; frame-ancestors 'none'",
  });
  if (extraHeaders) {
    for (const [key, value] of Object.entries(extraHeaders)) headers.set(key, value);
  }
  return new Response(JSON.stringify(body), { status, headers });
}

export type JsonReadResult = { ok: true; value: unknown } | { ok: false; response: Response };

/**
 * JSON ボディを安全に読む。
 * Content-Type の検証とサイズ制限を行う。
 */
export async function readJsonBody(request: Request, messages?: Messages): Promise<JsonReadResult> {
  const contentType = request.headers.get('content-type') ?? '';
  if (!contentType.toLowerCase().includes('application/json')) {
    return {
      ok: false,
      response: jsonError(ERROR_CODES.UNSUPPORTED_MEDIA_TYPE, 415, { messages }),
    };
  }
  const declaredLength = Number(request.headers.get('content-length') ?? '0');
  if (Number.isFinite(declaredLength) && declaredLength > MAX_JSON_BODY_BYTES) {
    return { ok: false, response: jsonError(ERROR_CODES.PAYLOAD_TOO_LARGE, 413, { messages }) };
  }
  let text: string;
  try {
    text = await request.text();
  } catch {
    return { ok: false, response: jsonError(ERROR_CODES.INVALID_JSON, 400, { messages }) };
  }
  if (new TextEncoder().encode(text).byteLength > MAX_JSON_BODY_BYTES) {
    return { ok: false, response: jsonError(ERROR_CODES.PAYLOAD_TOO_LARGE, 413, { messages }) };
  }
  try {
    return { ok: true, value: JSON.parse(text) as unknown };
  } catch {
    return { ok: false, response: jsonError(ERROR_CODES.INVALID_JSON, 400, { messages }) };
  }
}
