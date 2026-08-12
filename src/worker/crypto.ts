/**
 * トークン生成・ハッシュ化・定数時間比較。
 * トークンそのものは保存せず、HMAC-SHA-256 のハッシュのみを保存する。
 */

import {
  IP_HASH_ROTATION_MS,
  PLAYER_ID_BYTES,
  ROOM_ID_BYTES,
  TOKEN_BYTES,
} from '../shared/constants';

/** バイト列を base64url へ変換する */
function toBase64Url(bytes: Uint8Array): string {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

/** Web Crypto の安全な乱数から base64url 文字列を作る */
export function randomId(byteLength: number): string {
  const bytes = new Uint8Array(byteLength);
  crypto.getRandomValues(bytes);
  return toBase64Url(bytes);
}

/** 128bit の推測困難な roomId */
export function generateRoomId(): string {
  return randomId(ROOM_ID_BYTES);
}

/** 256bit の権限トークン */
export function generateToken(): string {
  return randomId(TOKEN_BYTES);
}

/** playerId */
export function generatePlayerId(): string {
  return randomId(PLAYER_ID_BYTES);
}

const encoder = new TextEncoder();
const keyCache = new Map<string, Promise<CryptoKey>>();

function importKey(secret: string): Promise<CryptoKey> {
  const cached = keyCache.get(secret);
  if (cached) return cached;
  const promise = crypto.subtle.importKey(
    'raw',
    encoder.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  keyCache.set(secret, promise);
  return promise;
}

function toHex(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let hex = '';
  for (const byte of bytes) hex += byte.toString(16).padStart(2, '0');
  return hex;
}

/** HMAC-SHA-256（16進文字列） */
export async function hmacHex(secret: string, message: string): Promise<string> {
  const key = await importKey(secret);
  const signature = await crypto.subtle.sign('HMAC', key, encoder.encode(message));
  return toHex(signature);
}

/**
 * 定数時間比較。長さが違う場合も早期リターンせず、
 * 比較時間から情報が漏れないようにする。
 */
export function timingSafeEqual(a: string, b: string): boolean {
  const length = Math.max(a.length, b.length);
  let diff = a.length ^ b.length;
  for (let i = 0; i < length; i += 1) {
    diff |= (a.charCodeAt(i) || 0) ^ (b.charCodeAt(i) || 0);
  }
  return diff === 0;
}

/**
 * クライアントIPから短期間だけ有効な不可逆識別値を作る。
 * IP そのものは保存しない。時間帯（ローテーション）を混ぜることで、
 * 一定時間が過ぎれば同じIPでも別の値になる。
 */
export async function ipIdentifier(secret: string, ip: string, now: number): Promise<string> {
  const bucket = Math.floor(now / IP_HASH_ROTATION_MS);
  const digest = await hmacHex(secret, `ip:${bucket}:${ip}`);
  return digest.slice(0, 32);
}

/** Cloudflare 環境で信頼できるヘッダーのみを使ってクライアントIPを得る */
export function clientIpFrom(request: Request): string {
  const cfIp = request.headers.get('cf-connecting-ip');
  if (cfIp && cfIp.length <= 64) return cfIp;
  // ローカル開発など Cloudflare を経由しない場合の安全なフォールバック
  return 'local';
}
