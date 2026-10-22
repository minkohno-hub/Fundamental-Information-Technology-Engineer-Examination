// 機能別の E2E テスト：学習プラン、科目B短時間学習、シミュレーター、お気に入り・メモ、問題報告、検索・参考書・講座、設定、模擬試験(科目B)、データ削除
// どのテストも出題がランダムでも成立するように、固定の問題 ID を直接開くか、選択式・入力式のどちらでも解答できる answerCurrent を使う。
import { expect, test, type Page } from '@playwright/test';
import { answerCurrent } from './helpers';

async function open(page: Page, hash = '') {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(`./${hash ? '#' + hash : ''}`);
  await expect(page.getByRole('heading', { level: 1 }).first()).toBeVisible({ timeout: 30_000 });
  return errors;
}

/** IndexedDB への保存が終わるのを少し待ってから再読み込みする */
async function settleAndReload(page: Page) {
  await page.waitForTimeout(400);
  await page.reload();
  await expect(page.getByRole('heading', { level: 1 }).first()).toBeVisible({ timeout: 30_000 });
}

async function simSnapshot(page: Page) {
  const sim = page.getByRole('region', { name: '実行シミュレーター' });
  return {
    step: await sim.getByText(/^ステップ \d+ \/ \d+$/).innerText(),
    line: await sim.locator('[aria-current="step"]').first().getAttribute('data-line'),
    note: await sim.locator('.sim-note').innerText(),
    vars: await sim.locator('table.var-table').first().innerText(),
  };
}

