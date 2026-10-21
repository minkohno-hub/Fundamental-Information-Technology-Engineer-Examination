// 端末内保存（IndexedDB）とバックアップのテスト
import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import { IDBFactory } from 'fake-indexeddb';
import { DEFAULT_SETTINGS, Store } from '../../src/data/store';
import { BackupError, makeBackup, parseBackup } from '../../src/lib/backup';

const flush = () => new Promise((r) => setTimeout(r, 20));

beforeEach(() => {
  globalThis.indexedDB = new IDBFactory();
});

describe('Store', () => {
  it('回答を記録し、初回かどうかと状態を更新する', async () => {
    const s = new Store();
    await s.init();
    expect(s.persistent).toBe(true);
    const a1 = s.recordAnswer({ qid: 'A01-001', at: 1, correct: false, chosen: 1, timeMs: 5, mode: 'practice' });
    const a2 = s.recordAnswer({ qid: 'A01-001', at: 2, correct: true, chosen: 0, timeMs: 5, mode: 'practice' });
    expect(a1.first).toBe(true);
    expect(a2.first).toBe(false);
    expect(s.getState('A01-001')).toMatchObject({ attempts: 2, correctCount: 1, firstCorrect: false, lastCorrect: true, lastAt: 2 });
  });

  it('再読み込み後も回答・お気に入り・メモ・設定・中断データが残る', async () => {
    const s = new Store();
    await s.init();
    s.recordAnswer({ qid: 'A01-002', at: 10, correct: true, chosen: 0, timeMs: 5, mode: 'practice' });
    s.toggleFavorite('A01-002');
    s.setMemo('A01-002', '覚える');
    s.setUnderstanding('A01-002', 'review');
    s.updateSettings({ fontScale: 1.2, theme: 'dark' });
    s.saveSession({ id: 's1', mode: 'practice', title: 't', questionIds: ['A01-002'], index: 0, orders: [[0, 1, 2, 3]], results: [null], chosen: [null], inputs: [null], hidden: [[]], createdAt: 1 });
    await flush();
    const t = new Store();
    await t.init();
    expect(t.answers).toHaveLength(1);
    expect(t.getState('A01-002')).toMatchObject({ favorite: true, memo: '覚える', understanding: 'review' });
    expect(t.settings).toMatchObject({ fontScale: 1.2, theme: 'dark' });
    expect(t.session?.id).toBe('s1');
    expect(t.recentIds()).toEqual(['A01-002']);
  });

  it('インポートは既存データを置き換え、削除で初期化される', async () => {
    const s = new Store();
    await s.init();
    s.recordAnswer({ qid: 'A01-003', at: 10, correct: true, chosen: 0, timeMs: 5, mode: 'practice' });
    await flush();
    await s.replaceAll({ answers: [{ qid: 'A02-001', at: 5, correct: false, chosen: 2, timeMs: 1, first: true, mode: 'exam' }], states: [{ qid: 'A02-001', attempts: 1, correctCount: 0 }], exams: [], reports: [], settings: { ...DEFAULT_SETTINGS } });
    const t = new Store();
    await t.init();
    expect(t.answers.map((a) => a.qid)).toEqual(['A02-001']);
    expect(t.states.has('A01-003')).toBe(false);
    await t.clearAll();
    const u = new Store();
    await u.init();
    expect(u.answers).toHaveLength(0);
    expect(u.settings).toEqual(DEFAULT_SETTINGS);
  });

  it('IndexedDB が使えない環境ではメモリ保存に切り替え、理由を記録する', async () => {
    // @ts-expect-error テストのため削除する
    delete globalThis.indexedDB;
    const s = new Store();
    await s.init();
    expect(s.persistent).toBe(false);
    expect(s.storageError).toBeTruthy();
    s.recordAnswer({ qid: 'A01-001', at: 1, correct: true, chosen: 0, timeMs: 1, mode: 'practice' });
    expect(s.getState('A01-001').attempts).toBe(1);
  });
});

describe('バックアップ', () => {
  const data = {
    answers: [{ qid: 'A01-001', at: 1, correct: true, chosen: 0, timeMs: 10, first: true, mode: 'practice' as const }],
    states: [{ qid: 'A01-001', attempts: 1, correctCount: 1, favorite: true, memo: 'メモ' }],
    exams: [],
    settings: { ...DEFAULT_SETTINGS, fontScale: 1.1 },
    reports: [],
  };

  it('エクスポートしたものをそのまま読み込める', () => {
    const text = JSON.stringify(makeBackup(data, '1.0.0', new Date(0)));
    const b = parseBackup(text, DEFAULT_SETTINGS);
    expect(b.data.answers).toEqual(data.answers);
    expect(b.data.states[0]).toMatchObject({ favorite: true, memo: 'メモ' });
    expect(b.data.settings.fontScale).toBe(1.1);
  });

  it('壊れたファイル・他アプリのファイル・不正な値を拒否する', () => {
    expect(() => parseBackup('{not json', DEFAULT_SETTINGS)).toThrow(BackupError);
    expect(() => parseBackup(JSON.stringify({ app: 'other', schema: 1, data: {} }), DEFAULT_SETTINGS)).toThrow(BackupError);
    expect(() => parseBackup(JSON.stringify({ app: 'fe-study', schema: 99, data: {} }), DEFAULT_SETTINGS)).toThrow(/バージョン/);
    const bad = makeBackup({ ...data, answers: [{ ...data.answers[0], qid: '<script>' }] }, '1');
    expect(() => parseBackup(JSON.stringify(bad), DEFAULT_SETTINGS)).toThrow(/問題ID/);
    const bad2 = makeBackup({ ...data, answers: [{ ...data.answers[0], mode: 'hack' as never }] }, '1');
    expect(() => parseBackup(JSON.stringify(bad2), DEFAULT_SETTINGS)).toThrow(/モード/);
  });

  it('範囲外の設定値は既定値に戻す', () => {
    const b = parseBackup(JSON.stringify(makeBackup({ ...data, settings: { ...DEFAULT_SETTINGS, fontScale: 99, theme: 'neon' as never } }, '1')), DEFAULT_SETTINGS);
    expect(b.data.settings.fontScale).toBe(DEFAULT_SETTINGS.fontScale);
    expect(b.data.settings.theme).toBe(DEFAULT_SETTINGS.theme);
  });
});
