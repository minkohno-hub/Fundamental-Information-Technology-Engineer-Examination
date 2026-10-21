// E2E テスト。ビルド済みの dist を vite preview で配信し、スマートフォン幅と PC 幅で確認する。
import { defineConfig, devices } from '@playwright/test';

const PORT = 4178;
const executablePath = process.env.PW_CHROMIUM_PATH || (process.env.PLAYWRIGHT_BROWSERS_PATH ? undefined : undefined);

export default defineConfig({
  testDir: 'tests/e2e',
  timeout: 60_000,
  retries: 0,
  reporter: [['list']],
  use: {
    baseURL: `http://localhost:${PORT}/`,
    trace: 'retain-on-failure',
    launchOptions: executablePath ? { executablePath } : {},
  },
  projects: [
    { name: 'mobile', use: { ...devices['Pixel 7'] } },
    { name: 'desktop', use: { ...devices['Desktop Chrome'], viewport: { width: 1280, height: 860 } } },
  ],
  webServer: {
    command: `npx vite preview --port ${PORT} --strictPort`,
    port: PORT,
    reuseExistingServer: false,
    timeout: 60_000,
  },
});
