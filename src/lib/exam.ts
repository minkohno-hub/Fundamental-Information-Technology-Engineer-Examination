// 模擬試験の構成。問題数・試験時間は IPA 試験要綱 Ver.5.6（2026年7月6日掲載）に基づく。
//   科目A：90分・60問（四肢択一）／科目B：100分・20問（アルゴリズムとプログラミング16問・情報セキュリティ4問）
// 科目Aの分野別出題数は公表されていないため、本アプリではシラバスの末端論点数に比例させて配分する（独自方針）。
import type { ExamRecord, Question } from '../types';
import { choiceOrder, shuffle } from './rng';

export const EXAM_SPEC = {
  A: { count: 60, minutes: 90 },
  B: { count: 20, minutes: 100, alg: 16, sec: 4 },
} as const;

export type ExamFormat = ExamRecord['format'];

export interface ExamPlan {
  kind: 'A' | 'B';
  format: ExamFormat;
  count: number;
  minutes: number | null;
}

export function examPlan(kind: 'A' | 'B', format: ExamFormat): ExamPlan {
  const spec = EXAM_SPEC[kind];
  if (format === 'short') {
    // 短縮版：本番の 1/3 の問題数と時間
    return { kind, format, count: Math.round(spec.count / 3), minutes: Math.round(spec.minutes / 3) };
  }
  return { kind, format, count: spec.count, minutes: format === 'untimed' ? null : spec.minutes };
}

/** 配分（最大剰余法）：weights に比例して total を整数に分ける */
export function apportion(weights: Map<string, number>, total: number): Map<string, number> {
  const sum = [...weights.values()].reduce((a, b) => a + b, 0) || 1;
  const exact = [...weights.entries()].map(([k, w]) => ({ k, v: (w / sum) * total }));
  const out = new Map(exact.map(({ k, v }) => [k, Math.floor(v)]));
  let rest = total - [...out.values()].reduce((a, b) => a + b, 0);
  for (const { k } of [...exact].sort((a, b) => (b.v - Math.floor(b.v)) - (a.v - Math.floor(a.v)))) {
    if (rest <= 0) break;
    out.set(k, out.get(k)! + 1);
    rest--;
  }
  return out;
}

export function composeExam(
  plan: ExamPlan,
  questions: Question[],
  categoryWeights: Map<string, number>,
  rand: () => number,
): Question[] {
  if (plan.kind === 'A') {
    const pool = questions.filter((q) => q.subject === 'A' && q.questionType === 'choice');
    const byCat = new Map<string, Question[]>();
    for (const q of shuffle(pool, rand)) {
      if (!byCat.has(q.category)) byCat.set(q.category, []);
      byCat.get(q.category)!.push(q);
    }
    const weights = new Map([...categoryWeights.entries()].filter(([k]) => byCat.has(k)));
    const quota = apportion(weights, plan.count);
    const picked: Question[] = [];
    for (const [k, n] of quota) picked.push(...(byCat.get(k) ?? []).slice(0, n));
    // 分野の問題が足りない場合は残りから補う
    const used = new Set(picked.map((q) => q.id));
    for (const q of shuffle(pool, rand)) {
      if (picked.length >= plan.count) break;
      if (!used.has(q.id)) { picked.push(q); used.add(q.id); }
    }
    // 本番に近い順序（テクノロジ→マネジメント→ストラテジ、すなわち中分類番号順）に並べる
    return picked.sort((a, b) => Number(a.category) - Number(b.category));
  }
  const examLike = (q: Question) => q.subject === 'B' && q.questionType === 'choice' && q.depth === 'deep';
  const alg = shuffle(questions.filter((q) => examLike(q) && q.category === 'B-ALG'), rand);
  const sec = shuffle(questions.filter((q) => q.subject === 'B' && q.questionType === 'choice' && q.category === 'B-SEC'), rand);
  const ratio = plan.count / EXAM_SPEC.B.count;
  const nSec = Math.max(1, Math.round(EXAM_SPEC.B.sec * ratio));
  const nAlg = plan.count - nSec;
  return [...alg.slice(0, nAlg), ...sec.slice(0, nSec)];
}

export function createExamRecord(plan: ExamPlan, qs: Question[], shuffleChoices: boolean, rand: () => number, now: number): ExamRecord {
  return {
    id: `exam-${now}`,
    kind: plan.kind,
    format: plan.format,
    startedAt: now,
    timeLimitSec: plan.minutes ? plan.minutes * 60 : undefined,
    questionIds: qs.map((q) => q.id),
    answers: qs.map(() => null),
    flags: qs.map(() => false),
    timePerQuestionMs: qs.map(() => 0),
    orders: qs.map((q) => choiceOrder(q.choices.length, shuffleChoices && !q.noShuffle, rand)),
    elapsedMs: 0,
    status: 'inProgress',
  };
}

/** 残り時間（ミリ秒）。本番形式は実時間で減り続ける（中断しても止まらない） */
export function remainingMs(exam: ExamRecord, now: number, activeSince: number | null): number | null {
  if (!exam.timeLimitSec) return null;
  const elapsed = exam.format === 'real' ? now - exam.startedAt : exam.elapsedMs + (activeSince ? now - activeSince : 0);
  return Math.max(0, exam.timeLimitSec * 1000 - elapsed);
}
