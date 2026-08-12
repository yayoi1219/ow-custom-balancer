/** Worker / Durable Object のバインディング定義。 */

import type { RateLimitDurableObject } from './ratelimit-do';
import type { RoomDurableObject } from './room-do';

export interface Env {
  /** 部屋ごとの Durable Object（SQLite-backed） */
  ROOM: DurableObjectNamespace<RoomDurableObject>;
  /** レート制限用 Durable Object（SQLite-backed） */
  RATE_LIMIT: DurableObjectNamespace<RateLimitDurableObject>;
  /** React ビルド成果物（Static Assets）。テスト環境では未設定になり得る。 */
  ASSETS?: Fetcher;

  /** 公開値: Turnstile の site key */
  TURNSTILE_SITE_KEY: string;

  /* ---- 以下は Wrangler Secret（フロントへ渡してはならない） ---- */
  /** Turnstile の secret key */
  TURNSTILE_SECRET_KEY?: string;
  /** 権限トークンのハッシュ化に使う秘密値 */
  TOKEN_HMAC_SECRET?: string;
  /** IP を短期識別値へ変換するための秘密値 */
  IP_HASH_SECRET?: string;
}

/** 開発モードかどうか（Vite により静的に置換される） */
export const IS_DEV: boolean = import.meta.env?.DEV === true;
