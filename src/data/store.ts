// 学習データの端末内保存（IndexedDB）。起動時に全件をメモリへ読み込み、変更は即時に書き込む。
// IndexedDB が使えない環境（一部のプライベートブラウズなど）ではメモリのみで動作し、その旨を画面に表示する。
import { openDB, type IDBPDatabase } from 'idb';
import type { AnswerRecord, ExamRecord, ProblemReport, QuestionState, SessionState, Settings, Understanding } from '../types';
import { cleanAnswer, cleanExam, cleanReport, cleanSession, cleanSettings, cleanState, MEMO_MAX, type BackupData } from '../lib/backup';
import type { Question } from '../types';

const DB_NAME = 'fe-study';
const DB_VERSION = 1;

export const DEFAULT_SETTINGS: Settings = {
  fontScale: 1,
  theme: 'system',
  reduceMotion: false,
  shuffleChoices: true,
  quickBInput: false,
  defaultCount: 10,
  onboarded: false,
};

type Listener = () => void;

export class Store {
  private db: IDBPDatabase | null = null;
  persistent = false;
  storageError: string | null = null;
  /** 読み込み時に形式が不正で無視した記録の件数（削除はしない） */
  ignoredRecords = 0;
  answers: AnswerRecord[] = [];
  states = new Map<string, QuestionState>();
  exams: ExamRecord[] = [];
  reports: ProblemReport[] = [];
  settings: Settings = { ...DEFAULT_SETTINGS };
  session: SessionState | null = null;
  private listeners = new Set<Listener>();
  private version = 0;

  subscribe = (l: Listener) => {
    this.listeners.add(l);
    return () => this.listeners.delete(l);
  };
  getVersion = () => this.version;
  private emit() {
    this.version++;
    for (const l of this.listeners) l();
  }

  async init(): Promise<void> {
    try {
      if (typeof indexedDB === 'undefined') throw new Error('IndexedDB が利用できません');
      this.db = await openDB(DB_NAME, DB_VERSION, {
        upgrade(db) {
          const a = db.createObjectStore('answers', { keyPath: 'id', autoIncrement: true });
          a.createIndex('qid', 'qid');
          db.createObjectStore('states', { keyPath: 'qid' });
          db.createObjectStore('exams', { keyPath: 'id' });
          db.createObjectStore('reports', { keyPath: 'id' });
          db.createObjectStore('kv');
        },
      });
      const [answers, states, exams, reports, settings, session] = await Promise.all([
        this.db.getAll('answers'),
        this.db.getAll('states'),
        this.db.getAll('exams'),
        this.db.getAll('reports'),
        this.db.get('kv', 'settings'),
        this.db.get('kv', 'session'),
      ]);
      this.ignoredRecords = 0;
      const keep = <T,>(rows: unknown[], f: (x: unknown, i: number) => T): T[] => {
        const out: T[] = [];
        rows.forEach((r, i) => {
          try { out.push(f(r, i)); } catch { this.ignoredRecords++; }
        });
        return out;
      };
      this.answers = (answers as unknown[]).flatMap((r, i) => {
        try {
          const a = cleanAnswer(r, i);
          const id = (r as { id?: unknown }).id;
          return [typeof id === 'number' ? { ...a, id } : a];
        } catch { this.ignoredRecords++; return []; }
      }).sort((a, b) => a.at - b.at);
      this.states = new Map(keep(states as unknown[], cleanState).map((s) => [s.qid, s]));
      this.exams = keep(exams as unknown[], cleanExam).sort((a, b) => a.startedAt - b.startedAt);
      this.reports = keep(reports as unknown[], cleanReport).sort((a, b) => b.createdAt - a.createdAt);
      try { this.settings = cleanSettings(settings ?? {}, DEFAULT_SETTINGS); } catch { this.settings = { ...DEFAULT_SETTINGS }; this.ignoredRecords++; }
      this.session = null;
      if (session !== undefined) {
        try { this.session = cleanSession(session); } catch { this.ignoredRecords++; }
      }
      this.persistent = true;
    } catch (e) {
      this.db = null;
      this.persistent = false;
      this.storageError = (e as Error).message || '端末内保存を開始できませんでした';
    }
    this.emit();
  }

