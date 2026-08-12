/**
 * レート制限用の SQLite-backed Durable Object。
 * IPアドレスそのものは保存せず、HMAC から作った短期識別値を DO の名前に使う。
 * 古いレコードは Alarm で自動削除する。
 */

import { DurableObject } from 'cloudflare:workers';
import { RATE_LIMIT_CLEANUP_INTERVAL_MS, RATE_LIMIT_RECORD_TTL_MS } from '../shared/constants';
import type { Env } from './env';

export interface RateLimitDecision {
  allowed: boolean;
  /** 次に試せるまでの秒数（allowed=false のとき） */
  retryAfterSeconds: number;
  remaining: number;
}

interface CountRow extends Record<string, SqlStorageValue> {
  hits: number;
  oldest: number | null;
}

export class RateLimitDurableObject extends DurableObject<Env> {
  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
    // 再起動・再デプロイ後も確実にテーブルが存在するようにする
    ctx.blockConcurrencyWhile(async () => {
      this.ctx.storage.sql.exec(
        `CREATE TABLE IF NOT EXISTS hits (
           id INTEGER PRIMARY KEY AUTOINCREMENT,
           bucket TEXT NOT NULL,
           ts INTEGER NOT NULL
         );`,
      );
      this.ctx.storage.sql.exec(`CREATE INDEX IF NOT EXISTS hits_bucket_ts ON hits (bucket, ts);`);
      const alarm = await this.ctx.storage.getAlarm();
      if (alarm === null) {
        await this.ctx.storage.setAlarm(Date.now() + RATE_LIMIT_CLEANUP_INTERVAL_MS);
      }
    });
  }

  /**
   * bucket ごとのスライディングウィンドウ制限。
   * 許可された場合のみ1件記録する。
   */
  async check(bucket: string, limit: number, windowMs: number): Promise<RateLimitDecision> {
    const now = Date.now();
    const since = now - windowMs;
    // 掃除用の Alarm が消えている場合は張り直す
    if ((await this.ctx.storage.getAlarm()) === null) {
      await this.ctx.storage.setAlarm(now + RATE_LIMIT_CLEANUP_INTERVAL_MS);
    }
    return this.ctx.storage.transactionSync<RateLimitDecision>(() => {
      const sql = this.ctx.storage.sql;
      sql.exec(`DELETE FROM hits WHERE bucket = ? AND ts <= ?;`, bucket, since);
      const rows = sql
        .exec<CountRow>(
          `SELECT COUNT(*) AS hits, MIN(ts) AS oldest FROM hits WHERE bucket = ?;`,
          bucket,
        )
        .toArray();
      const hits = Number(rows[0]?.hits ?? 0);
      if (hits >= limit) {
        const oldest = Number(rows[0]?.oldest ?? now);
        const retryAfterMs = Math.max(1000, oldest + windowMs - now);
        return {
          allowed: false,
          retryAfterSeconds: Math.ceil(retryAfterMs / 1000),
          remaining: 0,
        };
      }
      sql.exec(`INSERT INTO hits (bucket, ts) VALUES (?, ?);`, bucket, now);
      return { allowed: true, retryAfterSeconds: 0, remaining: limit - hits - 1 };
    });
  }

  /** 古いレコードを掃除する。何度実行しても安全。 */
  override async alarm(): Promise<void> {
    const cutoff = Date.now() - RATE_LIMIT_RECORD_TTL_MS;
    this.ctx.storage.sql.exec(`DELETE FROM hits WHERE ts <= ?;`, cutoff);
    const remaining = this.ctx.storage.sql
      .exec<{ hits: number } & Record<string, SqlStorageValue>>(
        `SELECT COUNT(*) AS hits FROM hits;`,
      )
      .toArray()[0];
    if (Number(remaining?.hits ?? 0) > 0) {
      await this.ctx.storage.setAlarm(Date.now() + RATE_LIMIT_CLEANUP_INTERVAL_MS);
    }
    // レコードが無ければ Alarm を張り直さない（次の check で張り直される）
  }
}
