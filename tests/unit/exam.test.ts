// 模擬試験の構成・時間・採点のテスト
import { describe, expect, it } from 'vitest';
import { EXAM_SPEC, apportion, composeExam, createExamRecord, examPlan, remainingMs } from '../../src/lib/exam';
import { scoreExam } from '../../src/lib/stats';
import { mulberry32 } from '../../src/lib/rng';
import { makePool, makeQuestion } from './helpers';

describe('試験の仕様', () => {
  it('IPA 試験要綱どおりの問題数と時間', () => {
    expect(examPlan('A', 'real')).toMatchObject({ count: 60, minutes: 90 });
    expect(examPlan('B', 'real')).toMatchObject({ count: 20, minutes: 100 });
    expect(EXAM_SPEC.B.alg + EXAM_SPEC.B.sec).toBe(20);
    expect(examPlan('A', 'untimed').minutes).toBeNull();
    expect(examPlan('A', 'short')).toMatchObject({ count: 20, minutes: 30 });
  });

  it('最大剰余法で合計を保ったまま配分する', () => {
    const m = apportion(new Map([['x', 1], ['y', 1], ['z', 1]]), 10);
    expect([...m.values()].reduce((a, b) => a + b, 0)).toBe(10);
    expect([...m.values()].sort()).toEqual([3, 3, 4]);
  });
});

describe('出題構成', () => {
  const poolA = makePool(['1', '2', '3', '4'], 30);
  const poolB = [
    ...makePool(['B-ALG'], 30, { subject: 'B', depth: 'deep' }),
    ...makePool(['B-SEC'], 10, { subject: 'B', depth: 'deep' }),
    ...makePool(['B-ALG'], 10, { subject: 'B', depth: 'quick' }).map((q) => ({ ...q, id: q.id.replace('BALG', 'DRL') })),
  ];

  it('科目Aは重みに比例して60問を重複なく選び、分野順に並べる', () => {
    const w = new Map([['1', 3], ['2', 1], ['3', 1], ['4', 1]]);
    const qs = composeExam(examPlan('A', 'real'), poolA, w, mulberry32(1));
    expect(qs).toHaveLength(60);
    expect(new Set(qs.map((q) => q.id)).size).toBe(60);
    expect(qs.filter((q) => q.category === '1')).toHaveLength(30);
    const cats = qs.map((q) => Number(q.category));
    expect(cats).toEqual([...cats].sort((a, b) => a - b));
  });

  it('科目Bはアルゴリズム16問・セキュリティ4問で、短答ドリルは含めない', () => {
    const qs = composeExam(examPlan('B', 'real'), poolB, new Map(), mulberry32(2));
    expect(qs).toHaveLength(20);
    expect(qs.filter((q) => q.category === 'B-SEC')).toHaveLength(4);
    expect(qs.every((q) => q.depth === 'deep')).toBe(true);
  });

  it('記録は問題ごとの解答欄・フラグ・選択肢順を持ち、noShuffle を守る', () => {
    const qs = [makeQuestion('X1'), makeQuestion('X2', { noShuffle: true })];
    const e = createExamRecord(examPlan('A', 'practice'), qs, true, mulberry32(3), 1000);
    expect(e.answers).toEqual([null, null]);
    expect(e.flags).toEqual([false, false]);
    expect(e.orders[1]).toEqual([0, 1, 2, 3]);
    expect([...e.orders[0]].sort()).toEqual([0, 1, 2, 3]);
    expect(e.timeLimitSec).toBe(90 * 60);
  });
});

describe('残り時間', () => {
  const qs = [makeQuestion('X1')];
  it('本番形式は中断しても実時間で減る', () => {
    const e = createExamRecord(examPlan('A', 'real'), qs, false, mulberry32(1), 0);
    expect(remainingMs(e, 60_000, null)).toBe(89 * 60_000);
    expect(remainingMs(e, 100 * 60_000, null)).toBe(0);
  });
  it('練習形式は解いている間だけ減る', () => {
    const e = { ...createExamRecord(examPlan('A', 'practice'), qs, false, mulberry32(1), 0), elapsedMs: 60_000 };
    expect(remainingMs(e, 10 * 60_000, null)).toBe(89 * 60_000);
    expect(remainingMs(e, 10 * 60_000, 9 * 60_000)).toBe(88 * 60_000);
  });
  it('時間無制限は null', () => {
    const e = createExamRecord(examPlan('A', 'untimed'), qs, false, mulberry32(1), 0);
    expect(remainingMs(e, 1e9, null)).toBeNull();
  });
});

describe('採点', () => {
  it('正解・誤答・未解答・分野別を集計する', () => {
    const qs = [makeQuestion('X1', { category: '1' }), makeQuestion('X2', { category: '1', correctAnswer: 2 }), makeQuestion('X3', { category: '2' })];
    const e = { ...createExamRecord(examPlan('A', 'practice'), qs, false, mulberry32(1), 0), answers: [0, 1, null] };
    const s = scoreExam(e, new Map(qs.map((q) => [q.id, q])));
    expect(s).toMatchObject({ correct: 1, total: 3, answered: 2, wrongIds: ['X2'], unansweredIds: ['X3'] });
    expect(s.byCategory.find((c) => c.category === '1')).toMatchObject({ correct: 1, total: 2 });
  });
});

describe('高難度の問題と模擬試験', () => {
  it('本番形式の模擬試験には高難度（4）の問題を含めない', () => {
    const pool = [...makePool(['1', '2'], 40), ...makePool(['3'], 40, { difficulty: 4 }).map((q) => ({ ...q, id: q.id.replace('Q', 'H') }))];
    const qs = composeExam(examPlan('A', 'real'), pool, new Map([['1', 1], ['2', 1], ['3', 1]]), mulberry32(5));
    expect(qs).toHaveLength(60);
    expect(qs.every((q) => q.difficulty <= 3)).toBe(true);
  });
});
