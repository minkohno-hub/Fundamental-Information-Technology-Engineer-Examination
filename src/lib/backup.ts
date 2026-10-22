// 学習データのエクスポート／インポート。インポート時は構造と値の範囲を検証し、不正なデータを拒否する。
import type { AnswerRecord, ExamRecord, ProblemReport, QuestionState, SessionState, Settings } from '../types';

export const BACKUP_APP = 'fe-study';
export const BACKUP_SCHEMA = 1;
const MAX_BYTES = 30 * 1024 * 1024;
/** 問題ごとのメモの最大文字数。保存時はこれを超える部分を切り捨て、バックアップ検証も同じ上限を使う */
export const MEMO_MAX = 5000;

export interface BackupData {
  answers: AnswerRecord[];
  states: QuestionState[];
  exams: ExamRecord[];
  settings: Settings;
  reports: ProblemReport[];
  session?: SessionState | null;
}

export interface BackupFile {
  app: typeof BACKUP_APP;
  schema: number;
  exportedAt: string;
  appVersion: string;
  data: BackupData;
}

export function makeBackup(data: BackupData, appVersion: string, now = new Date()): BackupFile {
  return { app: BACKUP_APP, schema: BACKUP_SCHEMA, exportedAt: now.toISOString(), appVersion, data };
}

export class BackupError extends Error {}

const isObj = (x: unknown): x is Record<string, unknown> => typeof x === 'object' && x !== null && !Array.isArray(x);
const isStr = (x: unknown, max = 10000): x is string => typeof x === 'string' && x.length <= max;
const isNum = (x: unknown): x is number => typeof x === 'number' && Number.isFinite(x);
const isBool = (x: unknown): x is boolean => typeof x === 'boolean';
const optional = <T>(x: unknown, f: (y: unknown) => y is T) => x === undefined || f(x);
const ID_RE = /^[A-Za-z0-9_-]{1,40}$/;

function check(cond: boolean, msg: string): asserts cond {
  if (!cond) throw new BackupError(msg);
}

export function cleanAnswer(x: unknown, i: number): AnswerRecord {
  check(isObj(x), `回答履歴 ${i + 1} 件目の形式が不正です`);
  check(isStr(x.qid) && ID_RE.test(x.qid), `回答履歴 ${i + 1} 件目の問題IDが不正です`);
  check(isNum(x.at) && isBool(x.correct) && isNum(x.chosen) && isNum(x.timeMs) && isBool(x.first), `回答履歴 ${i + 1} 件目の値が不正です`);
  const modes = ['practice', 'exam', 'review', 'quickB', 'deep', 'lesson'];
  check(isStr(x.mode) && modes.includes(x.mode), `回答履歴 ${i + 1} 件目のモードが不正です`);
  return { qid: x.qid, at: x.at, correct: x.correct, chosen: x.chosen, timeMs: Math.max(0, x.timeMs), first: x.first, mode: x.mode as AnswerRecord['mode'] };
}

export function cleanState(x: unknown, i: number): QuestionState {
  check(isObj(x), `問題の状態 ${i + 1} 件目の形式が不正です`);
  check(isStr(x.qid) && ID_RE.test(x.qid), `問題の状態 ${i + 1} 件目の問題IDが不正です`);
  check(isNum(x.attempts) && isNum(x.correctCount), `問題の状態 ${i + 1} 件目の回数が不正です`);
  const u = ['understood', 'review', 'notUnderstood'];
  check(optional(x.understanding, (y): y is string => isStr(y) && u.includes(y)), `問題の状態 ${i + 1} 件目の理解度が不正です`);
  check(optional(x.memo, (y): y is string => isStr(y, MEMO_MAX)), `メモが長すぎるか不正です（${i + 1} 件目）`);
  for (const k of ['favorite', 'flagged', 'firstCorrect', 'lastCorrect']) check(optional(x[k], isBool), `問題の状態 ${i + 1} 件目の ${k} が不正です`);
  check(optional(x.lastAt, isNum), `問題の状態 ${i + 1} 件目の日時が不正です`);
  return {
    qid: x.qid, attempts: x.attempts, correctCount: x.correctCount,
    firstCorrect: x.firstCorrect as boolean | undefined, lastCorrect: x.lastCorrect as boolean | undefined,
    lastAt: x.lastAt as number | undefined, understanding: x.understanding as QuestionState['understanding'],
    favorite: x.favorite as boolean | undefined, flagged: x.flagged as boolean | undefined, memo: x.memo as string | undefined,
  };
}

