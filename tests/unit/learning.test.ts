// 出題選択・学習分析・入力式の採点のテスト
import { describe, expect, it } from 'vitest';
import type { AnswerRecord, QuestionState } from '../../src/types';
import { selectQuestions, isWeak, isReviewDue, categoryAccuracy, RECENT_WINDOW } from '../../src/lib/selection';
import { computeAnalytics, computeStreak, localDate } from '../../src/lib/stats';
import { mulberry32, shuffle, choiceOrder } from '../../src/lib/rng';
import { isAcceptedInput, normalizeForCompare, matchesQuery } from '../../src/lib/text';
import { makePool, makeQuestion } from './helpers';

const DAY = 86400000;
const NOW = new Date(2026, 9, 21, 12, 0, 0).getTime();
const st = (qid: string, o: Partial<QuestionState>): QuestionState => ({ qid, attempts: 1, correctCount: 1, ...o });

describe('乱数とシャッフル', () => {
  it('同じシードなら同じ並びになり、要素は保たれる', () => {
    const a = shuffle([1, 2, 3, 4, 5, 6], mulberry32(42));
    const b = shuffle([1, 2, 3, 4, 5, 6], mulberry32(42));
    expect(a).toEqual(b);
    expect([...a].sort()).toEqual([1, 2, 3, 4, 5, 6]);
  });
  it('シャッフルしない指定なら選択肢の順は元のまま', () => {
    expect(choiceOrder(4, false, mulberry32(1))).toEqual([0, 1, 2, 3]);
    expect([...choiceOrder(4, true, mulberry32(1))].sort()).toEqual([0, 1, 2, 3]);
  });
});

describe('出題選択', () => {
  const pool = makePool(['1', '2', '3'], 20);

  it('要求した数だけ、重複なく選ぶ', () => {
    for (const mode of ['standard', 'random', 'unanswered'] as const) {
      const r = selectQuestions(pool, new Map(), { mode, count: 10, now: NOW, rand: mulberry32(7) });
      expect(r).toHaveLength(10);
      expect(new Set(r.map((q) => q.id)).size).toBe(10);
    }
  });

  it('未回答モードは分野を分散させる', () => {
    const r = selectQuestions(pool, new Map(), { mode: 'unanswered', count: 9, now: NOW, rand: mulberry32(3) });
    const counts = new Map<string, number>();
    for (const q of r) counts.set(q.category, (counts.get(q.category) ?? 0) + 1);
    expect([...counts.values()]).toEqual([3, 3, 3]);
  });

  it('未回答モードは回答済みの問題を出さない', () => {
    const states = new Map(pool.slice(0, 50).map((q) => [q.id, st(q.id, { lastAt: NOW - 10 * DAY })]));
    const r = selectQuestions(pool, states, { mode: 'unanswered', count: 20, now: NOW, rand: mulberry32(3) });
    expect(r).toHaveLength(10);
    expect(r.every((q) => !states.has(q.id))).toBe(true);
  });

  it('標準出題は直近に解いた問題を除外する', () => {
    const recentIds = pool.slice(0, RECENT_WINDOW).map((q) => q.id);
    const states = new Map(recentIds.map((id) => [id, st(id, { lastAt: NOW - 60_000, lastCorrect: false })]));
    const r = selectQuestions(pool, states, { mode: 'standard', count: 20, now: NOW, rand: mulberry32(9), recentIds });
    expect(r.some((q) => recentIds.includes(q.id))).toBe(false);
  });

  it('標準出題は要復習の問題を約25%含める', () => {
    const states = new Map<string, QuestionState>();
    pool.slice(0, 30).forEach((q) => states.set(q.id, st(q.id, { lastCorrect: false, correctCount: 0, lastAt: NOW - 2 * DAY })));
    const r = selectQuestions(pool, states, { mode: 'standard', count: 20, now: NOW, rand: mulberry32(5) });
    const weak = r.filter((q) => isWeak(states.get(q.id))).length;
    expect(weak).toBe(5);
  });

  it('お気に入り・復習モードは該当する問題だけを出す', () => {
    const states = new Map<string, QuestionState>([
      ['Q1-001', st('Q1-001', { favorite: true, lastAt: NOW - DAY })],
      ['Q2-001', st('Q2-001', { lastCorrect: false, correctCount: 0, lastAt: NOW - DAY })],
    ]);
    expect(selectQuestions(pool, states, { mode: 'favorite', count: 10, now: NOW, rand: mulberry32(1) }).map((q) => q.id)).toEqual(['Q1-001']);
    expect(selectQuestions(pool, states, { mode: 'review', count: 10, now: NOW, rand: mulberry32(1) }).map((q) => q.id)).toEqual(['Q2-001']);
  });

  it('苦手分野モードは正答率の低い分野から出す', () => {
    const states = new Map<string, QuestionState>();
    pool.filter((q) => q.category === '2').slice(0, 10).forEach((q) => states.set(q.id, st(q.id, { correctCount: 0, lastCorrect: false, lastAt: NOW - DAY })));
    pool.filter((q) => q.category === '1').slice(0, 10).forEach((q) => states.set(q.id, st(q.id, { lastAt: NOW - DAY })));
    const acc = categoryAccuracy(pool, states);
    expect(acc.get('2')).toBe(0);
    expect(acc.get('3')).toBe(0.5);
    const r = selectQuestions(pool, states, { mode: 'weakCategory', count: 5, now: NOW, rand: mulberry32(2) });
    expect(r.every((q) => q.category === '2')).toBe(true);
  });

  it('復習間隔は正解回数に応じて延びる', () => {
    expect(isReviewDue(st('x', { correctCount: 1, lastCorrect: true, lastAt: NOW - 2 * DAY }), NOW)).toBe(true);
    expect(isReviewDue(st('x', { correctCount: 3, lastCorrect: true, lastAt: NOW - 2 * DAY }), NOW)).toBe(false);
    expect(isReviewDue(st('x', { correctCount: 3, lastCorrect: true, lastAt: NOW - 8 * DAY }), NOW)).toBe(true);
    expect(isReviewDue(st('x', { lastCorrect: false, lastAt: NOW - 100 * DAY }), NOW)).toBe(false);
  });
});

