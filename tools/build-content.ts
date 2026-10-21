// 教材データのビルドと品質検証。
// content/ 以下の YAML（作成用の簡潔な形式）を読み込み、スキーマ・整合性・計算・擬似言語の実行・重複を検証して
// public/data/ にアプリ用 JSON を出力する。エラーが一つでもあれば終了コード 1 で終了する。
import { readFileSync, writeFileSync, mkdirSync, readdirSync, statSync, rmSync, existsSync } from 'node:fs';
import { join, relative } from 'node:path';
import { createHash } from 'node:crypto';
import yaml from 'js-yaml';
import { createRequire } from 'node:module';
import type { Question, GlossaryTerm, Syllabus, ReferenceChapter, Lesson, ContentManifest } from '../src/types';
import { runProgram, formatValue, toPlain, type RunOptions } from '../src/pseudo/interpreter';
import { normalizeForCompare, normalizeAnswerInput } from '../src/lib/text';

// node:sqlite は実験的機能のため警告を抑制して読み込む（SQL 問題の検証に使用）
const emitWarning = process.emitWarning.bind(process);
process.emitWarning = ((w: string | Error, ...rest: unknown[]) => {
  if (String(w).includes('SQLite')) return;
  (emitWarning as (...a: unknown[]) => void)(w, ...rest);
}) as typeof process.emitWarning;
const { DatabaseSync } = createRequire(import.meta.url)('node:sqlite') as typeof import('node:sqlite');

const ROOT = process.cwd();
const CONTENT = join(ROOT, 'content');
const OUT = join(ROOT, 'public', 'data');
const REPORT_DIR = join(ROOT, 'docs', 'generated');
const LETTERS = ['ア', 'イ', 'ウ', 'エ', 'オ', 'カ', 'キ', 'ク', 'ケ', 'コ'];
const TODAY = new Date().toISOString().slice(0, 10);
const STRICT = process.argv.includes('--strict');

const errors: string[] = [];
const warnings: string[] = [];
const err = (where: string, msg: string) => errors.push(`${where}: ${msg}`);
const warn = (where: string, msg: string) => warnings.push(`${where}: ${msg}`);

function walk(dir: string): string[] {
  if (!existsSync(dir)) return [];
  return readdirSync(dir).flatMap((f) => {
    const p = join(dir, f);
    return statSync(p).isDirectory() ? walk(p) : [p];
  }).sort();
}

function loadYaml<T>(file: string): T {
  try {
    return yaml.load(readFileSync(file, 'utf-8'), { schema: yaml.CORE_SCHEMA }) as T;
  } catch (e) {
    err(relative(ROOT, file), `YAML の読み込みに失敗: ${(e as Error).message}`);
    return {} as T;
  }
}

// ===== シラバス =====

const syllabus = JSON.parse(readFileSync(join(CONTENT, 'syllabus', 'syllabus-9.2.json'), 'utf-8')) as Syllabus;
interface TopicInfo { id: string; name: string; path: string; middle: string; sub: string; level: 'sub' | 'item' | 'child' | 'b'; terms: string[] }
const topics = new Map<string, TopicInfo>();
const middleNames = new Map<string, string>();
const subNames = new Map<string, string>();
for (const M of syllabus.majors) {
  for (const m of M.middles) {
    const mid = String(m.no);
    middleNames.set(mid, m.name);
    for (const s of m.subs) {
      const sid = `${mid}-${s.no}`;
      s.id = sid;
      subNames.set(sid, s.name);
      topics.set(sid, { id: sid, name: s.name, path: `${m.name} > ${s.name}`, middle: mid, sub: sid, level: 'sub', terms: [] });
      for (const it of s.items) {
        const iid = `${sid}-${it.no}`;
        it.id = iid;
        topics.set(iid, { id: iid, name: it.name, path: `${m.name} > ${s.name} > ${it.name}`, middle: mid, sub: sid, level: 'item', terms: it.terms });
        for (const c of it.children ?? []) {
          const cid = `${iid}-${c.no}`;
          c.id = cid;
          topics.set(cid, { id: cid, name: c.name, path: `${m.name} > ${s.name} > ${it.name} > ${c.name}`, middle: mid, sub: sid, level: 'child', terms: c.terms });
        }
      }
    }
  }
}

interface BScope { id: string; area: 'ALG' | 'SEC'; name: string; desc: string }
const bScope = loadYaml<{ items: BScope[] }>(join(CONTENT, 'syllabus', 'subject-b.yaml')).items ?? [];
for (const b of bScope) {
  topics.set(b.id, { id: b.id, name: b.name, path: `科目B > ${b.name}`, middle: `B-${b.area}`, sub: b.id, level: 'b', terms: [] });
}