export function cleanExam(x: unknown, i: number): ExamRecord {
  check(isObj(x), `模擬試験 ${i + 1} 件目の形式が不正です`);
  check(isStr(x.id, 100) && (x.kind === 'A' || x.kind === 'B'), `模擬試験 ${i + 1} 件目の種類が不正です`);
  check(['real', 'practice', 'short', 'untimed'].includes(x.format as string), `模擬試験 ${i + 1} 件目の形式が不正です`);
  check(Array.isArray(x.questionIds) && x.questionIds.every((q) => isStr(q) && ID_RE.test(q)), `模擬試験 ${i + 1} 件目の問題IDが不正です`);
  const n = (x.questionIds as string[]).length;
  check(n <= 200, `模擬試験 ${i + 1} 件目の問題数が多すぎます`);
  check(Array.isArray(x.answers) && x.answers.length === n && x.answers.every((a) => a === null || isNum(a)), `模擬試験 ${i + 1} 件目の解答が不正です`);
  check(Array.isArray(x.flags) && x.flags.length === n && x.flags.every(isBool), `模擬試験 ${i + 1} 件目の見直しフラグが不正です`);
  check(Array.isArray(x.timePerQuestionMs) && x.timePerQuestionMs.length === n && x.timePerQuestionMs.every(isNum), `模擬試験 ${i + 1} 件目の解答時間が不正です`);
  check(Array.isArray(x.orders) && x.orders.length === n && x.orders.every((o) => Array.isArray(o) && o.every(isNum)), `模擬試験 ${i + 1} 件目の選択肢順が不正です`);
  check(isNum(x.startedAt) && isNum(x.elapsedMs) && optional(x.finishedAt, isNum) && optional(x.timeLimitSec, isNum), `模擬試験 ${i + 1} 件目の時刻が不正です`);
  check(x.status === 'inProgress' || x.status === 'finished', `模擬試験 ${i + 1} 件目の状態が不正です`);
  return {
    id: x.id, kind: x.kind, format: x.format as ExamRecord['format'], startedAt: x.startedAt, finishedAt: x.finishedAt as number | undefined,
    timeLimitSec: x.timeLimitSec as number | undefined, questionIds: x.questionIds as string[], answers: x.answers as (number | null)[],
    flags: x.flags as boolean[], timePerQuestionMs: x.timePerQuestionMs as number[], orders: x.orders as number[][],
    elapsedMs: x.elapsedMs, status: x.status,
  };
}

export function cleanSettings(x: unknown, defaults: Settings): Settings {
  check(isObj(x), '設定の形式が不正です');
  const s: Settings = { ...defaults };
  if (isNum(x.fontScale) && x.fontScale >= 0.8 && x.fontScale <= 1.6) s.fontScale = x.fontScale;
  if (x.theme === 'system' || x.theme === 'light' || x.theme === 'dark') s.theme = x.theme;
  if (isBool(x.reduceMotion)) s.reduceMotion = x.reduceMotion;
  if (isBool(x.shuffleChoices)) s.shuffleChoices = x.shuffleChoices;
  if (isBool(x.quickBInput)) s.quickBInput = x.quickBInput;
  if (isNum(x.defaultCount) && [5, 10, 20, 50].includes(x.defaultCount)) s.defaultCount = x.defaultCount;
  if (isBool(x.onboarded)) s.onboarded = x.onboarded;
  if (isObj(x.plan)) {
    const p = x.plan;
    const exp = ['none', 'basic', 'some', 'experienced'];
    const goal = ['pass', 'high', 'review'];
    if (isStr(p.experience) && exp.includes(p.experience) && isNum(p.dailyMinutes) && isStr(p.goal) && goal.includes(p.goal) && isNum(p.createdAt)) {
      s.plan = {
        experience: p.experience as NonNullable<Settings['plan']>['experience'],
        examDate: isStr(p.examDate, 10) && /^\d{4}-\d{2}-\d{2}$/.test(p.examDate) ? p.examDate : undefined,
        dailyMinutes: Math.min(600, Math.max(5, p.dailyMinutes)),
        goal: p.goal as NonNullable<Settings['plan']>['goal'],
        createdAt: p.createdAt,
      };
    }
  }
  return s;
}

