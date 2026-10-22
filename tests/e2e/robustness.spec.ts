// 堅牢性の E2E テスト：破損した保存データ、長すぎるメモ、保存失敗、教材更新で問題が消えた場合
import { expect, test, type Page } from '@playwright/test';
import { answerCurrent } from './helpers';

// 再読み込みを繰り返すため、更新通知バーが操作を妨げないよう Service Worker は使わない
test.use({ serviceWorkers: 'block' });

async function boot(page: Page, hash = '') {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(`./${hash ? '#' + hash : ''}`);
  await expect(page.getByRole('heading', { level: 1 }).first()).toBeVisible({ timeout: 30_000 }); // 読み込み中の再読み込みを避ける（WebKit の内部エラー対策）
  // ハッシュだけが違う遷移では再読み込みされないため、保存データを読み直すよう明示的に再読み込みする
  await page.reload();
  await expect(page.getByRole('heading', { level: 1 }).first()).toBeVisible({ timeout: 30_000 });
  errors.length = 0; // 再読み込みで中断された直前の読み込みに由来するエラー（WebKit の取得中断など）は対象外
  return errors;
}

/** 生の IndexedDB へ任意のレコードを書き込む（アプリを一度起動して DB を作成した後に使う） */
async function putRaw(page: Page, store: string, value: unknown, key?: string) {
  await page.waitForTimeout(300);
  await page.evaluate(([s, v, k]) => new Promise<void>((resolve, reject) => {
    const open = indexedDB.open('fe-study');
    open.onerror = () => reject(open.error);
    open.onsuccess = () => {
      const db = open.result;
      const tx = db.transaction(s as string, 'readwrite');
      if (k === null) tx.objectStore(s as string).put(v); else tx.objectStore(s as string).put(v, k as string);
      tx.oncomplete = () => { db.close(); resolve(); };
      tx.onerror = () => reject(tx.error);
    };
  }), [store, value, key ?? null] as const);
}

const exam = (over: Record<string, unknown>) => ({
  id: 'x1', kind: 'A', format: 'practice', startedAt: 1, questionIds: ['A01-001'], answers: [null], flags: [false],
  timePerQuestionMs: [0], orders: [[0, 1, 2, 3]], elapsedMs: 0, status: 'inProgress', ...over,
});
const session = (ids: string[]) => ({
  id: 's1', mode: 'practice', title: '更新前の演習', questionIds: ids, index: 0, orders: ids.map(() => [0, 1, 2, 3]),
  results: ids.map(() => null), chosen: ids.map(() => null), inputs: ids.map(() => null), hidden: ids.map(() => []), createdAt: 1,
});

test.describe('破損した保存データ', () => {
  test('不正な記録があってもアプリは起動し、設定に無視した件数が表示される', async ({ page }) => {
    await boot(page);
    await putRaw(page, 'answers', { qid: 12, at: 'x' });
    await putRaw(page, 'states', { qid: 'A01-009', attempts: 'many', correctCount: 0 });
    await putRaw(page, 'exams', exam({ id: 'bad', answers: [] }));
    await putRaw(page, 'reports', { id: 'r' });
    await putRaw(page, 'kv', 'not-an-object', 'settings');
    await putRaw(page, 'kv', { id: 's', mode: 'practice' }, 'session');
    await putRaw(page, 'states', { qid: 'ZZZ-404', attempts: 3, correctCount: 1, favorite: true });
    const errors = await boot(page);
    await expect(page.getByText('端末内に学習データを保存できない')).toHaveCount(0);
    for (const hash of ['/analytics', '/review', '/exam', '/session', '/exam/run', '/reports']) {
      await page.goto(`./#${hash}`);
      await expect(page.getByRole('heading', { level: 1 }).first()).toBeVisible({ timeout: 30_000 });
    }
    await page.goto('./#/settings');
    await expect(page.getByText(/形式が不正な記録 6 件を無視しました/)).toBeVisible();
    expect(errors).toEqual([]);
  });
});

test.describe('メモの上限', () => {
  test('10万文字のメモは 5000 文字に切り捨てられ、その旨が表示される', async ({ page }) => {
    await boot(page, '/q/A03-001');
    await answerCurrent(page);
    await page.getByRole('button', { name: /^メモ/ }).click();
    const area = page.getByLabel('自分用メモ（この端末にだけ保存されます）');
    await area.fill('あ'.repeat(100_000));
    await expect(page.getByText(/メモは 5000 文字までです/)).toBeVisible();
    await page.getByRole('button', { name: 'メモを保存' }).click();
    await expect(page.getByText(/超えた部分を切り捨てて保存しました/)).toBeVisible();
    await expect(area).toHaveValue('あ'.repeat(5000));
    await page.waitForTimeout(400);
    await page.reload();
    await expect(page.getByRole('heading', { level: 1 }).first()).toBeVisible({ timeout: 30_000 });
    await answerCurrent(page);
    await expect(page.getByLabel('自分用メモ（この端末にだけ保存されます）')).toHaveValue('あ'.repeat(5000));
  });
});