/** 末端の学習論点（子があれば子、なければ項目） */
const leafTopics: TopicInfo[] = [];
for (const M of syllabus.majors) for (const m of M.middles) for (const s of m.subs) for (const it of s.items) {
  if (it.children?.length) for (const c of it.children) leafTopics.push(topics.get(c.id)!);
  else leafTopics.push(topics.get(it.id)!);
}

// ===== 用語辞典 =====

interface RawTerm extends Omit<GlossaryTerm, 'id' | 'related' | 'category'> { id?: string; related?: string[]; aliases?: string[] }
const glossary: GlossaryTerm[] = [];
const termIndex = new Map<string, string>(); // 正規化名 → id
for (const file of walk(join(CONTENT, 'glossary')).filter((f) => f.endsWith('.yaml'))) {
  const doc = loadYaml<{ category: string; terms: RawTerm[] }>(file);
  for (const t of doc.terms ?? []) {
    const where = `${relative(ROOT, file)}:${t.term}`;
    const id = t.id ?? `t-${createHash('sha1').update(t.term).digest('hex').slice(0, 8)}`;
    if (!t.term || !t.simple || !t.definition) err(where, '用語名・初心者向け説明・定義は必須です');
    if (t.fullName && (!t.japanese || !t.words?.length)) err(where, '略語には日本語訳と英単語ごとの意味が必要です');
    const keys = [t.term, ...(t.aliases ?? [])];
    for (const k of keys) {
      const nk = normalizeForCompare(k);
      if (termIndex.has(nk)) err(where, `用語「${k}」が重複しています`);
      termIndex.set(nk, id);
    }
    glossary.push({
      id, term: t.term, reading: t.reading, fullName: t.fullName, japanese: t.japanese, words: t.words,
      simple: t.simple, definition: t.definition, example: t.example, difference: t.difference,
      related: t.related ?? [], category: doc.category, questionIds: [],
    });
    (glossary[glossary.length - 1] as GlossaryTerm & { aliases?: string[] }).aliases = t.aliases;
  }
}
const termById = new Map(glossary.map((t) => [t.id, t]));
function findTerm(name: string): string | undefined {
  return termIndex.get(normalizeForCompare(name));
}
for (const t of glossary) {
  for (const r of t.related) if (!findTerm(r)) warn(`glossary:${t.term}`, `関連用語「${r}」が辞典にありません`);
}

// ===== 問題 =====

interface RawQuestion {
  id: string;
  topic: string | string[];
  diff?: number;
  depth?: 'quick' | 'deep';
  type?: 'choice' | 'input';
  q: string;
  /** 問題文の後ろに付ける共通の資料（表など。YAML のアンカーで共有） */
  attach?: string;
  code?: string;
  c: (string | number)[];
  a: string | number;
  accept?: string[];
  exp: string;
  why: string[];
  know?: string;
  terms?: string[];
  related?: string[];
  noShuffle?: boolean;
  status?: 'draft' | 'rejected';
  rejectReason?: string;
  version?: number;
  source?: Partial<Question['source']>;
  fills?: Record<string, string>[];
  verify?: VerifySpec;
  sim?: { entry?: string; args?: unknown[]; note?: string };
  distinctFrom?: string[];
}
interface VerifyCase {
  call?: string;
  args?: unknown[];
  expect?: unknown;
  expectVars?: Record<string, unknown>;
  expectGlobals?: Record<string, unknown>;
  expectOutput?: string[];
  expectCalls?: Record<string, number>;
}
interface VerifySpec {
  /** 計算問題：正解の数値を求める JavaScript の式（作成者とは独立に計算して照合する） */
  value?: string;
  tolerance?: number;
  /** 擬似言語：各選択肢で空欄を埋めて実行し、正解だけが全テストケースを通ることを確認 */
  cases?: VerifyCase[];
  /** 擬似言語：プログラム（空欄なし）を実行した結果が正解の選択肢と一致することを確認 */
  result?: { call?: string; args?: unknown[]; of?: 'return' | 'output' | string };
  options?: RunOptions;
  prelude?: string;
  /** SQL：SQLite で実行して検証（choices が SQL 文なら各選択肢を、result なら query の結果を照合） */
  sql?: { setup: string; mode: 'choices' | 'result'; query?: string; expectRows?: unknown[][]; ordered?: boolean; sqlChoices?: string[] };
  /** 手作業で確認した内容（自動化できない場合の記録） */
  manual?: string;
}
interface QFile {
  category: string;
  subject?: 'A' | 'B';
  depth?: 'quick' | 'deep';
  source?: Partial<Question['source']>;
  reviewed?: { at: string; method: string };
  questions: RawQuestion[];
}

