// docs/generated/coverage.json から docs/CONTENT_COVERAGE.md を生成する（npm run content の後に実行）
import { readFileSync, writeFileSync } from 'node:fs';
const cov = JSON.parse(readFileSync('docs/generated/coverage.json', 'utf-8'));
const sum = JSON.parse(readFileSync('docs/generated/content-summary.json', 'utf-8'));
const topics = new Map();
try { for (const l of readFileSync(process.argv[2] ?? '', 'utf-8').split('\n')) { const [id, ...r] = l.split(' '); topics.set(id, r.join(' ').split(':')[0]); } } catch { /* 任意 */ }
const L = [];
L.push('# 教材の網羅状況', '', `このファイルは \`node tools/gen-coverage-doc.mjs\` で生成しています（教材ビルド ${sum.builtAt.slice(0, 10)} 時点）。`, '');
L.push(`- 公開問題（verified）：${sum.published} 問（科目A ${sum.bySubject.A}・科目B ${sum.bySubject.B}）`);
L.push(`- 機械検証（検算・擬似言語実行・SQL 実行）：${sum.machineVerified} 問、シミュレーター付き：${sum.withSimulator} 問`);
L.push(`- 用語：${sum.glossaryTerms} 語、参考書：${sum.referenceChapters} 章、講座：${sum.lessons} 回`);
L.push(`- シラバス末端論点：${cov.leafCovered} / ${cov.leafTotal}（${(cov.leafCovered / cov.leafTotal * 100).toFixed(1)}%）`, '');
L.push('| 中分類 | 問題数 | 論点の網羅 | 未網羅の論点 |', '| --- | --- | --- | --- |');
for (const m of cov.middles) {
  const un = (m.uncovered ?? []).map((u) => typeof u === 'string' ? u : `${u.id} ${u.name ?? ''}`.trim());
  L.push(`| ${m.no} ${m.name} | ${m.questions} | ${m.leafCovered}/${m.leafTotal} | ${un.length ? un.join('、') : '—'} |`);
}
writeFileSync('docs/CONTENT_COVERAGE.md', L.join('\n') + '\n');
console.log('docs/CONTENT_COVERAGE.md written');
