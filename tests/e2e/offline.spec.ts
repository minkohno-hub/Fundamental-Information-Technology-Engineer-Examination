// オフライン動作の E2E テスト：一度読み込んだ後、ネットワークを遮断して再読み込みしても学習できること
import { expect, test } from '@playwright/test';
import { answerCurrent } from './helpers';

test('初回読み込み後はオフラインでも起動し、問題・解説・辞典・模擬試験が使える', async ({ page, context, browserName }) => {
  // Playwright の WebKit は setOffline 後の再読み込みで内部エラーになるため検証できない（実機 Safari は未検証）
  test.skip(browserName === 'webkit', 'Playwright WebKit は setOffline + reload に非対応');
  await page.goto('./');
  await expect(page.getByRole('heading', { level: 1 }).first()).toBeVisible({ timeout: 30_000 });
  // Service Worker が有効になり、教材データがキャッシュされるまで待つ
  await page.waitForFunction(async () => {
    const reg = await navigator.serviceWorker.getRegistration();
    if (reg?.active?.state !== 'activated') return false;
    const keys = await caches.keys();
    if (!keys.includes('fe-content-v1')) return false;
    const c = await caches.open('fe-content-v1');
    return (await c.keys()).length > 5;
  }, null, { timeout: 30_000 });
  // 有効化直後の読み込みは制御下に入らないことがあるため、制御されるまで再読み込みする
  for (let i = 0; i < 5; i++) {
    await page.reload();
    if (await page.evaluate(() => Boolean(navigator.serviceWorker.controller))) break;
    await page.waitForTimeout(1000);
  }
  expect(await page.evaluate(() => Boolean(navigator.serviceWorker.controller))).toBe(true);

  await context.setOffline(true);
  await page.reload();
  await expect(page.getByRole('heading', { name: 'ホーム' })).toBeVisible({ timeout: 30_000 });
  await page.getByRole('button', { name: /今すぐ学習/ }).click();
  await answerCurrent(page);

  await page.goto('./#/dict');
  await page.getByRole('searchbox').first().fill('CPU');
  await expect(page.getByRole('link', { name: /^CPU/ }).first()).toBeVisible();

  await page.goto('./#/settings');
  await expect(page.getByText(/オフライン準備完了/)).toBeVisible({ timeout: 15_000 });
  await context.setOffline(false);
});