const ORIGINAL_SOURCE: Question['source'] = {
  kind: 'original',
  title: '本アプリのオリジナル問題',
  terms: '本リポジトリのライセンス（MIT）に従う',
  termsCheckedAt: TODAY,
  modified: false,
  references: ['基本情報技術者試験（レベル2）シラバス Ver.9.2（IPA）'],
};

const questions: Question[] = [];
const rejected: { id: string; reason: string }[] = [];
const verifyLog: { id: string; machine: boolean; checks: string[]; notChecked: string[] }[] = [];
const seenIds = new Set<string>();
/** 類似度計算用の問題文（共通の添付資料を除く） */
const stemText = new Map<string, string>();

function letterIndex(a: string | number, n: number, where: string): number {
  if (typeof a === 'number') return a;
  const i = LETTERS.indexOf(a.trim());
  if (i < 0 || i >= n) err(where, `正解「${a}」が選択肢の範囲外です`);
  return i;
}

function firstNumber(s: string): number | null {
  const m = normalizeForCompare(s).replace(/,/g, '').match(/(-?\d+(?:\.\d+)?)(?:\s*\/\s*(\d+(?:\.\d+)?))?/);
  if (!m) return null;
  return m[2] ? Number(m[1]) / Number(m[2]) : Number(m[1]);
}

function fillBlanks(code: string, fill: Record<string, string>): string {
  return code.replace(/【([a-z])】/g, (_, k) => {
    if (!(k in fill)) throw new Error(`空欄 ${k} の値がありません`);
    return fill[k];
  });
}

function caseMatches(prog: string, c: VerifyCase, opts: RunOptions): boolean {
  const r = runProgram(prog, c.call, c.args ?? [], opts);
  const eq = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);
  if (c.expect !== undefined && !eq(toPlain(r.returnValue ?? { t: 'undef' } as never), c.expect)) return false;
  for (const [k, v] of Object.entries(c.expectVars ?? {})) if (!(k in r.mainVars) || !eq(toPlain(r.mainVars[k]), v)) return false;
  for (const [k, v] of Object.entries(c.expectGlobals ?? {})) if (!(k in r.globals) || !eq(toPlain(r.globals[k]), v)) return false;
  if (c.expectOutput && !eq(r.output, c.expectOutput)) return false;
  for (const [k, v] of Object.entries(c.expectCalls ?? {})) if ((r.callCounts[k] ?? 0) !== v) return false;
  return true;
}