export function cleanReport(x: unknown, i: number): ProblemReport {
  check(isObj(x), `問題報告 ${i + 1} 件目の形式が不正です`);
  check(isStr(x.id, 100) && isStr(x.qid) && ID_RE.test(x.qid) && isStr(x.detail, 5000) && isNum(x.createdAt), `問題報告 ${i + 1} 件目の値が不正です`);
  const kinds = ['answer', 'explanation', 'question', 'typo', 'other'];
  check(isStr(x.kind) && kinds.includes(x.kind), `問題報告 ${i + 1} 件目の種類が不正です`);
  return {
    id: x.id, qid: x.qid, questionSubject: isStr(x.questionSubject, 10) ? x.questionSubject : '', kind: x.kind as ProblemReport['kind'],
    detail: x.detail, appVersion: isStr(x.appVersion, 40) ? x.appVersion : '', contentVersion: isStr(x.contentVersion, 40) ? x.contentVersion : '',
    createdAt: x.createdAt,
  };
}

/** 中断中の演習の検証。配列の長さがそろわないものは拒否する（選択肢順の妥当性は教材を読んだ後に確認する） */
export function cleanSession(x: unknown): SessionState {
  check(isObj(x), '中断データの形式が不正です');
  check(isStr(x.id, 100) && isStr(x.title, 500) && isNum(x.createdAt) && isNum(x.index) && x.index >= 0, '中断データの値が不正です');
  const modes = ['practice', 'exam', 'review', 'quickB', 'deep', 'lesson'];
  check(isStr(x.mode) && modes.includes(x.mode), '中断データのモードが不正です');
  check(Array.isArray(x.questionIds) && x.questionIds.length <= 500 && x.questionIds.every((q) => isStr(q) && ID_RE.test(q)), '中断データの問題IDが不正です');
  const n = x.questionIds.length;
  const arr = (v: unknown, f: (y: unknown) => boolean, fill: () => unknown) => {
    if (v === undefined) return Array.from({ length: n }, fill);
    check(Array.isArray(v) && v.length === n && v.every(f), '中断データの配列が不正です');
    return v;
  };
  check(x.orders !== undefined, '中断データの選択肢順がありません');
  return {
    id: x.id, mode: x.mode as SessionState['mode'], title: x.title, questionIds: x.questionIds as string[], index: Math.floor(x.index),
    orders: arr(x.orders, (o) => Array.isArray(o) && o.length <= 20 && o.every(isNum), () => []) as number[][],
    results: arr(x.results, (r) => r === null || isBool(r), () => null) as (boolean | null)[],
    chosen: arr(x.chosen, (r) => r === null || isNum(r), () => null) as (number | null)[],
    inputs: arr(x.inputs, (r) => r === null || isStr(r, 1000), () => null) as (string | null)[],
    hidden: arr(x.hidden, (o) => Array.isArray(o) && o.every(isNum), () => []) as number[][],
    createdAt: x.createdAt,
  };
}

/** バックアップファイルの文字列を検証し、安全な値だけを取り出す */
export function parseBackup(text: string, defaults: Settings): BackupFile {
  check(text.length <= MAX_BYTES, 'ファイルが大きすぎます');
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    throw new BackupError('JSON として読み込めません。このアプリでエクスポートしたファイルを選んでください');
  }
  check(isObj(raw) && raw.app === BACKUP_APP, 'このアプリのバックアップファイルではありません');
  check(isNum(raw.schema) && raw.schema >= 1 && raw.schema <= BACKUP_SCHEMA, `対応していない形式のバージョンです（${String(raw.schema)}）`);
  check(isObj(raw.data), 'データ部分がありません');
  const d = raw.data;
  check(Array.isArray(d.answers) && Array.isArray(d.states) && Array.isArray(d.exams) && Array.isArray(d.reports ?? []), '必要なデータが欠けています');
  check((d.answers as unknown[]).length <= 500000, '回答履歴の件数が多すぎます');
  const data: BackupData = {
    answers: (d.answers as unknown[]).map(cleanAnswer),
    states: (d.states as unknown[]).map(cleanState),
    exams: (d.exams as unknown[]).map(cleanExam),
    settings: cleanSettings(d.settings ?? {}, defaults),
    reports: ((d.reports ?? []) as unknown[]).map(cleanReport),
    session: null,
  };
  return {
    app: BACKUP_APP,
    schema: raw.schema,
    exportedAt: isStr(raw.exportedAt, 40) ? raw.exportedAt : '',
    appVersion: isStr(raw.appVersion, 40) ? raw.appVersion : '',
    data,
  };
}