  private async write(fn: (db: IDBPDatabase) => Promise<unknown>) {
    if (!this.db) return;
    try {
      await fn(this.db);
    } catch (e) {
      this.storageError = `保存に失敗しました: ${(e as Error).message}`;
      this.emit();
    }
  }

  /**
   * 教材の読み込み後に、保存済みの中断データ・模擬試験を現在の教材と突き合わせる。
   * 存在しない問題は中断データから外し、選択肢順が問題と合わないものは初期順に戻す。ユーザーの回答履歴などは変更しない。
   */
  reconcile(byId: Map<string, Question>) {
    const fixOrder = (o: number[] | undefined, q: Question) => {
      const n = q.choices.length;
      const ok = Array.isArray(o) && o.length === n && new Set(o).size === n && o.every((v) => Number.isInteger(v) && v >= 0 && v < n);
      return ok ? (o as number[]) : Array.from({ length: n }, (_, i) => i);
    };
    let changed = false;
    const s = this.session;
    if (s) {
      const idx = s.questionIds.map((id, i) => ({ id, i })).filter(({ id }) => byId.has(id));
      const bad = idx.length !== s.questionIds.length || idx.some(({ id, i }) => fixOrder(s.orders[i], byId.get(id)!) !== s.orders[i]);
      if (bad) {
        const next: SessionState = {
          ...s,
          questionIds: idx.map((k) => k.id),
          orders: idx.map((k) => fixOrder(s.orders[k.i], byId.get(k.id)!)),
          results: idx.map((k) => s.results[k.i]),
          chosen: idx.map((k) => s.chosen[k.i]),
          inputs: idx.map((k) => s.inputs[k.i]),
          hidden: idx.map((k) => s.hidden[k.i]),
          index: Math.min(s.index, idx.length),
        };
        this.saveSession(idx.length ? next : null);
        changed = true;
      }
    }
    for (const e of this.exams) {
      if (e.orders.every((o, i) => { const q = byId.get(e.questionIds[i]); return !q || fixOrder(o, q) === o; })) continue;
      this.saveExam({ ...e, orders: e.orders.map((o, i) => { const q = byId.get(e.questionIds[i]); return q ? fixOrder(o, q) : o; }) });
      changed = true;
    }
    return changed;
  }

  getState(qid: string): QuestionState {
    return this.states.get(qid) ?? { qid, attempts: 0, correctCount: 0 };
  }

  private putState(s: QuestionState) {
    this.states.set(s.qid, s);
    void this.write((db) => db.put('states', s));
  }

  /** 回答を記録する。初回回答かどうかはこの問題の過去の回答数で判定する */
  recordAnswer(rec: Omit<AnswerRecord, 'first' | 'id'>): AnswerRecord {
    const prev = this.getState(rec.qid);
    const first = prev.attempts === 0;
    const full: AnswerRecord = { ...rec, first };
    this.answers.push(full);
    void this.write(async (db) => {
      const id = await db.add('answers', { ...full });
      full.id = id as number;
    });
    this.putState({
      ...prev,
      attempts: prev.attempts + 1,
      correctCount: prev.correctCount + (rec.correct ? 1 : 0),
      firstCorrect: first ? rec.correct : prev.firstCorrect,
      lastCorrect: rec.correct,
      lastAt: rec.at,
    });
    this.emit();
    return full;
  }

  setUnderstanding(qid: string, u: Understanding | undefined) {
    this.putState({ ...this.getState(qid), understanding: u });
    this.emit();
  }
  toggleFavorite(qid: string) {
    const s = this.getState(qid);
    this.putState({ ...s, favorite: !s.favorite });
    this.emit();
  }
  toggleFlag(qid: string) {
    const s = this.getState(qid);
    this.putState({ ...s, flagged: !s.flagged });
    this.emit();
  }
  /** メモを保存する。上限（MEMO_MAX 文字）を超えて切り捨てた場合は true を返す */
  setMemo(qid: string, memo: string): boolean {
    this.putState({ ...this.getState(qid), memo: memo.slice(0, MEMO_MAX) || undefined });
    this.emit();
    return memo.length > MEMO_MAX;
  }