function verifyQuestion(q: Question, raw: RawQuestion, where: string): string[] {
  const checks: string[] = [];
  const v = raw.verify;
  if (!v) return checks;
  if (v.value !== undefined) {
    let expected: number;
    try {
      expected = Number(Function('"use strict"; const {log, log2, sqrt, pow, floor, ceil, round, max, min, abs} = Math; return (' + v.value + ');')());
    } catch (e) {
      err(where, `検算式の評価に失敗: ${(e as Error).message}`);
      return checks;
    }
    const tol = v.tolerance ?? 1e-9;
    const nums = q.choices.map(firstNumber);
    const hits = nums.map((n) => n !== null && Math.abs(n - expected) <= tol);
    if (!hits[q.correctAnswer]) err(where, `検算結果 ${expected} が正解の選択肢「${q.choices[q.correctAnswer]}」と一致しません`);
    if (hits.filter(Boolean).length > 1) err(where, `検算結果 ${expected} に一致する選択肢が複数あります`);
    checks.push(`独立した検算式による計算結果（${expected}）が正解の選択肢と一致し、他の選択肢とは一致しない`);
  }
  const opts: RunOptions = { maxSteps: 500000, ...(v.options ?? {}) };
  if (v.cases) {
    if (!raw.code) { err(where, 'cases の検証には code が必要です'); return checks; }
    const fills = raw.fills ?? q.choices.map((c) => ({ a: c }));
    if (fills.length !== q.choices.length) err(where, 'fills の数が選択肢の数と一致しません');
    const pass = fills.map((f, i) => {
      try {
        const prog = (v.prelude ?? '') + '\n' + fillBlanks(raw.code!, f);
        return v.cases!.every((c) => caseMatches(prog, c, opts));
      } catch (e) {
        if (i === q.correctAnswer) err(where, `正解の選択肢で実行時エラー: ${(e as Error).message}`);
        return false;
      }
    });
    if (!pass[q.correctAnswer]) err(where, '正解の選択肢で埋めたプログラムがテストケースを満たしません');
    const others = pass.map((p, i) => (p && i !== q.correctAnswer ? LETTERS[i] : '')).filter(Boolean);
    if (others.length) err(where, `正解以外の選択肢（${others.join('、')}）でもテストケースを満たしてしまいます（テストケース不足か正答が一意でない）`);
    checks.push(`擬似言語インタプリタで全${fills.length}選択肢を空欄に当てはめて実行し、正解のみが${v.cases.length}件のテストケースを満たすことを確認`);
  }
  if (v.result) {
    if (!raw.code) { err(where, 'result の検証には code が必要です'); return checks; }
    try {
      const prog = (v.prelude ?? '') + '\n' + raw.code;
      const r = runProgram(prog, v.result.call, v.result.args ?? [], opts);
      let got: string;
      const of = v.result.of ?? 'return';
      if (of === 'return') got = r.returnValue === undefined ? '' : formatValue(r.returnValue);
      else if (of === 'output') got = r.output.join(' ');
      else if (of.startsWith('var:')) got = formatValue(r.mainVars[of.slice(4)] ?? r.globals[of.slice(4)]);
      else if (of.startsWith('calls:')) got = String(r.callCounts[of.slice(6)] ?? 0);
      else got = '';
      const norm = (s: string) => normalizeForCompare(s).replace(/["“”]/g, '').replace(/^\{|\}$/g, '').replace(/,/g, ',');
      const hits = q.choices.map((c) => norm(c) === norm(got));
      if (!hits[q.correctAnswer]) err(where, `実行結果「${got}」が正解の選択肢「${q.choices[q.correctAnswer]}」と一致しません`);
      if (hits.filter(Boolean).length > 1) err(where, `実行結果「${got}」に一致する選択肢が複数あります`);
      checks.push(`擬似言語インタプリタでの実行結果（${got}）が正解の選択肢と一致することを確認`);
    } catch (e) {
      err(where, `実行時エラー: ${(e as Error).message}`);
    }
  }
  if (v.sql) {
    const sq = v.sql;
    const run = (query: string): unknown[][] => {
      const db = new DatabaseSync(':memory:');
      try {
        db.exec(sq.setup);
        return db.prepare(query).all().map((r) => Object.values(r as Record<string, unknown>));
      } finally {
        db.close();
      }
    };
    const canon = (rows: unknown[][]) => {
      const lines = rows.map((r) => JSON.stringify(r.map((x) => (typeof x === 'number' ? Math.round(x * 1e9) / 1e9 : x))));
      return (sq.ordered ? lines : [...lines].sort()).join('\n');
    };
    try {
      if (sq.mode === 'choices') {
        const expected = sq.expectRows ? canon(sq.expectRows) : canon(run(sq.query!));
        const qs = sq.sqlChoices ?? q.choices;
        const hits = qs.map((c) => {
          try { return canon(run(c)) === expected; } catch { return false; }
        });
        if (!hits[q.correctAnswer]) err(where, '正解の SQL の実行結果が期待する結果と一致しません');
        const others = hits.map((h, i) => (h && i !== q.correctAnswer ? LETTERS[i] : '')).filter(Boolean);
        if (others.length) err(where, `正解以外の SQL（${others.join('、')}）でも同じ結果になります`);
        checks.push(`SQLite で全${qs.length}選択肢の SQL を実行し、正解の SQL だけが期待する結果を返すことを確認`);
      } else {
        const rows = run(sq.query!);
        const got = rows.map((r) => r.join(', ')).join(' / ');
        const norm = (x: string) => normalizeForCompare(x).replace(/[\s　]/g, '');
        const hits = q.choices.map((c) => norm(c) === norm(got));
        if (!hits[q.correctAnswer]) err(where, `SQL の実行結果「${got}」が正解の選択肢「${q.choices[q.correctAnswer]}」と一致しません`);
        if (hits.filter(Boolean).length > 1) err(where, `SQL の実行結果に一致する選択肢が複数あります`);
        checks.push(`SQLite で問題の SQL を実行し、結果（${got}）が正解の選択肢と一致することを確認`);
      }
    } catch (e) {
      err(where, `SQL の実行に失敗: ${(e as Error).message}`);
    }
  }
  if (v.manual) checks.push(`手順の記録: ${v.manual}`);
  return checks;
}

const files = walk(join(CONTENT, 'questions')).filter((f) => f.endsWith('.yaml'));
for (const file of files) {
  const rel = relative(ROOT, file);
  const doc = loadYaml<QFile>(file);
  if (!doc.questions) { err(rel, 'questions がありません'); continue; }
  const subject = doc.subject ?? (doc.category.startsWith('B') ? 'B' : 'A');
  for (const raw of doc.questions) {
    const where = `${rel}:${raw.id}`;
    if (!raw.id || !/^[A-Z][A-Z0-9-]*-\d{3,4}$/.test(raw.id)) err(where, 'id の形式が正しくありません');
    if (seenIds.has(raw.id)) err(where, 'id が重複しています');
    seenIds.add(raw.id);
    if (raw.status === 'rejected') {
      rejected.push({ id: raw.id, reason: raw.rejectReason ?? '理由未記載' });
      continue;
    }
    stemText.set(raw.id, raw.q ?? '');
    const topicIds = Array.isArray(raw.topic) ? raw.topic : [raw.topic];
    for (const t of topicIds) if (!topics.has(String(t))) err(where, `学習論点 ${t} がシラバスにありません`);
    const primary = topics.get(String(topicIds[0]));
    const choices = (raw.c ?? []).map((c) => String(c).trim());
    const type = raw.type ?? 'choice';
    if (choices.length < 2) err(where, '選択肢が2つ以上必要です');
    if (subject === 'A' && type === 'choice' && choices.length !== 4) err(where, '科目Aの問題は四肢択一にしてください');
    const normChoices = choices.map(normalizeForCompare);
    if (new Set(normChoices).size !== normChoices.length) err(where, '同じ内容の選択肢があります');
    const correct = letterIndex(raw.a, choices.length, where);
    if (!raw.q?.trim()) err(where, '問題文がありません');
    if (!raw.exp || raw.exp.trim().length < 40) err(where, '解説（正解の理由）が短すぎます（40字以上）');
    if (!raw.why || raw.why.length !== choices.length) err(where, `各選択肢の解説が選択肢の数（${choices.length}）と一致しません`);
    (raw.why ?? []).forEach((w, i) => {
      if (!w || String(w).trim().length < 8) err(where, `選択肢${LETTERS[i]}の解説が短すぎます`);
    });
    // 正答と解説の整合：正解の選択肢の解説だけが「正解」で始まること（作問規約）
    (raw.why ?? []).forEach((w, i) => {
      const body = String(w).trim().replace(/^[ア-コ]\s*[：:]\s*/, '');
      const saysCorrect = /^正解です/.test(body);
      if (i === correct && !saysCorrect) err(where, `正解（${LETTERS[i]}）の選択肢の解説が「正解です」で始まっていません（正答と解説の不一致の可能性）`);
      if (i !== correct && saysCorrect) err(where, `正解でない選択肢${LETTERS[i]}の解説が「正解です」で始まっています（正答と解説の不一致）`);
    });
    const shuffles = !(raw.noShuffle || doc.source?.kind === 'ipa' || raw.source?.kind === 'ipa');
    if (shuffles && /[アイウエオカキク](?:が|は|の|と|を|も)/.test(raw.exp + (raw.know ?? '')) && /(?:^|[^ァ-ヶー])[アイウエ](?:が正|は誤|が誤|は正|の記述|とイ|とウ|とエ)/.test(raw.exp + (raw.know ?? ''))) {
      err(where, '選択肢をシャッフルする問題の解説で選択肢記号（ア〜エ）を参照しています。内容で参照してください');
    }
    const whyRefs = (raw.why ?? []).slice(0).map((w) => String(w).replace(/^[ア-コ]\s*[：:]\s*/, '')).join(' ');
    if (shuffles && /(?:^|[^ァ-ヶー])[アイウエ](?:が正|は誤|と同じ|の説明)/.test(whyRefs)) err(where, '選択肢の解説で他の選択肢を記号で参照しています');
    if (type === 'input' && !(raw.accept?.length)) err(where, '入力式には accept（許容解答）が必要です');
    if (raw.code && /【[a-z]】/.test(raw.q + raw.code) === false && raw.verify?.cases) err(where, '空欄のないプログラムに cases 検証が指定されています');
    const diff = (raw.diff ?? 2) as 1 | 2 | 3;
    if (![1, 2, 3].includes(diff)) err(where, 'diff は 1〜3 です');
    const relatedConcepts: string[] = [];
    for (const t of raw.terms ?? []) {
      const id = findTerm(t);
      if (!id) { warn(where, `用語「${t}」が辞典にありません`); continue; }
      relatedConcepts.push(id);
    }
    const src = doc.source || raw.source ? { ...ORIGINAL_SOURCE, ...(doc.source ?? {}), ...(raw.source ?? {}) } as Question['source'] : ORIGINAL_SOURCE;
    if (src.kind === 'ipa' && (!src.title || !src.url)) err(where, 'IPA 問題には出典名と URL が必要です');
    const q: Question = {
      id: raw.id,
      syllabusVersion: syllabus.version,
      subject,
      depth: raw.depth ?? doc.depth ?? (raw.code ? 'deep' : 'quick'),
      category: doc.category,
      subcategory: primary ? primary.sub : '',
      topicIds: topicIds.map(String),
      questionType: type,
      difficulty: diff,
      questionText: (raw.q.trim() + (raw.attach ? '\n\n' + raw.attach.trim() : '')),
      code: raw.code?.replace(/\s+$/, ''),
      choices,
      correctAnswer: correct,
      acceptedInputs: raw.accept?.map(normalizeAnswerInput),
      explanation: raw.exp.trim(),
      // 選択肢はシャッフルして表示するため、解説先頭の「ア：」などの記号は取り除く（表示側で付け直す）
      choiceExplanations: (raw.why ?? []).map((w) => String(w).trim().replace(/^[ア-コ]\s*[：:]\s*/, '').replace(/^正解です。?\s*/, '正解です。')),
      knowledge: raw.know?.trim(),
      relatedConcepts,
      relatedQuestionIds: raw.related ?? [],
      noShuffle: raw.noShuffle || src.kind === 'ipa' || undefined,
      source: src,
      licenseStatus: src.kind === 'ipa' ? 'ipa-public-permitted' : src.kind === 'original' ? 'original' : 'permitted',
      verificationStatus: 'checking',
      contentVersion: raw.version ?? 1,
    };
    if (raw.sim) {
      if (!raw.code) err(where, 'シミュレーターにはプログラムが必要です');
      else {
        const fill = raw.fills ? raw.fills[correct] : { a: choices[correct] };
        try {
          const program = (raw.verify?.prelude ?? '') + (raw.verify?.prelude ? '\n' : '') + (/【[a-z]】/.test(raw.code) ? fillBlanks(raw.code, fill) : raw.code);
          const r = runProgram(program, raw.sim.entry, raw.sim.args ?? [], { ...(raw.verify?.options ?? {}), trace: true });
          if (r.traceTruncated) err(where, 'シミュレーションの記録が上限を超えます。引数を小さくしてください');
          q.simulation = { program, entry: raw.sim.entry, args: raw.sim.args, options: raw.verify?.options as never, note: raw.sim.note };
        } catch (e) {
          err(where, `シミュレーション用プログラムの実行に失敗: ${(e as Error).message}`);
        }
      }
    }
    const checks = [
      'スキーマ検証（必須項目・選択肢数・正解番号・各選択肢の解説数）',
      '選択肢の重複がないことを確認',
      `学習論点 ${q.topicIds.join(', ')} がシラバス Ver.${syllabus.version} に存在することを確認`,
      ...verifyQuestion(q, raw, where),
    ];
    if (doc.reviewed) checks.push(`内容レビュー（${doc.reviewed.method}、${doc.reviewed.at}）`);
    const notChecked: string[] = [];
    if (!raw.verify && !doc.reviewed) notChecked.push('内容レビュー未実施');
    if (!raw.verify) notChecked.push('機械的な検算・実行による正答確認の対象外（知識問題）');
    if (src.kind === 'ipa') checks.push('正答は IPA 公表の解答例と照合');
    verifyLog.push({ id: q.id, machine: Boolean(raw.verify && (raw.verify.value !== undefined || raw.verify.cases || raw.verify.result || raw.verify.sql)), checks, notChecked });
    (q as Question & { _reviewed?: boolean })._reviewed = Boolean(doc.reviewed) || src.kind === 'ipa';
    questions.push(q);
  }
}

// ===== 重複・類似の検出 =====

function grams(s: string): Set<string> {
  const t = normalizeForCompare(s).replace(/[\s、。,.・「」()（）:：]/g, '');
  const g = new Set<string>();
  for (let i = 0; i < t.length - 2; i++) g.add(t.slice(i, i + 3));
  return g;
}
function jaccard(a: Set<string>, b: Set<string>) {
  let inter = 0;
  const [x, y] = a.size < b.size ? [a, b] : [b, a];
  for (const g of x) if (y.has(g)) inter++;
  return inter / (a.size + b.size - inter || 1);
}
const sigs = questions.map((q) => ({
  q,
  stem: grams((stemText.get(q.id) ?? q.questionText) + (q.code ?? '')),
  all: grams((stemText.get(q.id) ?? q.questionText) + (q.code ?? '') + [...q.choices].sort().join('|')),
  answer: normalizeForCompare(q.choices[q.correctAnswer]),
}));
const distinct = new Map<string, Set<string>>();
for (const file of files) {
  for (const raw of loadYaml<QFile>(file).questions ?? []) {
    for (const d of raw.distinctFrom ?? []) {
      if (!distinct.has(raw.id)) distinct.set(raw.id, new Set());
      distinct.get(raw.id)!.add(d);
    }
  }
}
const similarPairs: { a: string; b: string; score: number }[] = [];
for (let i = 0; i < sigs.length; i++) {
  for (let j = i + 1; j < sigs.length; j++) {
    const A = sigs[i], B = sigs[j];
    const acknowledged = distinct.get(A.q.id)?.has(B.q.id) || distinct.get(B.q.id)?.has(A.q.id);
    const sAll = jaccard(A.all, B.all);
    const sStem = jaccard(A.stem, B.stem);
    if (sAll >= 0.85) {
      err(`${A.q.id}/${B.q.id}`, `問題文と選択肢がほぼ同一です（類似度 ${sAll.toFixed(2)}）`);
    } else if ((sStem >= 0.7 && A.answer === B.answer) || sAll >= 0.7) {
      similarPairs.push({ a: A.q.id, b: B.q.id, score: Number(Math.max(sAll, sStem).toFixed(2)) });
      if (!acknowledged) {
        (STRICT ? err : warn)(`${A.q.id}/${B.q.id}`, `類似度が高い問題です（${Math.max(sAll, sStem).toFixed(2)}）。学習価値が異なる場合は distinctFrom で明示してください`);
      }
    }
  }
}

// ===== 状態の確定 =====

for (const q of questions) {
  const where = q.id;
  const hasErr = errors.some((e) => e.includes(where + ':') || e.includes(where + '/') || e.includes('/' + where + ':'));
  const reviewed = (q as Question & { _reviewed?: boolean })._reviewed;
  q.verificationStatus = hasErr ? 'rejected' : reviewed ? 'verified' : 'checking';
  delete (q as Question & { _reviewed?: boolean })._reviewed;
}
const published = questions.filter((q) => q.verificationStatus === 'verified');
for (const q of questions) if (q.verificationStatus === 'checking') warn(q.id, '内容レビューが未記録のため公開対象外です');

// 用語 → 問題 の逆引き
for (const q of published) for (const t of q.relatedConcepts) termById.get(t)?.questionIds?.push(q.id);
// 関連問題（同じ末端論点の問題）を自動補完
const byTopic = new Map<string, string[]>();
for (const q of published) for (const t of q.topicIds) {
  if (!byTopic.has(t)) byTopic.set(t, []);
  byTopic.get(t)!.push(q.id);
}
for (const q of published) {
  const rel = new Set(q.relatedQuestionIds);
  for (const t of q.topicIds) for (const id of byTopic.get(t) ?? []) if (id !== q.id && rel.size < 6) rel.add(id);
  q.relatedQuestionIds = [...rel];
  for (const r of q.relatedQuestionIds) if (!published.some((p) => p.id === r)) warn(q.id, `関連問題 ${r} は公開対象ではありません`);
}

// ===== 参考書・講座 =====

const reference: ReferenceChapter[] = walk(join(CONTENT, 'reference')).filter((f) => f.endsWith('.yaml')).map((f) => loadYaml<ReferenceChapter>(f));
for (const ch of reference) {
  if (!ch.id || !ch.title || !ch.sections?.length) err(`reference:${ch.id}`, '章の id・タイトル・節が必要です');
  for (const c of ch.categories ?? []) if (!middleNames.has(String(c)) && !String(c).startsWith('B')) err(`reference:${ch.id}`, `分類 ${c} がありません`);
}
const lessonsDoc = loadYaml<{ lessons: Lesson[] }>(join(CONTENT, 'lessons', 'programming.yaml'));
const lessons = lessonsDoc.lessons ?? [];
const publishedIds = new Set(published.map((q) => q.id));
for (const l of lessons) {
  for (const id of l.questionIds ?? []) if (!publishedIds.has(id)) err(`lesson:${l.id}`, `確認問題 ${id} が公開問題にありません`);
  if (l.example) {
    try { runProgram(l.example); } catch (e) { err(`lesson:${l.id}`, `動作例の実行に失敗: ${(e as Error).message}`); }
  }
}

// ===== 網羅状況 =====

const coverage = {
  leafTotal: leafTopics.length,
  leafCovered: 0,
  middles: [] as { no: string; name: string; field: string; questions: number; verified: number; leafTotal: number; leafCovered: number; uncovered: string[] }[],
  subjectB: [] as { id: string; name: string; questions: number }[],
};
const verifiedTopicSet = new Set(published.flatMap((q) => q.topicIds));
function covered(t: TopicInfo): boolean {
  // 末端論点またはその子孫に問題があれば網羅とみなす（親の小分類だけに紐づく問題では網羅にしない）
  return verifiedTopicSet.has(t.id) || [...verifiedTopicSet].some((v) => v.startsWith(t.id + '-'));
}
for (const M of syllabus.majors) for (const m of M.middles) {
  const mid = String(m.no);
  const leaves = leafTopics.filter((t) => t.middle === mid);
  const cov = leaves.filter(covered);
  coverage.leafCovered += cov.length;
  coverage.middles.push({
    no: mid, name: m.name, field: M.field,
    questions: questions.filter((q) => q.topicIds.some((t) => topics.get(t)?.middle === mid)).length,
    verified: published.filter((q) => q.topicIds.some((t) => topics.get(t)?.middle === mid)).length,
    leafTotal: leaves.length, leafCovered: cov.length,
    uncovered: leaves.filter((t) => !covered(t)).map((t) => `${t.id} ${t.name}`),
  });
}
for (const b of bScope) coverage.subjectB.push({ id: b.id, name: b.name, questions: published.filter((q) => q.topicIds.includes(b.id)).length });

// ===== 出力 =====

if (existsSync(OUT)) rmSync(OUT, { recursive: true, force: true });
mkdirSync(OUT, { recursive: true });
mkdirSync(REPORT_DIR, { recursive: true });

const manifestFiles: ContentManifest['files'] = [];
function emit(name: string, kind: string, data: unknown) {
  const json = JSON.stringify(data);
  const hash = createHash('sha256').update(json).digest('hex').slice(0, 10);
  const path = `${name}.${hash}.json`;
  writeFileSync(join(OUT, path), json);
  manifestFiles.push({ name, path, bytes: Buffer.byteLength(json), kind });
}

const chunks = new Map<string, Question[]>();
for (const q of published) {
  const key = q.subject === 'B' ? q.category : `A-${q.category.padStart(2, '0')}`;
  if (!chunks.has(key)) chunks.set(key, []);
  chunks.get(key)!.push(q);
}
for (const [k, qs] of [...chunks.entries()].sort()) emit(`questions-${k}`, 'questions', qs);
emit('syllabus', 'syllabus', { ...syllabus, subjectB: bScope });
emit('glossary', 'glossary', glossary);
emit('reference', 'reference', reference);
emit('lessons', 'lessons', lessons);
emit('coverage', 'coverage', coverage);
emit('sources', 'sources', loadYaml(join(CONTENT, 'sources.yaml')));

const contentHash = createHash('sha256').update(manifestFiles.map((f) => f.path).join('|')).digest('hex').slice(0, 12);
const manifest: ContentManifest = {
  version: contentHash,
  builtAt: new Date().toISOString(),
  syllabusVersion: syllabus.version,
  counts: { total: published.length, A: published.filter((q) => q.subject === 'A').length, B: published.filter((q) => q.subject === 'B').length },
  files: manifestFiles,
};
writeFileSync(join(OUT, 'manifest.json'), JSON.stringify(manifest, null, 1));

const summary = {
  builtAt: manifest.builtAt,
  totalAuthored: questions.length + rejected.length,
  published: published.length,
  bySubject: manifest.counts,
  bySource: Object.fromEntries(['ipa', 'original'].map((k) => [k, published.filter((q) => q.source.kind === k).length])),
  byDepth: { quick: published.filter((q) => q.depth === 'quick').length, deep: published.filter((q) => q.depth === 'deep').length },
  machineVerified: verifyLog.filter((v) => v.machine && published.some((q) => q.id === v.id)).length,
  withSimulator: published.filter((q) => q.simulation).length,
  rejected,
  checking: questions.filter((q) => q.verificationStatus === 'checking').map((q) => q.id),
  glossaryTerms: glossary.length,
  referenceChapters: reference.length,
  lessons: lessons.length,
  coverage: { leafTotal: coverage.leafTotal, leafCovered: coverage.leafCovered },
  similarPairs: similarPairs.length,
  errors: errors.length,
  warnings: warnings.length,
};
writeFileSync(join(REPORT_DIR, 'content-summary.json'), JSON.stringify(summary, null, 1) + '\n');
writeFileSync(join(REPORT_DIR, 'verification-log.json'), JSON.stringify(verifyLog, null, 1) + '\n');
writeFileSync(join(REPORT_DIR, 'coverage.json'), JSON.stringify(coverage, null, 1) + '\n');
writeFileSync(join(REPORT_DIR, 'similar-pairs.json'), JSON.stringify(similarPairs, null, 1) + '\n');
writeFileSync(join(REPORT_DIR, 'build-warnings.txt'), warnings.join('\n') + '\n');

console.log(`問題: 作成 ${summary.totalAuthored} / 公開 ${published.length}（A ${manifest.counts.A}, B ${manifest.counts.B}）  除外 ${rejected.length}  レビュー待ち ${summary.checking.length}`);
console.log(`機械検証 ${summary.machineVerified}  シミュレーター ${summary.withSimulator}  用語 ${glossary.length}  参考書 ${reference.length}章  講座 ${lessons.length}`);
console.log(`網羅: 末端論点 ${coverage.leafCovered}/${coverage.leafTotal}  類似ペア ${similarPairs.length}`);
console.log(`警告 ${warnings.length} 件（docs/generated/build-warnings.txt）`);
if (errors.length) {
  console.error(`\nエラー ${errors.length} 件:`);
  for (const e of errors.slice(0, 200)) console.error('  ' + e);
  process.exit(1);
}
