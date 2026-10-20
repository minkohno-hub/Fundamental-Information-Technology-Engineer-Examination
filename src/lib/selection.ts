// 出題問題の選択。ルールを単純に保ち、テストと説明ができるようにしている。
//
// 標準出題（standard）の考え方:
//   1. 直近に解いた問題（直近 RECENT_WINDOW 回答以内・または 20 分以内）は原則として除外する
//   2. 候補を「未回答」「要復習（最後に不正解／理解度が低い）」「復習時期（正解済みだが一定期間が経過）」に分ける
//   3. 未回答 60%・要復習 25%・復習時期 15% を目安に取り出し、足りない分は他の区分から補う
//   4. 未回答の中では、まだ学習量の少ない分野（中分類）から順に分散して選ぶ
import type { Question, QuestionState } from '../types';
import { shuffle } from './rng';

export type SelectMode =
  | 'standard' | 'unanswered' | 'weakCategory' | 'review' | 'random'
  | 'favorite' | 'flagged' | 'notUnderstood' | 'reviewUnderstanding';

export interface SelectOptions {
  mode: SelectMode;
  count: number;
  now: number;
  rand: () => number;
  /** 直近に回答した問題 ID（新しい順） */
  recentIds?: string[];
}

export const RECENT_WINDOW = 30;
const RECENT_MS = 20 * 60 * 1000;
/** 正解した回数に応じた復習間隔（日） */
export const REVIEW_INTERVAL_DAYS = [1, 3, 7, 14, 30, 60];

export function isWeak(s: QuestionState | undefined): boolean {
  if (!s || s.attempts === 0) return false;
  return s.lastCorrect === false || s.understanding === 'review' || s.understanding === 'notUnderstood';
}

export function isReviewDue(s: QuestionState | undefined, now: number): boolean {
  if (!s || s.attempts === 0 || !s.lastAt || s.lastCorrect === false) return false;
  if (s.understanding === 'understood' && s.correctCount >= 3) {
    // 理解済みかつ3回以上正解した問題は長い間隔で復習する
    return now - s.lastAt > REVIEW_INTERVAL_DAYS[REVIEW_INTERVAL_DAYS.length - 1] * 86400000;
  }
  const idx = Math.min(Math.max(s.correctCount - 1, 0), REVIEW_INTERVAL_DAYS.length - 1);
  return now - s.lastAt > REVIEW_INTERVAL_DAYS[idx] * 86400000;
}

/** 分野ごとに交互に取り出す（偏りを防ぐ）。分野の順は学習量（回答済み問題数）の少ない順 */
function spreadByCategory(qs: Question[], studiedByCat: Map<string, number>, rand: () => number): Question[] {
  const groups = new Map<string, Question[]>();
  for (const q of shuffle(qs, rand)) {
    if (!groups.has(q.category)) groups.set(q.category, []);
    groups.get(q.category)!.push(q);
  }
  const order = shuffle([...groups.keys()], rand).sort((a, b) => (studiedByCat.get(a) ?? 0) - (studiedByCat.get(b) ?? 0));
  const out: Question[] = [];
  let progressed = true;
  while (progressed) {
    progressed = false;
    for (const k of order) {
      const g = groups.get(k)!;
      if (g.length) { out.push(g.shift()!); progressed = true; }
    }
  }
  return out;
}

