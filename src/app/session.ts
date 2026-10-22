import type { Question, SessionState, AnswerRecord } from '../types';
import { store } from '../data/store';
import { choiceOrder, mulberry32, randomSeed, shuffle } from '../lib/rng';
import { selectQuestions, type SelectMode } from '../lib/selection';
import { navigate } from './router';
import { ratioB } from '../lib/plan';

export function startSession(mode: AnswerRecord['mode'], title: string, qs: Question[]) {
  if (!qs.length) return false;
  const rand = mulberry32(randomSeed());
  const s: SessionState = {
    id: `s-${Date.now()}`,
    mode,
    title,
    questionIds: qs.map((q) => q.id),
    index: 0,
    orders: qs.map((q) => choiceOrder(q.choices.length, store.settings.shuffleChoices && !q.noShuffle, rand)),
    results: qs.map(() => null),
    chosen: qs.map(() => null),
    inputs: qs.map(() => null),
    hidden: qs.map(() => []),
    createdAt: Date.now(),
  };
  store.saveSession(s);
  navigate('/session');
  return true;
}

export function pick(pool: Question[], mode: SelectMode, count: number): Question[] {
  return selectQuestions(pool, store.states, {
    mode,
    count,
    now: Date.now(),
    rand: mulberry32(randomSeed()),
    recentIds: store.recentIds(),
  });
}

/**
 * 「今すぐ学習」の出題。短時間で解ける問題（depth: quick）を対象に標準出題で選ぶ。
 * 学習プランがあれば科目A/Bの配分に反映する（なければ A 7 : B 3）。
 */
export function quickStartPool(all: Question[]): { pool: Question[]; ratioB: number } {
  return { pool: all.filter((q) => q.depth === 'quick' && q.difficulty <= 3), ratioB: ratioB(store.settings.plan) };
}

export function quickStart(all: Question[], count = store.settings.defaultCount) {
  const { pool, ratioB } = quickStartPool(all);
  const nB = Math.round(count * ratioB);
  const b = pick(pool.filter((q) => q.subject === 'B'), 'standard', nB);
  const a = pick(pool.filter((q) => q.subject === 'A'), 'standard', count - b.length);
  return startSession('practice', '今すぐ学習', shuffle([...a, ...b], mulberry32(randomSeed())));
}

/** 応用・高難度問題で間違えたときに戻る、同じ論点の基礎・標準問題（なければ同じ小分類）を選ぶ */
export function foundationsFor(wrong: Question[], all: Question[], max = 10): Question[] {
  const wrongIds = new Set(wrong.map((q) => q.id));
  const topics = new Set(wrong.flatMap((q) => q.topicIds));
  const subs = new Set(wrong.map((q) => q.subcategory));
  const base = all.filter((q) => q.difficulty <= 2 && q.depth === 'quick' && !wrongIds.has(q.id));
  const sameTopic = base.filter((q) => q.topicIds.some((t) => topics.has(t)));
  const sameSub = base.filter((q) => !sameTopic.includes(q) && subs.has(q.subcategory));
  const rand = mulberry32(randomSeed());
  return [...shuffle(sameTopic, rand), ...shuffle(sameSub, rand)].slice(0, max);
}