/** 解答済みの問題で実行シミュレーターを開き、進む・戻る・最初から・最後までを検証する */
async function exerciseSimulator(page: Page) {
  await page.getByRole('button', { name: '実行シミュレーターで動きを確認する' }).click();
  const sim = page.getByRole('region', { name: '実行シミュレーター' });
  await expect(sim).toBeVisible();
  const first = await simSnapshot(page);
  expect(first.step).toMatch(/^ステップ 1 \//);
  await expect(sim.getByRole('button', { name: '1ステップ戻る' })).toBeDisabled();

  await sim.getByRole('button', { name: '1ステップ進む' }).click();
  await expect(sim.getByText(/^ステップ 2 \//)).toBeVisible();
  const second = await simSnapshot(page);
  expect(second.note !== first.note || second.line !== first.line || second.vars !== first.vars).toBe(true);

  await sim.getByRole('button', { name: '1ステップ戻る' }).click();
  await expect(sim.getByText(/^ステップ 1 \//)).toBeVisible();
  expect(await simSnapshot(page)).toEqual(first);

  await sim.getByRole('button', { name: /最後まで/ }).click();
  const last = await simSnapshot(page);
  expect(last.step).not.toEqual(first.step);
  expect(last.line).not.toBeNull(); // 終了ステップでも実行中の行が強調される
  expect(last.vars !== first.vars || last.line !== first.line).toBe(true);
  await expect(sim.getByRole('button', { name: '1ステップ進む' })).toBeDisabled();

  await sim.getByRole('button', { name: /最初から/ }).click();
  expect(await simSnapshot(page)).toEqual(first);
}

test.describe('学習プラン', () => {
  test('プランを作成して保存でき、再読み込み後も残り、ホームに目安が出る', async ({ page }) => {
    await open(page, '/plan');
    await page.getByLabel('プログラミングの経験が少しある').check();
    await page.getByLabel('受験予定日（未定なら空欄）').fill('2030-01-15');
    await page.getByLabel(/^1日の学習時間/).fill('60');
    await expect(page.getByText('1日の学習時間：60分')).toBeVisible();
    await page.getByRole('button', { name: '高得点で合格' }).click();
    await expect(page.getByRole('button', { name: '高得点で合格' })).toHaveAttribute('aria-pressed', 'true');
    await page.getByRole('button', { name: 'この内容で保存' }).click();
    await expect(page.getByRole('heading', { name: '今日の目安' })).toBeVisible();
    await expect(page.getByRole('heading', { name: '学習プランを作りますか？（任意）' })).toHaveCount(0);

    await page.goto('./#/plan');
    await settleAndReload(page);
    await expect(page.getByLabel('プログラミングの経験が少しある')).toBeChecked();
    await expect(page.getByLabel('受験予定日（未定なら空欄）')).toHaveValue('2030-01-15');
    await expect(page.getByText('1日の学習時間：60分')).toBeVisible();
    await expect(page.getByRole('button', { name: '高得点で合格' })).toHaveAttribute('aria-pressed', 'true');

    // プランを削除するとホームの目安が消える
    await page.getByRole('button', { name: 'プランを削除' }).click();
    await expect(page.getByRole('button', { name: 'プランを削除' })).toHaveCount(0);
    await page.goto('./#/');
    await expect(page.getByRole('heading', { name: '今日の目安' })).toHaveCount(0);
  });

  test('ホームの導入案内は「今はしない」でスキップでき、再読み込み後も出ない', async ({ page }) => {
    await open(page);
    const card = page.getByRole('heading', { name: '学習プランを作りますか？（任意）' });
    await expect(card).toBeVisible();
    await page.getByRole('button', { name: '今はしない' }).click();
    await expect(card).toHaveCount(0);
    await settleAndReload(page);
    await expect(page.getByRole('heading', { name: '基本情報技術者試験を、1問ずつ確実に。' })).toBeVisible();
    await expect(card).toHaveCount(0);
  });

  test('学習プラン画面の「スキップ」でも導入案内が消える', async ({ page }) => {
    await open(page, '/plan');
    await page.getByRole('button', { name: 'スキップ' }).click();
    await expect(page.getByRole('heading', { name: '基本情報技術者試験を、1問ずつ確実に。' })).toBeVisible();
    await expect(page.getByRole('heading', { name: '学習プランを作りますか？（任意）' })).toHaveCount(0);
  });
});

test.describe('科目B 短時間学習', () => {
  test('テーマ・問題数を選んで開始し、解答して解説を見て、結果まで進める', async ({ page }) => {
    await open(page, '/quick-b');
    await page.getByRole('button', { name: 'すべて' }).click();
    await page.getByRole('group', { name: '問題数' }).getByRole('button', { name: '5問', exact: true }).click();
    await page.getByRole('button', { name: '開始する' }).click();
    await expect(page.getByRole('heading', { name: '科目B 短時間学習' })).toBeVisible();
    await expect(page.getByRole('region', { name: '解説' })).toHaveCount(0);
    for (let i = 0; i < 5; i++) {
      await answerCurrent(page);
      await page.getByRole('button', { name: i < 4 ? '次の問題へ' : '結果を見る' }).click();
    }
    await expect(page.getByRole('heading', { name: /結果/ })).toBeVisible();
    await expect(page.getByText('正解数')).toBeVisible();
  });

  test('文字入力モードでも（入力式の問題が出ても出なくても）最後まで解答できる', async ({ page }) => {
    await open(page, '/quick-b');
    const box = page.getByLabel(/^文字入力で解答する/);
    await box.check();
    await expect(box).toBeChecked();
    await page.getByRole('group', { name: '問題数' }).getByRole('button', { name: '5問', exact: true }).click();
    await page.getByRole('button', { name: '開始する' }).click();
    for (let i = 0; i < 5; i++) {
      await answerCurrent(page);
      await page.getByRole('button', { name: i < 4 ? '次の問題へ' : '結果を見る' }).click();
    }
    await expect(page.getByText('正解数')).toBeVisible();
  });

  test('入力式の問題（固定ID）：誤答は不正解と正解を表示し、正答は正解になり解説が出る', async ({ page }) => {
    await open(page, '/q/B-DRL-001');
    const input = page.getByLabel('解答を入力');
    await expect(input).toBeVisible();
    await expect(page.getByRole('region', { name: '解説' })).toHaveCount(0);
    await input.fill('0');
    await page.getByRole('button', { name: '解答する' }).click();
    await expect(page.locator('.result-banner.ng')).toContainText('不正解');
    await expect(page.locator('.result-banner.ng')).toContainText('正解：5');
    await expect(page.getByRole('region', { name: '解説' })).toBeVisible();

    await page.reload();
    await expect(input).toBeVisible();
    await input.fill('５'); // 全角でも正解になる
    await page.getByRole('button', { name: '解答する' }).click();
    await expect(page.locator('.result-banner.ok')).toHaveText(/^正解$/);
    await expect(page.getByRole('region', { name: '解説' })).toBeVisible();
  });
});

test.describe('計算・プログラム読解とシミュレーター', () => {
  test('「計算・プログラム読解」で出題され、解答後に実行シミュレーターを操作できる', async ({ page }) => {
    await open(page, '/deep');
    await page.getByLabel(/シミュレーター対応の問題だけ/).check();
    await page.getByRole('group', { name: '問題数' }).getByRole('button', { name: '1問', exact: true }).click();
    await page.getByRole('button', { name: /^1問に取り組む/ }).click();
    await expect(page.getByRole('heading', { name: '計算・プログラム読解' })).toBeVisible();
    await expect(page.getByRole('region', { name: 'プログラム' })).toBeVisible();
    await answerCurrent(page);
    await exerciseSimulator(page);
  });

  test('固定の問題（B-ALG-101）で実行行・変数表が変化し、最初から実行をやり直せる', async ({ page }) => {
    await open(page, '/q/B-ALG-101');
    await answerCurrent(page);
    await exerciseSimulator(page);
  });
});

test.describe('お気に入り・理解度・メモ', () => {
  test('お気に入りとメモは再読み込み後も残り、復習画面とお気に入りモードに現れる', async ({ page }) => {
    await open(page, '/q/A03-001');
    await answerCurrent(page);
    const fav = page.getByRole('button', { name: 'お気に入り' });
    await expect(fav).toHaveAttribute('aria-pressed', 'false');
    await fav.click();
    await expect(fav).toHaveAttribute('aria-pressed', 'true');
    await page.getByRole('button', { name: '復習したい' }).click();
    await expect(page.getByRole('button', { name: '復習したい' })).toHaveAttribute('aria-pressed', 'true');
    await page.getByRole('button', { name: /^メモ/ }).click();
    await page.getByLabel('自分用メモ（この端末にだけ保存されます）').fill('E2Eメモ：バスと割込み');
    await page.getByRole('button', { name: 'メモを保存' }).click();
    await expect(page.getByRole('button', { name: 'メモ（あり）' })).toBeVisible();

    await settleAndReload(page);
    await answerCurrent(page);
    await expect(page.getByRole('button', { name: 'お気に入り' })).toHaveAttribute('aria-pressed', 'true');
    await expect(page.getByRole('button', { name: '復習したい' })).toHaveAttribute('aria-pressed', 'true');
    await expect(page.getByLabel('自分用メモ（この端末にだけ保存されます）')).toHaveValue('E2Eメモ：バスと割込み');

    await page.goto('./#/review');
    await expect(page.getByRole('heading', { name: '復習' })).toBeVisible();
    await page.getByText(/^お気に入り（1問）$/).click();
    await page.getByText(/^メモを書いた問題（1問）$/).click();
    await expect(page.getByText(/^「復習したい」にした問題（1問）$/)).toBeVisible();
    const memoDetails = page.locator('details').filter({ has: page.getByText(/^メモを書いた問題（1問）$/) });
    await expect(memoDetails.getByText('メモ：E2Eメモ：バスと割込み')).toBeVisible();

    // お気に入りモード：お気に入りの問題だけを解く
    const favDetails = page.locator('details').filter({ has: page.getByText(/^お気に入り（1問）$/) });
    await favDetails.getByRole('button', { name: 'この1問を解く' }).click();
    await expect(page.getByRole('heading', { name: 'お気に入り' })).toBeVisible();
    await expect(page.getByText('1 / 1')).toBeVisible();
    await answerCurrent(page);
    await expect(page.getByRole('button', { name: 'お気に入り' })).toHaveAttribute('aria-pressed', 'true');

    // お気に入りを外すと一覧から消える
    await page.getByRole('button', { name: 'お気に入り' }).click();
    await page.goto('./#/review');
    await expect(page.getByText(/^お気に入り（0問）$/)).toBeVisible();
  });
});

test.describe('問題報告', () => {
  test('報告を作成すると端末に保存され、Issue 用テキストが表示・コピーでき、報告一覧に載る', async ({ page, context, browserName }) => {
    // クリップボード権限の付与は Chromium だけが対応する（Firefox / WebKit では権限付与なしで、コピーの検証を省く）
    if (browserName === 'chromium') await context.grantPermissions(['clipboard-read', 'clipboard-write']);
    page.on('dialog', (d) => void d.dismiss()); // クリップボードが使えない環境の prompt フォールバック対策
    await open(page, '/q/A03-001');
    await answerCurrent(page);
    await page.getByRole('button', { name: '誤りを報告' }).click();
    const dlg = page.getByRole('dialog', { name: '問題の誤りを報告' });
    await expect(dlg).toBeVisible();
    await dlg.getByLabel('誤りの種類').selectOption({ label: '誤字・脱字' });
    await dlg.getByLabel('内容（どこがどう誤っているか）').fill('E2E：テスト用の報告です');
    await dlg.getByRole('button', { name: '端末に保存' }).click();
    await expect(dlg.getByText(/保存しました/)).toBeVisible();
    await expect(dlg.locator('pre')).toContainText('[問題報告] A03-001：誤字・脱字');
    await expect(dlg.locator('pre')).toContainText('E2E：テスト用の報告です');
    if (browserName === 'chromium') {
      await dlg.getByRole('button', { name: 'Issue 用の文章をコピー' }).click();
      await expect(dlg.getByRole('button', { name: 'コピーしました' })).toBeVisible();
      expect(await page.evaluate(() => navigator.clipboard.readText())).toContain('E2E：テスト用の報告です');
    }
    await dlg.getByRole('button', { name: '閉じる' }).click();
    await expect(dlg).toHaveCount(0);

    await settleAndReload(page);
    await page.goto('./#/reports');
    await expect(page.getByRole('heading', { name: '問題報告' })).toBeVisible();
    await expect(page.locator('pre')).toContainText('[問題報告] A03-001：誤字・脱字');
    await expect(page.locator('pre')).toContainText('E2E：テスト用の報告です');
    await expect(page.getByRole('link', { name: 'A03-001' })).toBeVisible();

    // 削除（確認あり）
    page.removeAllListeners('dialog');
    page.once('dialog', (d) => void d.accept());
    await page.getByRole('button', { name: '削除' }).click();
    await expect(page.getByText('報告はまだありません。')).toBeVisible();
  });

  test('報告のキャンセルでは何も保存されない', async ({ page }) => {
    await open(page, '/q/A03-001');
    await answerCurrent(page);
    await page.getByRole('button', { name: '誤りを報告' }).click();
    const dlg = page.getByRole('dialog', { name: '問題の誤りを報告' });
    await dlg.getByRole('button', { name: 'キャンセル' }).click();
    await expect(dlg).toHaveCount(0);
    await page.goto('./#/reports');
    await expect(page.getByText('報告はまだありません。')).toBeVisible();
  });
});

test.describe('検索・参考書・講座', () => {
  test('検索で既知の用語が見つかり、用語ページへ移動できる', async ({ page }) => {
    await open(page, '/search');
    await page.getByLabel(/^キーワード/).fill('CPU');
    await expect(page.getByRole('status')).toContainText(/用語 [1-9]\d*件/);
    await expect(page.getByRole('heading', { name: '用語辞典' })).toBeVisible();
    await page.getByRole('link', { name: /^CPU/ }).first().click();
    await expect(page.getByText('Central Processing Unit').first()).toBeVisible();
  });

  test('存在しない語は 0 件になる', async ({ page }) => {
    await open(page, '/search');
    await page.getByLabel(/^キーワード/).fill('zzzzqqqq存在しない語');
    await expect(page.getByRole('status')).toHaveText('用語 0件・参考書 0件・問題 0件');
  });

  test('参考書の目次と章が表示され、章末から演習を始められる', async ({ page }) => {
    await open(page, '/reference');
    await expect(page.getByRole('heading', { name: 'コンパクト参考書' })).toBeVisible();
    const links = page.getByRole('main').getByRole('listitem').getByRole('link');
    expect(await links.count()).toBeGreaterThan(5);
    await links.first().click();
    await expect(page.getByRole('navigation', { name: 'この章の目次' })).toBeVisible();
    await expect(page.getByRole('heading', { level: 2 }).first()).toBeVisible();
    await page.getByRole('button', { name: '10問解く' }).click();
    await expect(page.getByRole('heading', { name: /の演習$/ })).toBeVisible();
    await answerCurrent(page);
  });

  test('講座の一覧と各回が表示され、動作例を1行ずつ実行できる', async ({ page }) => {
    await open(page, '/lessons');
    await expect(page.getByRole('heading', { name: '初心者向けプログラミング講座' })).toBeVisible();
    const items = page.getByRole('main').getByRole('listitem').getByRole('link');
    expect(await items.count()).toBeGreaterThanOrEqual(10);
    await items.first().click();
    await expect(page.getByRole('heading', { name: /^第1回/ })).toBeVisible();
    await page.getByRole('button', { name: '1行ずつ実行してみる' }).click();
    const sim = page.getByRole('region', { name: '実行シミュレーター' });
    await expect(sim).toBeVisible();
    await expect(sim.getByText(/^ステップ 1 \//)).toBeVisible();
    await sim.getByRole('button', { name: '1ステップ進む' }).click();
    await expect(sim.getByText(/^ステップ 2 \//)).toBeVisible();
    await sim.getByRole('button', { name: /最後まで/ }).click();
    await expect(sim.getByRole('button', { name: '1ステップ進む' })).toBeDisabled();
    // 確認問題から演習を始められる
    await page.getByRole('button', { name: '確認問題を解く' }).click();
    await expect(page.getByRole('heading', { name: /確認問題/ })).toBeVisible();
    await answerCurrent(page);
  });
});

test.describe('設定', () => {
  test('文字サイズと配色（ダーク）は再読み込み後も保たれる', async ({ page }) => {
    await open(page, '/settings');
    await page.getByLabel(/^文字サイズ/).fill('1.3');
    await expect(page.getByText('文字サイズ：130%')).toBeVisible();
    await expect.poll(() => page.evaluate(() => document.documentElement.style.getPropertyValue('--scale'))).toBe('1.3');
    await page.getByRole('group', { name: '配色' }).getByRole('button', { name: 'ダーク' }).click();
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');

    await settleAndReload(page);
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
    await expect.poll(() => page.evaluate(() => document.documentElement.style.getPropertyValue('--scale'))).toBe('1.3');
    await page.goto('./#/settings');
    await expect(page.getByText('文字サイズ：130%')).toBeVisible();
    await expect(page.getByRole('group', { name: '配色' }).getByRole('button', { name: 'ダーク' })).toHaveAttribute('aria-pressed', 'true');
    const bg = await page.evaluate(() => getComputedStyle(document.body).backgroundColor);
    const [r, g, b] = bg.match(/\d+/g)!.map(Number);
    expect(r + g + b).toBeLessThan(200); // 暗い背景

    await page.getByRole('group', { name: '配色' }).getByRole('button', { name: 'ライト' }).click();
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
  });

  test('「アニメーションを減らす」の切り替えが反映され、保持される', async ({ page }) => {
    await open(page, '/settings');
    const box = page.getByLabel('アニメーションを減らす');
    await expect(page.locator('html')).toHaveAttribute('data-reduce-motion', 'false');
    await box.check();
    await expect(page.locator('html')).toHaveAttribute('data-reduce-motion', 'true');
    await settleAndReload(page);
    await expect(page.locator('html')).toHaveAttribute('data-reduce-motion', 'true');
    await expect(page.getByLabel('アニメーションを減らす')).toBeChecked();
    await page.getByLabel('アニメーションを減らす').uncheck();
    await expect(page.locator('html')).toHaveAttribute('data-reduce-motion', 'false');
  });

  test('「学習データをすべて削除」は確認を求め、キャンセルすれば消えず、承諾すると初期化される', async ({ page }) => {
    await open(page, '/settings');
    await page.getByRole('group', { name: '配色' }).getByRole('button', { name: 'ダーク' }).click();
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');

    let message = '';
    page.once('dialog', (d) => { message = d.message(); void d.dismiss(); });
    await page.getByRole('button', { name: '学習データをすべて削除' }).click();
    await expect.poll(() => message).toContain('元に戻せません');
    await expect(page.getByText('学習データを削除しました。')).toHaveCount(0);
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');

    page.once('dialog', (d) => void d.accept());
    await page.getByRole('button', { name: '学習データをすべて削除' }).click();
    await expect(page.getByText('学習データを削除しました。')).toBeVisible();
    await expect(page.locator('html')).not.toHaveAttribute('data-theme', /.+/);
  });
});

test.describe('模擬試験 科目B（短縮版）', () => {
  test('最後まで解答して採点でき、正答数・不正解数が整合し、解き直しができる', async ({ page }) => {
    await open(page, '/exam');
    await page.getByRole('group', { name: '科目' }).getByRole('button', { name: /^科目B/ }).click();
    await page.getByLabel(/短縮版/).check();
    await page.getByRole('button', { name: '試験を開始する' }).click();

    const progress = page.getByText(/^解答済み 0\/\d+$/);
    await expect(progress).toBeVisible();
    const total = Number((await progress.innerText()).match(/\/(\d+)$/)![1]);
    expect(total).toBeGreaterThanOrEqual(5);
    const choices = page.getByRole('list', { name: '選択肢' }).getByRole('button');
    for (let i = 0; i < total; i++) {
      if (i > 0) await choices.first().click(); // 1問目はあえて未解答のままにする
      if (i < total - 1) await page.getByRole('button', { name: '次へ', exact: true }).click();
    }
    await expect(page.getByText(`解答済み ${total - 1}/${total}`)).toBeVisible();
    page.once('dialog', (d) => { expect(d.message()).toContain('未解答：1問'); void d.accept(); });
    await page.getByRole('button', { name: '終了して採点', exact: true }).click();

    await expect(page.getByRole('heading', { name: /科目B 短縮版の結果/ })).toBeVisible({ timeout: 15_000 });
    const score = (await page.locator('.stat', { hasText: '正答数' }).locator('.v').innerText()).match(/(\d+) \/ (\d+)/)!;
    const correct = Number(score[1]);
    expect(Number(score[2])).toBe(total);
    await expect(page.locator('.stat', { hasText: '未解答' }).locator('.v')).toHaveText('1');

    // 解答の確認：正解の行数 + 不正解・未解答の行数 = 全問題数
    await expect(page.locator('.list .tag.ok')).toHaveCount(correct);
    await expect(page.locator('.list .tag.ng')).toHaveCount(total - correct);
    await page.getByRole('group', { name: '絞り込み' }).getByRole('button', { name: '不正解' }).click();
    await expect(page.locator('.list .tag.ng')).toHaveCount(total - correct);
    await expect(page.locator('.list .tag.ok')).toHaveCount(0);
    await expect(page.locator('.list .tag.ng', { hasText: '未解答' })).toHaveCount(1);

    // 間違えた・未解答の問題の解き直し
    const redo = page.getByRole('button', { name: /^間違えた・未解答の問題を復習/ });
    await expect(redo).toHaveText(new RegExp(`（${total - correct}問）`));
    await redo.click();
    await expect(page.getByRole('heading', { name: `模擬試験の復習（${total - correct}問）` })).toBeVisible();
    await answerCurrent(page);

    // 受験履歴に残る
    await page.goto('./#/exam');
    await expect(page.getByText(`${correct}/${total}問正解`)).toBeVisible();
  });
});
