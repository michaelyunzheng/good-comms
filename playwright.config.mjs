import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './tests/browser',
  workers: 1,
  use: { baseURL: 'http://127.0.0.1:3100', trace: 'retain-on-failure' },
  webServer: {
    command: `"${process.execPath}" node_modules/next/dist/bin/next start --hostname 127.0.0.1 --port 3100`,
    url: 'http://127.0.0.1:3100',
    reuseExistingServer: false,
    env: {
      BETA_PASSWORD: 'test-only-password', OPENAI_API_KEY: '', NODE_ENV: 'production',
      UPSTASH_REDIS_REST_URL: '', UPSTASH_REDIS_REST_TOKEN: '', VERCEL: '0',
    },
  },
});