test.describe('保存失敗', () => {
  test('容量不足で保存できなくても通知が出て、学習は続けられる', async ({ page }) => {
    await page.addInitScript(() => {
      const fail = () => { if ((window as unknown as { __failWrites?: boolean }).__failWrites) throw new DOMException('quota exceeded', 'QuotaExceededError'); };
      for (const m of ['put', 'add'] as const) {
        const orig = IDBObjectStore.prototype[m];
        IDBObjectStore.prototype[m] = function (this: IDBObjectStore, ...args: [unknown, IDBValidKey?]) { fail(); return orig.apply(this, args as never); } as never;
      }
    });
    await boot(page, '/q/A03-001');
    await page.evaluate(() => { (window as unknown as { __failWrites: boolean }).__failWrites = true; });
    await answerCurrent(page);
    await expect(page.getByRole('status').filter({ hasText: '保存に失敗しました' })).toBeVisible();
    // 続けて操作できる（メモリ上では反映される）
    const fav = page.getByRole('button', { name: 'お気に入り' });
    await fav.click();
    await expect(fav).toHaveAttribute('aria-pressed', 'true');
    await page.goto('./#/');
    await expect(page.getByRole('heading', { level: 1 }).first()).toBeVisible();
  });
});

test.describe('教材更新で問題が消えた場合', () => {
  test('演習：一部の問題が消えても残りで続けられる', async ({ page }) => {
    await boot(page);
    await putRaw(page, 'kv', session(['GONE-001', 'A03-001', 'GONE-002']), 'session');
    await boot(page, '/session');
    await expect(page.getByRole('heading', { name: '更新前の演習' })).toBeVisible();
    await expect(page.getByText(/1\s*\/\s*1|問題 1/).first()).toBeVisible();
    await answerCurrent(page);
  });

  test('演習：すべて消えたらメッセージと破棄・開始の導線が出る', async ({ page }) => {
    await boot(page);
    await putRaw(page, 'kv', session(['GONE-001', 'GONE-002']), 'session');
    await boot(page, '/session');
    await expect(page.getByText(/すべて削除されたため、続けられません|進行中の演習はありません/)).toBeVisible();
    await expect(page.getByRole('link', { name: '演習を始める' })).toBeVisible();
    await page.goto('./#/');
    await expect(page.getByRole('heading', { level: 1 }).first()).toBeVisible();
  });

  test('模擬試験：問題が消えていても実施画面・結果画面が開き、終了できる', async ({ page }) => {
    await boot(page);
    await putRaw(page, 'exams', exam({ id: 'gone', questionIds: ['GONE-001', 'A03-001'], answers: [null, null], flags: [false, false], timePerQuestionMs: [0, 0], orders: [[0, 1, 2, 3], [0, 1, 2, 3]] }));
    await boot(page, '/exam/run');
    await expect(page.getByText(/教材の更新で削除されたため表示できません/)).toBeVisible();
    await expect(page.getByRole('link', { name: '模擬試験の画面へ戻る' })).toBeVisible();
    await page.getByRole('button', { name: '次へ' }).click();
    await expect(page.getByRole('article')).toBeVisible();
    page.once('dialog', (d) => void d.accept());
    await page.getByRole('button', { name: '試験を終了して採点する' }).click();
    await expect(page).toHaveURL(/#\/exam\/result\/gone/);
    await expect(page.getByRole('heading', { level: 1 }).first()).toBeVisible();
  });

  test('模擬試験：すべて消えた結果画面も開ける', async ({ page }) => {
    await boot(page);
    await putRaw(page, 'exams', exam({ id: 'gone2', status: 'finished', finishedAt: 5, questionIds: ['GONE-001'] }));
    const errors = await boot(page, '/exam/result/gone2');
    await expect(page.getByRole('heading', { level: 1 }).first()).toBeVisible();
    await page.goto('./#/exam');
    await expect(page.getByRole('heading', { level: 1 }).first()).toBeVisible();
    expect(errors).toEqual([]);
  });
});
