// 問題の terms に使われているが辞典にない用語を一覧する（作業用）
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import yaml from 'js-yaml';
const walk = (d) => readdirSync(d).flatMap((f) => { const p = join(d, f); return statSync(p).isDirectory() ? walk(p) : [p]; });
const norm = (s) => s.normalize('NFKC').toLowerCase().replace(/\s+/g, ' ').trim();
const have = new Set();
for (const f of walk('content/glossary')) for (const t of yaml.load(readFileSync(f, 'utf-8')).terms ?? []) for (const k of [t.term, ...(t.aliases ?? [])]) have.add(norm(k));
const used = new Map();
for (const f of walk('content/questions')) for (const q of yaml.load(readFileSync(f, 'utf-8')).questions ?? []) for (const t of q.terms ?? []) if (!have.has(norm(t))) used.set(t, (used.get(t) ?? 0) + 1);
console.log([...used.keys()].join(' / '));
console.log(used.size, 'missing');
