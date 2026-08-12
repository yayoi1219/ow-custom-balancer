import { cloudflareTest } from '@cloudflare/vitest-pool-workers';
import { defineConfig } from 'vitest/config';

/**
 * Cloudflare 公式の Workers 向け Vitest 環境。
 * Durable Object / SQLite / Alarm を実際の workerd 上で検証する。
 *
 * Turnstile の siteverify は outboundService で差し替え、
 * 外部ネットワークへ出ずに「サーバー側検証が必ず走ること」を確認する。
 */
export default defineConfig({
  plugins: [
    cloudflareTest({
      main: './src/worker/index.ts',
      miniflare: {
        compatibilityDate: '2025-09-01',
        compatibilityFlags: ['nodejs_compat'],
        durableObjects: {
          ROOM: { className: 'RoomDurableObject', useSQLite: true },
          RATE_LIMIT: { className: 'RateLimitDurableObject', useSQLite: true },
        },
        bindings: {
          TURNSTILE_SITE_KEY: '1x00000000000000000000AA',
          // Cloudflare 公式のテスト用シークレット（常に成功する値）
          TURNSTILE_SECRET_KEY: '1x0000000000000000000000000000000AA',
          TOKEN_HMAC_SECRET: 'test-token-hmac-secret',
          IP_HASH_SECRET: 'test-ip-hash-secret',
        },
        outboundService(request: Request): Promise<Response> | Response {
          const url = new URL(request.url);
          if (url.hostname === 'challenges.cloudflare.com') {
            return handleSiteVerify(request);
          }
          return new Response('blocked in tests', { status: 502 });
        },
      },
    }),
  ],
  test: {
    include: ['test/**/*.test.ts'],
  },
});

/** テスト用の siteverify スタブ。"invalid-turnstile-token" だけ失敗させる。 */
async function handleSiteVerify(request: Request): Promise<Response> {
  const form = await request.formData();
  const token = String(form.get('response') ?? '');
  const success = token.length > 0 && token !== 'invalid-turnstile-token';
  return Response.json({
    success,
    'error-codes': success ? [] : ['invalid-input-response'],
  });
}
