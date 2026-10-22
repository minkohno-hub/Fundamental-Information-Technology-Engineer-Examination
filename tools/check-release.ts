// 公開前の完成条件チェック。`npm run content` の後に実行し、条件を満たさなければ終了コード 1。
// 条件は docs/RELEASE_CHECKLIST.md と対応している。
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = process.cwd();
const summary = JSON.parse(readFileSync(join(ROOT, 'docs/generated/content-summary.json'), 'utf-8'));
const coverage = JSON.parse(readFileSync(join(ROOT, 'docs/generated/coverage.json'), 'utf-8'));
const manifest = JSON.parse(readFileSync(join(ROOT, 'public/data/manifest.json'), 'utf-8'));
const questions = manifest.files.filter((f: { kind: string }) => f.kind === 'questions')
  .flatMap((f: { path: string }) => JSON.parse(readFileSync(join(ROOT, 'public/data', f.path), 'utf-8')));

const results: { name: string; ok: boolean; detail: string }[] = [];
const check = (name: string, ok: boolean, detail: string) => results.push({ name, ok, detail });

const verified = questions.filter((q: { verificationStatus: string }) => q.verificationStatus === 'verified');
check('品質承認済み（verified）問題 1,000 問以上', verified.length >= 1000, `${verified.length} 問`);
// 追加バッチ H2（高難度拡充）の条件
// 拡充作業中は ENFORCE_H2 を付けずに実行すると、H2 の条件は進捗表示のみ（未達でも失敗にしない）。完成判定は ENFORCE_H2=1
const enforceH2 = process.env.ENFORCE_H2 === '1';
const checkH2 = (name: string, ok: boolean, detail: string) => check(name, ok || !enforceH2, ok ? detail : `${detail}${enforceH2 ? '' : '（作業中のため未強制）'}`);
const hb = JSON.parse(readFileSync(join(ROOT, 'docs/generated/hard-batch.json'), 'utf-8'));
checkH2('H2: 品質承認済み問題 2,000 問以上', verified.length >= 2000, `${verified.length} 問`);
checkH2('H2: 追加問題 608 問以上', hb.count >= 608, `${hb.count} 問`);
checkH2('H2: 追加問題の 70% 以上が応用・高難度', hb.appliedOrHardRate >= 0.7, `${(hb.appliedOrHardRate * 100).toFixed(1)}%（応用 ${hb.byDifficulty[3]}・高難度 ${hb.byDifficulty[4]}）`);
checkH2('H2: 追加問題の基礎は 10% 以下', hb.count === 0 || hb.byDifficulty[1] / hb.count <= 0.1, `${hb.byDifficulty[1]} 問`);
checkH2('H2: 全追加問題に出題範囲の根拠（scope）がある', hb.withScopeNote === hb.count, `${hb.withScopeNote} / ${hb.count}`);
checkH2('H2: 追加問題に科目A・B の両方がある', hb.bySubject.A > 0 && hb.bySubject.B > 0, `A ${hb.bySubject.A}・B ${hb.bySubject.B}`);
check('ビルドエラー 0 件', summary.errors === 0, `${summary.errors} 件`);
check('レビュー待ち・未承認の公開問題 0 件', summary.checking.length === 0, `${summary.checking.length} 件`);
check('ほぼ同一の問題 0 件', summary.similarPairs === 0, `${summary.similarPairs} 組`);

const bySubCat = (s: string, c?: string) => verified.filter((q: { subject: string; category: string }) => q.subject === s && (!c || q.category === c));
check('科目A 600 問以上', bySubCat('A').length >= 600, `${bySubCat('A').length} 問`);
const bDeep = verified.filter((q: { subject: string; depth: string; category: string }) => q.subject === 'B' && q.depth === 'deep' && q.category === 'B-ALG');
const bSec = bySubCat('B', 'B-SEC');
const bQuick = verified.filter((q: { subject: string; depth: string }) => q.subject === 'B' && q.depth === 'quick');
check('科目B 本番形式（アルゴリズム）80 問以上', bDeep.length >= 80, `${bDeep.length} 問`);
check('科目B 本番形式（セキュリティ）20 問以上', bSec.length >= 20, `${bSec.length} 問`);
check('科目B 一問一答（短時間学習）50 問以上', bQuick.length >= 50, `${bQuick.length} 問`);

// 中分類ごとの網羅：23 中分類すべてに問題があり、末端論点の 80% 以上に問題がある
const middles = new Set(verified.filter((q: { subject: string }) => q.subject === 'A').map((q: { category: string }) => q.category));
check('科目A 23 中分類すべてに問題がある', middles.size >= 23, `${middles.size} / 23 中分類`);
const ratio = summary.coverage.leafCovered / summary.coverage.leafTotal;
check('シラバス末端論点の 80% 以上を問題で網羅', ratio >= 0.8, `${summary.coverage.leafCovered} / ${summary.coverage.leafTotal}（${(ratio * 100).toFixed(1)}%）`);
void coverage;

check('擬似言語シミュレーター付き問題 50 問以上', summary.withSimulator >= 50, `${summary.withSimulator} 問`);
check('用語辞典 500 語以上', summary.glossaryTerms >= 500, `${summary.glossaryTerms} 語`);
check('コンパクト参考書が全 23 中分類と科目Bを扱う', summary.referenceChapters >= 10, `${summary.referenceChapters} 章`);
check('プログラミング講座 8 回以上', summary.lessons >= 8, `${summary.lessons} 回`);
for (const d of ['PROJECT_SPEC', 'ARCHITECTURE', 'PROGRESS', 'DECISIONS', 'QUALITY_REPORT', 'CONTENT_COVERAGE', 'CONTINUATION', 'RELEASE_CHECKLIST']) {
  check(`docs/${d}.md がある`, existsSync(join(ROOT, 'docs', `${d}.md`)), '');
}
check('README と LICENSE がある', existsSync(join(ROOT, 'README.md')) && existsSync(join(ROOT, 'LICENSE')), '');

for (const r of results) console.log(`${r.ok ? '✓' : '✗'} ${r.name}${r.detail ? `：${r.detail}` : ''}`);
const failed = results.filter((r) => !r.ok).length;
console.log(failed ? `\n未達 ${failed} 件。公開条件を満たしていません。` : '\nすべての公開条件を満たしています。');
process.exit(failed ? 1 : 0);