describe('学習分析', () => {
  const qs = [makeQuestion('A1', { category: '1' }), makeQuestion('A2', { category: '1' }), makeQuestion('B1', { subject: 'B', category: 'B-ALG', topicIds: ['B2'] })];
  const ans = (qid: string, at: number, correct: boolean, first: boolean): AnswerRecord => ({ qid, at, correct, first, chosen: 0, timeMs: 1000, mode: 'practice' });

  it('初回正答率・全体正答率・復習時正答率を区別する', () => {
    const answers = [ans('A1', NOW - DAY, false, true), ans('A1', NOW, true, false), ans('A2', NOW, true, true), ans('B1', NOW, true, true)];
    const a = computeAnalytics(qs, answers, NOW, 10);
    expect(a.first).toMatchObject({ correct: 2, total: 3 });
    expect(a.all).toMatchObject({ correct: 3, total: 4 });
    expect(a.review).toMatchObject({ correct: 1, total: 1 });
    expect(a.unanswered).toBe(0);
    expect(a.bySubject.B.first.rate).toBe(1);
    expect(a.topicCoverage).toEqual({ studied: 1, total: 10 });
    expect(a.streak).toBe(2);
  });

  it('存在しない問題の回答は集計しない', () => {
    const a = computeAnalytics(qs, [ans('ZZ', NOW, true, true)], NOW, 10);
    expect(a.totalAnswers).toBe(0);
    expect(a.first.rate).toBeNull();
  });

  it('連続学習日数は今日または昨日から数える', () => {
    const d = (k: number) => localDate(NOW - k * DAY);
    expect(computeStreak(new Set([d(0), d(1), d(2)]), NOW)).toBe(3);
    expect(computeStreak(new Set([d(1), d(2)]), NOW)).toBe(2);
    expect(computeStreak(new Set([d(2)]), NOW)).toBe(0);
  });

  it('5回以上回答して正答率60%未満の分野を苦手分野とする', () => {
    const answers = Array.from({ length: 5 }, (_, i) => ans('A1', NOW - i, i === 0, i === 4));
    const a = computeAnalytics(qs, answers, NOW, 10);
    expect(a.weakCategories.map((c) => c.category)).toEqual(['1']);
  });
});

describe('入力式の採点と検索', () => {
  it('全角半角・空白・大文字小文字の違いは許容する', () => {
    expect(isAcceptedInput(' １２ ', ['12'])).toBe(true);
    expect(isAcceptedInput('Total + Data[i]', ['total＋data[i]'])).toBe(true);
    expect(isAcceptedInput('i <= n', ['i ≦ n'])).toBe(true);
  });
  it('演算子や値の違いは区別する', () => {
    expect(isAcceptedInput('i < n', ['i ≦ n'])).toBe(false);
    expect(isAcceptedInput('13', ['12'])).toBe(false);
    expect(isAcceptedInput('', ['12'])).toBe(false);
  });
  it('検索はカタカナとひらがな・全角半角を区別しない', () => {
    expect(normalizeForCompare('スタック')).toBe(normalizeForCompare('すたっく'));
    expect(matchesQuery('ＴＣＰ/IP の仕組み', 'tcp 仕組')).toBe(true);
    expect(matchesQuery('ＴＣＰ/IP の仕組み', 'udp')).toBe(false);
  });
});
