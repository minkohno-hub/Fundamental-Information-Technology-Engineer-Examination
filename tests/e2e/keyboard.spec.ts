// キーボードだけでの操作：問題への解答、ダイアログ（フォーカストラップ・Esc・フォーカス復帰）、模擬試験の移動
import { expect, test, type Page } from '@playwright/test';

test.beforeEach(async ({}, info) => { test.skip(info.project.name !== 'desktop', 'キーボード操作は PC 幅の 1 プロジェクトで検証する'); });

async function openQuestion(page: Page, id: string) {
  await page.goto(`./#/q/${id}`);
  await expect(page.getByRole('list', { name: '選択肢' })).toBeVisible({ timeout: 30_000 });
}

/** 現在フォーカスされている要素が selector の内側にあるか */
async function focusInside(page: Page, selector: string) {
  return page.evaluate((sel) => Boolean(document.activeElement?.closest(sel)), selector);
}

test('問題：Tab で選択肢へ移動し Enter で解答でき、解答後は結果へフォーカスが移る', async ({ page }) => {
  // 選択式であることが確実な固定の問題を使う
  await openQuestion(page, 'A01-001');
  const first = page.getByRole('list', { name: '選択肢' }).getByRole('button', { name: /^ア：/ });
  await first.focus();
  await expect(first).toBeFocused();
  await page.keyboard.press('Tab'); // 「消す」ボタン
  await page.keyboard.press('Tab'); // 次の選択肢
  await expect(page.getByRole('list', { name: '選択肢' }).getByRole('button', { name: /^イ：/ })).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(page.getByRole('region', { name: '解説' })).toBeVisible();
  expect(await focusInside(page, '[aria-live="polite"]')).toBe(true);
});

test('問題：数字キーでも解答でき、解答済みなら何も起きない', async ({ page }) => {
  await openQuestion(page, 'A01-001');
  await page.locator('body').click({ position: { x: 1, y: 1 } });
  await page.keyboard.press('2');
  await expect(page.getByRole('region', { name: '解説' })).toBeVisible();
});

test('誤り報告ダイアログ：フォーカスが閉じ込められ、Esc で閉じて元のボタンに戻る', async ({ page }) => {
  await openQuestion(page, 'A01-001');
  await page.getByRole('list', { name: '選択肢' }).getByRole('button', { name: /^ア：/ }).click(); // 報告ボタンは解答後に現れる
  await expect(page.getByRole('region', { name: '解説' })).toBeVisible();
  const opener = page.getByRole('button', { name: '誤りを報告' });
  await opener.focus();
  await page.keyboard.press('Enter');
  const dialog = page.getByRole('dialog');
  await expect(dialog).toBeVisible();
  expect(await focusInside(page, 'dialog')).toBe(true);

  // Tab を何度押してもダイアログの外へ出ない
  for (let i = 0; i < 12; i++) {
    await page.keyboard.press('Tab');
    expect(await focusInside(page, 'dialog'), `Tab ${i + 1} 回目`).toBe(true);
  }
  for (let i = 0; i < 12; i++) {
    await page.keyboard.press('Shift+Tab');
    expect(await focusInside(page, 'dialog'), `Shift+Tab ${i + 1} 回目`).toBe(true);
  }

  // 種類の選択欄での文字・数字キー入力は選択肢の切替に使われ、画面の他の操作を起こさない
  await page.getByLabel('誤りの種類').focus();
  await page.keyboard.press('2');

  await page.keyboard.press('Escape');
  await expect(dialog).toBeHidden();
  await expect(opener).toBeFocused();
});

test('模擬試験：キーボードだけで選択・移動・問題一覧・一時停止と再開ができる', async ({ page }) => {
  await page.goto('./#/exam');
  await page.getByRole('button', { name: /^科目A/ }).click();
  await page.getByText('短縮版', { exact: false }).first().click();
  await page.getByRole('button', { name: '試験を開始する' }).click();
  const choices = page.getByRole('list', { name: '選択肢' }).getByRole('button');
  await expect(choices.first()).toBeVisible({ timeout: 30_000 });

  await choices.nth(1).focus();
  await page.keyboard.press('Space');
  await expect(choices.nth(1)).toHaveAttribute('aria-pressed', 'true');

  const next = page.getByRole('button', { name: /^次へ/ });
  await next.focus();
  await page.keyboard.press('Enter');
  await expect(page.getByText('問2', { exact: true }).first()).toBeVisible();
  await expect(next).toBeFocused();

  // 問題一覧から問 1 へ移動し、フォーカスは一覧ボタンに戻る
  const navBtn = page.getByRole('button', { name: '問題一覧' });
  await navBtn.focus();
  await page.keyboard.press('Enter');
  await expect(navBtn).toHaveAttribute('aria-expanded', 'true');
  await page.getByRole('group', { name: '問題一覧' }).getByRole('button', { name: /^問1 / }).focus();
  await page.keyboard.press('Enter');
  await expect(page.getByText('問1', { exact: true }).first()).toBeVisible();
  await expect(navBtn).toBeFocused();
  await expect(page.getByRole('list', { name: '選択肢' }).getByRole('button', { pressed: true })).toHaveCount(1);

  // 一時停止 → 再開ボタンへフォーカス → 再開後は問題へフォーカス
  await page.getByRole('button', { name: '一時停止' }).focus();
  await page.keyboard.press('Enter');
  const resume = page.getByRole('button', { name: '再開する' });
  await expect(resume).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(page.getByRole('article', { name: '問1' })).toBeFocused();
});
