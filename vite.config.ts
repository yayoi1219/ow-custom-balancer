import { cloudflare } from '@cloudflare/vite-plugin';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

/**
 * React の静的ファイル・Worker・Durable Objects を
 * 1つの Cloudflare Workers プロジェクトとしてビルドする。
 */
export default defineConfig({
  plugins: [react(), cloudflare()],
  build: {
    sourcemap: false,
  },
});
