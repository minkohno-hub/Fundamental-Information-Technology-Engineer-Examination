// アプリ全体で共有するデータ型。問題データのスキーマは tools/build-content.mjs の検証と一致させること。

export type Subject = 'A' | 'B';
/** quick: 通常の短時間演習向け / deep: 計算・プログラム読解などの深掘り演習向け */
export type Depth = 'quick' | 'deep';
export type QuestionType = 'choice' | 'input';
export type Difficulty = 1 | 2 | 3;
export type SourceKind = 'ipa' | 'original' | 'thirdParty';
export type VerificationStatus = 'draft' | 'checking' | 'verified' | 'rejected';

export interface Source {
  kind: SourceKind;
  /** 資料名（IPA問題は「出典：令和8年度 基本情報技術者試験 科目A 公開問題 問1」の形式） */
  title: string;
  url?: string;
  year?: number;
  terms: string;
  termsCheckedAt: string;
  modified: boolean;
  modificationNote?: string;
  /** 解説の根拠資料 */
  references?: string[];
}

export interface Question {
  id: string;
  syllabusVersion: string;
  subject: Subject;
  depth: Depth;
  /** 中分類番号（科目Bは 'B-ALG' / 'B-SEC'） */
  category: string;
  /** 小分類キー（例: '11-1'） */
  subcategory: string;
  topicIds: string[];
  questionType: QuestionType;
  difficulty: Difficulty;
  questionText: string;
  /** 擬似言語プログラム（任意） */
  code?: string;
  choices: string[];
  /** choices の添字（0始まり） */
  correctAnswer: number;
  /** 入力式で許容する解答（正規化後に比較） */
  acceptedInputs?: string[];
  explanation: string;
  choiceExplanations: string[];
  /** 解答に必要な基礎知識・関連知識・似た概念との違い */
  knowledge?: string;
  relatedConcepts: string[];
  relatedQuestionIds: string[];
  /** 選択肢の順番に意味がある問題はシャッフルしない */
  noShuffle?: boolean;
  /** 実行シミュレーター用の設定（検証済みのもののみ） */
  simulation?: SimulationSpec;
  source: Source;
  licenseStatus: 'ipa-public-permitted' | 'original' | 'permitted';
  verificationStatus: VerificationStatus;
  contentVersion: number;
}

export interface SimulationSpec {
  /** 実行するプログラム（空欄を正解で埋めたもの） */
  program: string;
  /** 最初に呼び出す手続・関数（省略時はトップレベルを実行） */
  entry?: string;
  args?: unknown[];
  /** 実行オプション（クラス定義など） */
  options?: { classes?: Record<string, { fields: string[]; ctor: string[] }>; bitLiterals?: boolean };
  note?: string;
}

export interface SyllabusItem {
  id: string;
  no: number;
  name: string;
  desc: string;
  terms: string[];
  children?: SyllabusItem[];
}
export interface SyllabusSub {
  id: string;
  no: number;
  name: string;
  goals: string[];
  items: SyllabusItem[];
}
export interface SyllabusMiddle {
  no: number;
  name: string;
  subs: SyllabusSub[];
}
export interface SyllabusMajor {
  no: number;
  name: string;
  field: string;
  middles: SyllabusMiddle[];
}
export interface Syllabus {
  title: string;
  version: string;
  source: string;
  publisher: string;
  published: string;
  majors: SyllabusMajor[];
}

export interface GlossaryTerm {
  id: string;
  term: string;
  reading?: string;
  /** 略語の場合の正式名称 */
  fullName?: string;
  /** 正式名称の自然な日本語訳 */
  japanese?: string;
  /** 英単語ごとの意味 */
  words?: { en: string; ja: string }[];
  /** 初心者向け説明 */
  simple: string;
  /** 正確な定義 */
  definition: string;
  example?: string;
  difference?: string;
  related: string[];
  category: string;
  questionIds?: string[];
}

export interface ReferenceChapter {
  id: string;
  title: string;
  categories: string[];
  sections: { title: string; body: string }[];
}

export interface Lesson {
  id: string;
  order: number;
  title: string;
  body: string;
  /** 動作例として表示する擬似言語プログラム */
  example?: string;
  questionIds: string[];
}

export interface ContentManifest {
  version: string;
  builtAt: string;
  syllabusVersion: string;
  counts: { total: number; A: number; B: number };
  files: { name: string; path: string; bytes: number; kind: string }[];
}

// ===== 学習データ（端末内に保存） =====

export type Understanding = 'understood' | 'review' | 'notUnderstood';

export interface AnswerRecord {
  id?: number;
  qid: string;
  at: number;
  correct: boolean;
  /** 選んだ元の選択肢番号（シャッフル前の添字） */
  chosen: number;
  timeMs: number;
  /** その問題への初回回答か */
  first: boolean;
  mode: 'practice' | 'exam' | 'review' | 'quickB' | 'deep' | 'lesson';
}

export interface QuestionState {
  qid: string;
  attempts: number;
  correctCount: number;
  firstCorrect?: boolean;
  lastCorrect?: boolean;
  lastAt?: number;
  understanding?: Understanding;
  favorite?: boolean;
  flagged?: boolean;
  memo?: string;
}

export interface ExamRecord {
  id: string;
  kind: 'A' | 'B';
  format: 'real' | 'practice' | 'short' | 'untimed';
  startedAt: number;
  finishedAt?: number;
  timeLimitSec?: number;
  questionIds: string[];
  answers: (number | null)[];
  flags: boolean[];
  timePerQuestionMs: number[];
  /** シャッフル後の表示順（questionIds と同じ長さ、各要素は元の選択肢番号の並び） */
  orders: number[][];
  elapsedMs: number;
  status: 'inProgress' | 'finished';
}

export interface Settings {
  fontScale: number;
  theme: 'system' | 'light' | 'dark';
  reduceMotion: boolean;
  shuffleChoices: boolean;
  quickBInput: boolean;
  defaultCount: number;
  onboarded: boolean;
  plan?: StudyPlan;
}

export interface StudyPlan {
  experience: 'none' | 'basic' | 'some' | 'experienced';
  examDate?: string;
  dailyMinutes: number;
  goal: 'pass' | 'high' | 'review';
  createdAt: number;
}

export interface ProblemReport {
  id: string;
  qid: string;
  questionSubject: string;
  kind: 'answer' | 'explanation' | 'question' | 'typo' | 'other';
  detail: string;
  appVersion: string;
  contentVersion: string;
  createdAt: number;
}

export interface SessionState {
  id: string;
  mode: AnswerRecord['mode'];
  title: string;
  questionIds: string[];
  index: number;
  orders: number[][];
  results: (boolean | null)[];
  /** 選んだ選択肢（元の添字）。入力式で不正解のときは -1 */
  chosen: (number | null)[];
  inputs: (string | null)[];
  createdAt: number;
  hidden: number[][];
}