export function selectQuestions(pool: Question[], states: Map<string, QuestionState>, opt: SelectOptions): Question[] {
  const { count, rand, now } = opt;
  const studiedByCat = new Map<string, number>();
  for (const q of pool) if (states.get(q.id)?.attempts) studiedByCat.set(q.category, (studiedByCat.get(q.category) ?? 0) + 1);
  const recent = new Set((opt.recentIds ?? []).slice(0, RECENT_WINDOW));
  const isRecent = (q: Question) => {
    const s = states.get(q.id);
    return recent.has(q.id) || (s?.lastAt !== undefined && now - s.lastAt < RECENT_MS);
  };
  const st = (q: Question) => states.get(q.id);
  const take = (qs: Question[], n: number) => qs.slice(0, Math.max(0, n));
  const fresh = pool.filter((q) => !isRecent(q));
  const base = fresh.length >= count ? fresh : pool;

  switch (opt.mode) {
    case 'random':
      return take(shuffle(base, rand), count);
    case 'unanswered':
      return take(spreadByCategory(pool.filter((q) => !st(q)?.attempts), studiedByCat, rand), count);
    case 'favorite':
      return take(shuffle(pool.filter((q) => st(q)?.favorite), rand), count);
    case 'flagged':
      return take(shuffle(pool.filter((q) => st(q)?.flagged), rand), count);
    case 'notUnderstood':
      return take(shuffle(pool.filter((q) => st(q)?.understanding === 'notUnderstood'), rand), count);
    case 'reviewUnderstanding':
      return take(shuffle(pool.filter((q) => st(q)?.understanding === 'review'), rand), count);
    case 'review': {
      const weak = shuffle(base.filter((q) => isWeak(st(q))), rand);
      const due = shuffle(base.filter((q) => !isWeak(st(q)) && isReviewDue(st(q), now)), rand);
      return take([...weak, ...due], count);
    }
    case 'weakCategory': {
      const acc = categoryAccuracy(pool, states);
      // 正答率が低い分野（未学習の分野は 0.5 とみなす）から優先して出題
      const ranked = [...acc.entries()].sort((a, b) => a[1] - b[1]).map(([k]) => k);
      const weakCats = new Set(ranked.slice(0, Math.max(1, Math.ceil(ranked.length / 3))));
      const inWeak = base.filter((q) => weakCats.has(q.category));
      const ordered = [
        ...shuffle(inWeak.filter((q) => isWeak(st(q))), rand),
        ...shuffle(inWeak.filter((q) => !st(q)?.attempts), rand),
        ...shuffle(inWeak.filter((q) => st(q)?.attempts && !isWeak(st(q))), rand),
      ];
      return take(ordered, count);
    }
    case 'standard':
    default: {
      const unanswered = spreadByCategory(base.filter((q) => !st(q)?.attempts), studiedByCat, rand);
      const weak = shuffle(base.filter((q) => isWeak(st(q))), rand);
      const due = shuffle(base.filter((q) => !isWeak(st(q)) && isReviewDue(st(q), now)), rand);
      const nWeak = Math.round(count * 0.25);
      const nDue = Math.round(count * 0.15);
      const picked: Question[] = [...take(weak, nWeak), ...take(due, nDue)];
      const used = new Set(picked.map((q) => q.id));
      for (const q of unanswered) {
        if (picked.length >= count) break;
        if (!used.has(q.id)) { picked.push(q); used.add(q.id); }
      }
      // 不足分を要復習→復習時期→その他の順で補う
      const rest = [...weak, ...due, ...shuffle(base, rand)];
      for (const q of rest) {
        if (picked.length >= count) break;
        if (!used.has(q.id)) { picked.push(q); used.add(q.id); }
      }
      return shuffle(picked, rand);
    }
  }
}

/** 分野ごとの正答率（全回答ベース）。未学習分野は 0.5 */
export function categoryAccuracy(pool: Question[], states: Map<string, QuestionState>): Map<string, number> {
  const agg = new Map<string, { c: number; n: number }>();
  for (const q of pool) {
    if (!agg.has(q.category)) agg.set(q.category, { c: 0, n: 0 });
    const s = states.get(q.id);
    if (s?.attempts) {
      const a = agg.get(q.category)!;
      a.c += s.correctCount;
      a.n += s.attempts;
    }
  }
  return new Map([...agg.entries()].map(([k, v]) => [k, v.n ? v.c / v.n : 0.5]));
}
