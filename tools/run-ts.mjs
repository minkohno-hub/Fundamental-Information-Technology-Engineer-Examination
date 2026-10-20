// TypeScript で書いたツールを esbuild（Vite に同梱）で一時的にバンドルして実行する。
import { build } from 'esbuild';
import { mkdirSync, mkdtempSync, rmSync } from 'node:fs';

import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const entry = process.argv[2];
if (!entry) {
  console.error('usage: node tools/run-ts.mjs <file.ts> [args...]');
  process.exit(2);
}
mkdirSync(resolve('node_modules/.cache'), { recursive: true });
const dir = mkdtempSync(resolve('node_modules/.cache/fe-tool-'));
const out = join(dir, 'tool.mjs');
await build({
  entryPoints: [resolve(entry)],
  bundle: true,
  platform: 'node',
  format: 'esm',
  target: 'node20',
  outfile: out,
  packages: 'external',
  logLevel: 'warning',
});
try {
  process.argv.splice(1, 2, resolve(entry));
  await import(pathToFileURL(out).href);
} finally {
  rmSync(dir, { recursive: true, force: true });
}