  updateSettings(patch: Partial<Settings>) {
    this.settings = { ...this.settings, ...patch };
    const s = this.settings;
    void this.write((db) => db.put('kv', s, 'settings'));
    this.emit();
  }

  saveSession(s: SessionState | null) {
    this.session = s;
    void this.write((db) => (s ? db.put('kv', s, 'session') : db.delete('kv', 'session')));
    this.emit();
  }

  saveExam(e: ExamRecord) {
    const i = this.exams.findIndex((x) => x.id === e.id);
    if (i >= 0) this.exams[i] = e;
    else this.exams.push(e);
    void this.write((db) => db.put('exams', e));
    this.emit();
  }
  deleteExam(id: string) {
    this.exams = this.exams.filter((e) => e.id !== id);
    void this.write((db) => db.delete('exams', id));
    this.emit();
  }

  addReport(r: ProblemReport) {
    this.reports.unshift(r);
    void this.write((db) => db.put('reports', r));
    this.emit();
  }
  deleteReport(id: string) {
    this.reports = this.reports.filter((r) => r.id !== id);
    void this.write((db) => db.delete('reports', id));
    this.emit();
  }

  exportData(): BackupData {
    return {
      answers: this.answers.map(({ id: _id, ...rest }) => rest),
      states: [...this.states.values()],
      exams: this.exams,
      settings: this.settings,
      reports: this.reports,
      session: this.session,
    };
  }

  /** インポート（既存データを置き換える） */
  async replaceAll(d: BackupData) {
    this.answers = d.answers.map((a) => ({ ...a }));
    this.states = new Map(d.states.map((s) => [s.qid, s]));
    this.exams = [...d.exams].sort((a, b) => a.startedAt - b.startedAt);
    this.reports = [...d.reports];
    this.settings = { ...DEFAULT_SETTINGS, ...d.settings };
    this.session = d.session ?? null;
    if (this.db) {
      const tx = this.db.transaction(['answers', 'states', 'exams', 'reports', 'kv'], 'readwrite');
      await Promise.all([
        tx.objectStore('answers').clear(),
        tx.objectStore('states').clear(),
        tx.objectStore('exams').clear(),
        tx.objectStore('reports').clear(),
        tx.objectStore('kv').clear(),
      ]);
      for (const a of this.answers) {
        const { id: _id, ...rest } = a;
        a.id = (await tx.objectStore('answers').add(rest)) as number;
      }
      for (const s of this.states.values()) await tx.objectStore('states').put(s);
      for (const e of this.exams) await tx.objectStore('exams').put(e);
      for (const r of this.reports) await tx.objectStore('reports').put(r);
      await tx.objectStore('kv').put(this.settings, 'settings');
      if (this.session) await tx.objectStore('kv').put(this.session, 'session');
      await tx.done;
    }
    this.emit();
  }

  async clearAll() {
    await this.replaceAll({ answers: [], states: [], exams: [], reports: [], settings: { ...DEFAULT_SETTINGS }, session: null });
  }

  answersToday(now = Date.now()): number {
    const d = new Date(now);
    const start = new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
    let n = 0;
    for (let i = this.answers.length - 1; i >= 0 && this.answers[i].at >= start; i--) n++;
    return n;
  }

  /** 直近に回答した問題 ID（新しい順・重複なし） */
  recentIds(limit = 30): string[] {
    const out: string[] = [];
    const seen = new Set<string>();
    for (let i = this.answers.length - 1; i >= 0 && out.length < limit; i--) {
      const id = this.answers[i].qid;
      if (!seen.has(id)) { seen.add(id); out.push(id); }
    }
    return out;
  }
}

export const store = new Store();
