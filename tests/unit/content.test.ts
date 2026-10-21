// ビルド済み教材データ（public/data）の整合性テスト。`npm run content` の後に実行する。
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import type { ContentManifest, GlossaryTerm, Question } from '../../src/types';
import { runProgram } from '../../src/pseudo/interpreter';
import { normalizeForCompare } from '../../src/lib/text';

const DIR = join(process.cwd(), 'public', 'data');
const hasData = existsSync(join(DIR, 'manifest.json'));
const read = <T>(p: string): T => JSON.parse(readFileSync(join(DIR, p), 'utf-8')) as T;

describe.skipIf(!hasData)('教材データ', () => {
  const manifest = read<ContentManifest>('manifest.json');
  const questions = manifest.files.filter((f) => f.kind === 'questions').flatMap((f) => read<Question[]>(f.path));
  const glossaryFile = manifest.files.find((f) => f.kind === 'glossary');
  const glossary = glossaryFile ? read<GlossaryTerm[]>(glossaryFile.path) : [];
  const termIds = new Set(glossary.map((t) => t.id));

  it('マニフェストの件数と実データが一致する', () => {
    expect(questions.length).toBe(manifest.counts.total);
    expect(questions.filter((q) => q.subject === 'A').length).toBe(manifest.counts.A);
    expect(questions.filter((q) => q.subject === 'B').length).toBe(manifest.counts.B);
  });

  it('問題 ID は一意で、公開されている問題はすべて検証済み', () => {
    expect(new Set(questions.map((q) => q.id)).size).toBe(questions.length);
    expect(questions.filter((q) => q.verificationStatus !== 'verified').map((q) => q.id)).toEqual([]);
  });

  it('正解番号・選択肢・解説の数が整合している', () => {
    for (const q of questions) {
      expect(q.correctAnswer, q.id).toBeGreaterThanOrEqual(0);
      expect(q.correctAnswer, q.id).toBeLessThan(q.choices.length);
      expect(q.choiceExplanations.length, q.id).toBe(q.choices.length);
      expect(new Set(q.choices.map(normalizeForCompare)).size, q.id).toBe(q.choices.length);
      expect(q.choiceExplanations[q.correctAnswer].startsWith('正解です'), q.id).toBe(true);
      q.choiceExplanations.forEach((w, i) => { if (i !== q.correctAnswer) expect(w.startsWith('正解です'), q.id).toBe(false); });
      if (q.subject === 'A' && q.questionType === 'choice') expect(q.choices.length, q.id).toBe(4);
      if (q.questionType === 'input') expect(q.acceptedInputs?.length, q.id).toBeGreaterThan(0);
    }
  });

  it('すべての問題に出典とライセンス状態がある', () => {
    for (const q of questions) {
      expect(q.source?.kind, q.id).toBeTruthy();
      expect(q.source.title, q.id).toBeTruthy();
      if (q.source.kind === 'ipa') {
        expect(q.source.url, q.id).toMatch(/^https:\/\/www\.ipa\.go\.jp\//);
        expect(q.licenseStatus, q.id).toBe('ipa-public-permitted');
        expect(q.noShuffle, q.id).toBe(true);
      }
    }
  });

  it('関連用語はすべて辞典に存在する', () => {
    for (const q of questions) for (const t of q.relatedConcepts) expect(termIds.has(t), `${q.id}: ${t}`).toBe(true);
  });

  it('略語の用語には正式名称・日本語訳・単語ごとの意味がある', () => {
    for (const t of glossary) {
      if (t.fullName) {
        expect(t.japanese, t.term).toBeTruthy();
        expect(t.words?.length, t.term).toBeGreaterThan(0);
      }
    }
  });

  it('シミュレーター付きの問題はすべて実行できる', () => {
    for (const q of questions.filter((x) => x.simulation)) {
      const s = q.simulation!;
      expect(() => runProgram(s.program, s.entry, s.args ?? [], { ...(s.options ?? {}), trace: true, maxSteps: 500000 }), q.id).not.toThrow();
    }
  });

  it('問題文・解説に危険な HTML を含まない', () => {
    const bad = /<\s*(script|iframe|object|embed)|javascript:|on\w+\s*=/i;
    for (const q of questions) expect(bad.test(q.questionText + q.explanation + q.choiceExplanations.join('') + (q.code ?? '')), q.id).toBe(false);
  });
});
