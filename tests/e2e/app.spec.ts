// 主要な利用の流れの E2E テスト（ビルド済みアプリを実ブラウザで操作）
import { expect, test, type Page } from '@playwright/test';

async function open(page: Page, hash = '') {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  await page.goto(`./${hash ? '#' + hash : ''}`);
  await expect(page.getByRole('heading', { level: 1 }).first()).toBeVisible({ timeout: 30_000 });
  return errors;
}

async function noHorizontalScroll(page: Page) {
  const over = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(over).toBeLessThanOrEqual(1);
}

test('ホームが表示され、コンソールエラーがない', async ({ page }) => {
  const errors = await open(page);
  await expect(page.getByRole('heading', { name: '基本情報技術者試験を、1問ずつ確実に。' })).toBeVisible();
  await noHorizontalScroll(page);
  expect(errors).toEqual([]);
});

test('一問一答：解答前は正解が分からず、解答後に解説が出て、次の問題へ進める', async ({ page }) => {
  await open(page);
  await page.getByRole('button', { name: '5問', exact: true }).click();
  await page.getByRole('button', { name: /今すぐ学習/ }).click();
  const choices = page.getByRole('list', { name: '選択肢' }).getByRole('button', { name: /^[アイウエ]：/ });
  await expect(choices.first()).toBeVisible();
  // 解答前に正解を示す表示がない
  await expect(page.getByText('（正解）')).toHaveCount(0);
  await expect(page.locator('[aria-label$="（正解）"]')).toHaveCount(0);
  await choices.first().click();
  await expect(page.locator('[aria-label$="（正解）"]')).toHaveCount(1);
  await expect(page.getByText(/正解です/).first()).toBeVisible();
  await noHorizontalScroll(page);
  for (let i = 0; i < 4; i++) {
    await page.getByRole('button', { name: '次の問題へ' }).click();
    await page.getByRole('list', { name: '選択肢' }).getByRole('button', { name: /^[アイウエ]：/ }).first().click();
  }
  await page.getByRole('button', { name: '結果を見る' }).click();
  await expect(page.getByRole('heading', { name: /結果/ })).toBeVisible();
  await expect(page.getByText('正解数')).toBeVisible();
});

test('学習記録は再読み込み後も残り、分析に反映される', async ({ page }) => {
  await open(page);
  await page.getByRole('button', { name: '5問', exact: true }).click();
  await page.getByRole('button', { name: /今すぐ学習/ }).click();
  await page.getByRole('list', { name: '選択肢' }).getByRole('button', { name: /^[アイウエ]：/ }).first().click();
  await page.waitForTimeout(300);
  await page.reload();
  // 再読み込みしても解答済みの状態のまま再開される
  await expect(page.locator('[aria-label$="（正解）"]')).toHaveCount(1, { timeout: 30_000 });
  await page.goto('./#/');
  await expect(page.getByRole('button', { name: /続きから/ })).toBeVisible();
  await page.goto('./#/analytics');
  await expect(page.getByText(/初見正答率/).first()).toBeVisible();
});

test('模擬試験（短縮版）を開始し、解答して採点できる', async ({ page }) => {
  await open(page, '/exam');
  await page.getByRole('button', { name: /^科目A/ }).click();
  await page.getByText('短縮版', { exact: false }).first().click();
  await page.getByRole('button', { name: '試験を開始する' }).click();
  await page.getByRole('list', { name: '選択肢' }).getByRole('button').first().click();
  await expect(page.getByRole('list', { name: '選択肢' }).getByRole('button', { pressed: true })).toHaveCount(1);
  await page.getByRole('button', { name: '見直し' }).click();
  page.once('dialog', (d) => d.accept());
  await page.getByRole('button', { name: '試験を終了して採点する' }).click();
  await expect(page.getByText(/正答/).first()).toBeVisible({ timeout: 15_000 });
  await expect(page.getByText(/合格|IRT|目安/).first()).toBeVisible();
});

test('辞典で略語の正式名称と単語の意味が表示される', async ({ page }) => {
  await open(page, '/dict');
  await page.getByRole('searchbox').first().fill('CPU');
  await page.getByRole('link', { name: /^CPU/ }).first().click();
  await expect(page.getByText('Central Processing Unit').first()).toBeVisible();
});

test('設定：エクスポートしたファイルをインポートすると確認が出る', async ({ page }) => {
  await open(page, '/settings');
  const [download] = await Promise.all([
    page.waitForEvent('download'),
    page.getByRole('button', { name: /エクスポート/ }).click(),
  ]);
  const path = await download.path();
  await page.locator('input[type=file]').setInputFiles(path!);
  await expect(page.getByRole('button', { name: '置き換える' })).toBeVisible();
  await page.getByRole('button', { name: 'やめる' }).click();
});

test('不正なファイルのインポートは拒否される', async ({ page }) => {
  await open(page, '/settings');
  await page.locator('input[type=file]').setInputFiles({ name: 'bad.json', mimeType: 'application/json', buffer: Buffer.from('{"app":"other"}') });
  await expect(page.getByText(/バックアップファイルではありません/)).toBeVisible();
  await expect(page.getByRole('button', { name: '置き換える' })).toHaveCount(0);
});
