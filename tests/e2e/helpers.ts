// E2E 共通の補助関数。出題には入力式の問題も含まれるため、選択式・入力式のどちらでも解答できるようにする。
import { expect, type Page } from '@playwright/test';

/** 表示中の問題に（誤りでもよいので）解答し、解説が表示されるまで待つ */
export async function answerCurrent(page: Page) {
  const choices = page.getByRole('list', { name: '選択肢' }).getByRole('button', { name: /^[アイウエオカキク]：/ });
  const input = page.getByLabel('解答を入力');
  await expect(choices.first().or(input)).toBeVisible({ timeout: 30_000 });
  if (await input.isVisible()) {
    await input.fill('0');
    await page.getByRole('button', { name: '解答する' }).click();
  } else {
    await choices.first().click();
  }
  await expect(page.getByRole('region', { name: '解説' })).toBeVisible();
}
