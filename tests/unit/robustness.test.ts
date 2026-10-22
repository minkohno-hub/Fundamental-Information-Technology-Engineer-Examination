// 破損データ・メモ上限・保存失敗への耐性テスト
import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import { IDBFactory } from 'fake-indexeddb';
import { openDB } from 'idb';
import { DEFAULT_SETTINGS, Store } from '../../src/data/store';
import { MEMO_MAX, makeBackup, parseBackup } from '../../src/lib/backup';

const flush = () => new Promise((r) => setTimeout(r, 20));

beforeEach(() => {
  globalThis.indexedDB = new IDBFactory();
});

const goodExam = (id: string) => ({
  id, kind: 'A', format: 'practice', startedAt: 1, questionIds: ['A01-001', 'A01-002'], answers: [null, 1], flags: [false, false],
  timePerQuestionMs: [0, 0], orders: [[0, 1, 2, 3], [0, 1, 2, 3]], elapsedMs: 0, status: 'inProgress',
});
const fakeQ = (id: string) => ({ id, choices: ['a', 'b', 'c', 'd'] }) as never;

describe('破損データへの耐性', () => {
  it('不正な記録は無視し、正しい記録と他のデータは残る', async () => {
    const s = new Store();
    await s.init();
    s.recordAnswer({ qid: 'A01-001', at: 1, correct: true, chosen: 0, timeMs: 5, mode: 'practice' });
    s.toggleFavorite('A01-001');
    await flush();
    const db = await openDB('fe-study', 1);
    await db.add('answers', { qid: 12, at: 'x' });
    await db.add('answers', { qid: 'A01-001', at: 2, correct: true, chosen: 0, timeMs: 1, first: false, mode: 'bogus' });
    await db.put('states', { qid: 'A01-009', attempts: 'many', correctCount: 0 });
    await db.put('states', { qid: 'A01-010', attempts: 1, correctCount: 1, memo: 'x'.repeat(9000) });
    await db.put('exams', { ...goodExam('bad-len'), answers: [null] });
    await db.put('exams', { ...goodExam('bad-kind'), kind: 'Z' });
    await db.put('exams', goodExam('ok'));
    await db.put('exams', { ...goodExam('unknown-ids'), questionIds: ['ZZZ-999', 'ZZZ-998'] });
    await db.put('reports', { id: 'r1' });
    await db.put('kv', { fontScale: 'huge', theme: 'neon' }, 'settings');
    await db.put('kv', { id: 's', mode: 'practice' }, 'session');
    db.close();
    const t = new Store();
    await t.init();
    expect(t.persistent).toBe(true);
    expect(t.answers).toHaveLength(1);
    expect(t.getState('A01-001').favorite).toBe(true);
    expect(t.states.has('A01-009')).toBe(false);
    expect(t.states.has('A01-010')).toBe(false);
    expect(t.exams.map((e) => e.id).sort()).toEqual(['ok', 'unknown-ids']);
    expect(t.reports).toHaveLength(0);
    expect(t.settings).toMatchObject({ fontScale: DEFAULT_SETTINGS.fontScale, theme: DEFAULT_SETTINGS.theme });
    expect(t.session).toBeNull();
    // answers 2 + states 2 + exams 2 + reports 1 + session 1（設定は不正な値だけを既定値に戻す）
    expect(t.ignoredRecords).toBe(8);
    t.recordAnswer({ qid: 'A01-002', at: 3, correct: false, chosen: 1, timeMs: 1, mode: 'practice' });
    expect(t.answers).toHaveLength(2);
  });

  it('無視した記録は IndexedDB から削除されない', async () => {
    const s = new Store();
    await s.init();
    const db = await openDB('fe-study', 1);
    await db.put('states', { qid: 'A01-009', attempts: 'many', correctCount: 0 });
    db.close();
    const t = new Store();
    await t.init();
    t.toggleFavorite('A01-001');
    await flush();
    const db2 = await openDB('fe-study', 1);
    expect(await db2.get('states', 'A01-009')).toBeTruthy();
    db2.close();
  });

  it('中断データが教材にない問題を参照していたら外し、すべて無ければ破棄する', async () => {
    const byId = new Map([['A01-001', fakeQ('A01-001')], ['A01-002', fakeQ('A01-002')]]);
    const s = new Store();
    await s.init();
    s.saveSession({
      id: 's', mode: 'practice', title: 't', questionIds: ['A01-001', 'GONE-1', 'A01-002'], index: 2,
      orders: [[0, 1, 2, 3], [0, 1, 2, 3], [3, 3, 3]], results: [true, null, null], chosen: [0, null, null],
      inputs: [null, null, null], hidden: [[], [], []], createdAt: 1,
    });
    expect(s.reconcile(byId)).toBe(true);
    expect(s.session?.questionIds).toEqual(['A01-001', 'A01-002']);
    expect(s.session?.orders[1]).toEqual([0, 1, 2, 3]);
    expect(s.session?.results).toEqual([true, null]);
    expect(s.session!.index).toBeLessThanOrEqual(2);
    s.saveSession({ ...s.session!, questionIds: ['X-1'], orders: [[0, 1, 2, 3]], results: [null], chosen: [null], inputs: [null], hidden: [[]], index: 0 });
    s.reconcile(byId);
    expect(s.session).toBeNull();
  });

  it('模擬試験の選択肢順が問題と合わないときは初期順に戻す', async () => {
    const byId = new Map([['A01-001', fakeQ('A01-001')], ['A01-002', fakeQ('A01-002')]]);
    const s = new Store();
    await s.init();
    s.saveExam({ ...goodExam('e1'), orders: [[0, 1], [9, 1, 2, 3]] } as never);
    s.reconcile(byId);
    expect(s.exams[0].orders).toEqual([[0, 1, 2, 3], [0, 1, 2, 3]]);
  });
});

describe('メモと保存失敗', () => {
  it('10万文字のメモは 5000 文字（MEMO_MAX）に切り捨てられ、切り捨てたことが分かる', async () => {
    const s = new Store();
    await s.init();
    expect(MEMO_MAX).toBe(5000);
    expect(s.setMemo('A01-001', 'あ'.repeat(100_000))).toBe(true);
    expect(s.getState('A01-001').memo).toHaveLength(5000);
    expect(s.setMemo('A01-001', 'あ'.repeat(5000))).toBe(false);
    await flush();
    const t = new Store();
    await t.init();
    expect(t.getState('A01-001').memo).toHaveLength(5000);
    expect(t.ignoredRecords).toBe(0);
    const b = makeBackup(t.exportData(), 'x');
    expect(() => parseBackup(JSON.stringify(b), DEFAULT_SETTINGS)).not.toThrow();
  });

  it('保存に失敗しても storageError を設定するだけでメモリ上では動き続ける', async () => {
    const s = new Store();
    await s.init();
    const quota = () => Promise.reject(new DOMException('quota exceeded', 'QuotaExceededError'));
    (s as unknown as { db: unknown }).db = { put: quota, add: quota, delete: quota };
    s.recordAnswer({ qid: 'A01-001', at: 1, correct: true, chosen: 0, timeMs: 5, mode: 'practice' });
    s.toggleFavorite('A01-001');
    s.updateSettings({ theme: 'dark' });
    await flush();
    expect(s.storageError).toContain('保存に失敗しました');
    expect(s.persistent).toBe(true);
    expect(s.answers).toHaveLength(1);
    expect(s.getState('A01-001').favorite).toBe(true);
    expect(s.settings.theme).toBe('dark');
  });
});
