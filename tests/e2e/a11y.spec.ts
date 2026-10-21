// アクセシビリティ（axe-core）：主要画面を ライト/ダーク × 390px/1280px で検査し、serious/critical の違反がないことを確認する。
import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { answerCurrent } from './helpers';

const WIDTHS = [390, 1280];
const SCHEMES = ['light', 'dark'] as const;

async function ready(page: Page) {
  await expect(page.getByRole('heading', { level: 1 }).first()).toBeVisible({ timeout: 30_000 });
}

async function scan(page: Page, label: string) {
  // 画面遷移やフォーカス移動のアニメーション・描画が落ち着くのを待つ
  await page.waitForTimeout(300);
  const results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze();
  const bad = results.violations.filter((v) => v.impact === 'serious' || v.impact === 'critical');
  const summary = bad.map((v) => `${v.id} (${v.impact}): ${v.nodes.slice(0, 4).map((n) => n.target.join(' ')).join(' | ')} :: ${v.nodes[0]?.any[0]?.message ?? v.nodes[0]?.all[0]?.message ?? ''}`);
  expect(summary, `${label}\n${summary.join('\n')}`).toEqual([]);
}

async function startShortExam(p: Page) {
  await p.goto('./#/exam');
  await p.getByRole('button', { name: /^科目A/ }).click();
  await p.getByText('短縮版', { exact: false }).first().click();
  await p.getByRole('button', { name: '試験を開始する' }).click();
  await expect(p.getByRole('list', { name: '選択肢' })).toBeVisible({ timeout: 30_000 });
  await p.getByRole('list', { name: '選択肢' }).getByRole('button').first().click();
}

type Step = { name: string; run: (page: Page) => Promise<void> };

const steps: Step[] = [
  { name: 'ホーム', run: async (p) => { await p.goto('./#/'); await ready(p); } },
  { name: '練習の設定', run: async (p) => { await p.goto('./#/practice'); await ready(p); } },
  {
    name: '問題（解答前）',
    run: async (p) => {
      await p.goto('./#/q/B-ALG-101');
      await expect(p.getByRole('list', { name: '選択肢' }).or(p.getByLabel('解答を入力'))).toBeVisible({ timeout: 30_000 });
    },
  },
  { name: '問題（解答後）', run: async (p) => { await p.goto('./#/q/B-ALG-101'); await answerCurrent(p); } },
  { name: '模擬試験の設定', run: async (p) => { await p.goto('./#/exam'); await ready(p); } },
  { name: '模擬試験の実施', run: async (p) => { await startShortExam(p); } },
  {
    name: '模擬試験の結果',
    run: async (p) => {
      await startShortExam(p);
      p.once('dialog', (d) => d.accept());
      await p.getByRole('button', { name: '試験を終了して採点する' }).click();
      await expect(p.getByText(/正答/).first()).toBeVisible({ timeout: 15_000 });
    },
  },
  { name: '辞典', run: async (p) => { await p.goto('./#/dict'); await ready(p); } },
  {
    name: '用語ページ',
    run: async (p) => {
      await p.goto('./#/dict');
      await p.getByRole('searchbox').first().fill('CPU');
      await p.getByRole('link', { name: /^CPU/ }).first().click();
      await expect(p.getByText('Central Processing Unit').first()).toBeVisible();
    },
  },
  { name: '分析', run: async (p) => { await p.goto('./#/analytics'); await ready(p); } },
  { name: '設定', run: async (p) => { await p.goto('./#/settings'); await ready(p); } },
  { name: '参考書', run: async (p) => { await p.goto('./#/reference'); await ready(p); } },
  { name: '講座', run: async (p) => { await p.goto('./#/lessons'); await ready(p); } },
  { name: '計算・プログラム読解', run: async (p) => { await p.goto('./#/deep'); await ready(p); } },
  {
    name: 'シミュレーター',
    run: async (p) => {
      await p.goto('./#/q/B-ALG-101');
      await answerCurrent(p);
      await p.getByRole('button', { name: '実行シミュレーターで動きを確認する' }).click();
      await expect(p.getByRole('region', { name: '実行シミュレーター' })).toBeVisible();
    },
  },
];

for (const scheme of SCHEMES) {
  for (const width of WIDTHS) {
    test.describe(`axe ${scheme} ${width}px`, () => {
      test.use({ colorScheme: scheme, viewport: { width, height: 860 } });
      for (const s of steps) {
        test(s.name, async ({ page }, info) => {
          test.skip(info.project.name !== 'desktop', '幅と配色は describe 側で指定するため desktop プロジェクトでのみ実行する');
          await s.run(page);
          await scan(page, `${s.name} / ${scheme} / ${width}px`);
        });
      }
    });
  }
}
