// 学習分析。保存された実データ（回答履歴・問題ごとの状態）だけから計算する。
import type { AnswerRecord, ExamRecord, Question } from '../types';

export interface Rate { correct: number; total: number; rate: number | null }
const rate = (correct: number, total: number): Rate => ({ correct, total, rate: total ? correct / total : null });

export interface CategoryStat {
  category: string;
  questions: number;
  answeredQuestions: number;
  first: Rate;
  all: Rate;
}

export interface Analytics {
  totalAnswers: number;
  first: Rate;
  all: Rate;
  review: Rate;
  unanswered: number;
  answeredQuestions: number;
  bySubject: Record<'A' | 'B', { first: Rate; all: Rate; unanswered: number; questions: number }>;
  byCategory: CategoryStat[];
  weakCategories: CategoryStat[];
  studyDays: number;
  streak: number;
  daily: { date: string; answers: number; correct: number }[];
  topicCoverage: { studied: number; total: number };
}

export function localDate(ts: number): string {
  const d = new Date(ts);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/** 連続学習日数：今日（または昨日）から遡って学習した日が連続している日数 */
export function computeStreak(dates: Set<string>, now: number): number {
  let d = new Date(now);
  if (!dates.has(localDate(d.getTime()))) {
    d = new Date(d.getFullYear(), d.getMonth(), d.getDate() - 1);
    if (!dates.has(localDate(d.getTime()))) return 0;
  }
  let n = 0;
  while (dates.has(localDate(d.getTime()))) {
    n++;
    d = new Date(d.getFullYear(), d.getMonth(), d.getDate() - 1);
  }
  return n;
}

export function computeAnalytics(
  questions: Question[],
  answers: AnswerRecord[],
  now: number,
  leafTopicTotal: number,
): Analytics {
  const qById = new Map(questions.map((q) => [q.id, q]));
  const valid = answers.filter((a) => qById.has(a.qid));
  const first = valid.filter((a) => a.first);
  const later = valid.filter((a) => !a.first);
  const answeredIds = new Set(valid.map((a) => a.qid));

  const subj = (s: 'A' | 'B') => {
    const qs = questions.filter((q) => q.subject === s);
    const ids = new Set(qs.map((q) => q.id));
    const fa = first.filter((a) => ids.has(a.qid));
    const aa = valid.filter((a) => ids.has(a.qid));
    return {
      first: rate(fa.filter((a) => a.correct).length, fa.length),
      all: rate(aa.filter((a) => a.correct).length, aa.length),
      unanswered: qs.filter((q) => !answeredIds.has(q.id)).length,
      questions: qs.length,
    };
  };

  const cats = new Map<string, CategoryStat>();
  for (const q of questions) {
    if (!cats.has(q.category)) {
      cats.set(q.category, { category: q.category, questions: 0, answeredQuestions: 0, first: rate(0, 0), all: rate(0, 0) });
    }
    const c = cats.get(q.category)!;
    c.questions++;
    if (answeredIds.has(q.id)) c.answeredQuestions++;
  }
  for (const a of valid) {
    const c = cats.get(qById.get(a.qid)!.category)!;
    c.all = rate(c.all.correct + (a.correct ? 1 : 0), c.all.total + 1);
    if (a.first) c.first = rate(c.first.correct + (a.correct ? 1 : 0), c.first.total + 1);
  }
  const byCategory = [...cats.values()];
  // 苦手分野：5回以上回答し、全回答の正答率が 60% 未満の分野（正答率の低い順）
  const weakCategories = byCategory
    .filter((c) => c.all.total >= 5 && (c.all.rate ?? 1) < 0.6)
    .sort((a, b) => (a.all.rate ?? 0) - (b.all.rate ?? 0));

  const dates = new Set(valid.map((a) => localDate(a.at)));
  const daily: Analytics['daily'] = [];
  for (let i = 29; i >= 0; i--) {
    const d = new Date(now);
    const day = localDate(new Date(d.getFullYear(), d.getMonth(), d.getDate() - i).getTime());
    const list = valid.filter((a) => localDate(a.at) === day);
    daily.push({ date: day, answers: list.length, correct: list.filter((a) => a.correct).length });
  }

  const studiedTopics = new Set<string>();
  for (const id of answeredIds) for (const t of qById.get(id)!.topicIds) if (!t.startsWith('B')) studiedTopics.add(t);

  return {
    totalAnswers: valid.length,
    first: rate(first.filter((a) => a.correct).length, first.length),
    all: rate(valid.filter((a) => a.correct).length, valid.length),
    review: rate(later.filter((a) => a.correct).length, later.length),
    unanswered: questions.filter((q) => !answeredIds.has(q.id)).length,
    answeredQuestions: answeredIds.size,
    bySubject: { A: subj('A'), B: subj('B') },
    byCategory,
    weakCategories,
    studyDays: dates.size,
    streak: computeStreak(dates, now),
    daily,
    topicCoverage: { studied: Math.min(studiedTopics.size, leafTopicTotal), total: leafTopicTotal },
  };
}

export interface ExamScore {
  correct: number;
  total: number;
  answered: number;
  rate: number;
  byCategory: { category: string; correct: number; total: number }[];
  wrongIds: string[];
  flaggedIds: string[];
  unansweredIds: string[];
  timeMs: number;
}

export function scoreExam(exam: ExamRecord, qById: Map<string, Question>): ExamScore {
  const cat = new Map<string, { correct: number; total: number }>();
  let correct = 0;
  let answered = 0;
  const wrongIds: string[] = [];
  const unansweredIds: string[] = [];
  exam.questionIds.forEach((id, i) => {
    const q = qById.get(id);
    if (!q) return;
    const a = exam.answers[i];
    const ok = a !== null && a === q.correctAnswer;
    if (a !== null) answered++;
    if (ok) correct++;
    else if (a === null) unansweredIds.push(id);
    else wrongIds.push(id);
    const k = q.category;
    if (!cat.has(k)) cat.set(k, { correct: 0, total: 0 });
    const c = cat.get(k)!;
    c.total++;
    if (ok) c.correct++;
  });
  const total = exam.questionIds.length;
  return {
    correct,
    total,
    answered,
    rate: total ? correct / total : 0,
    byCategory: [...cat.entries()].map(([category, v]) => ({ category, ...v })),
    wrongIds,
    flaggedIds: exam.questionIds.filter((_, i) => exam.flags[i]),
    unansweredIds,
    timeMs: exam.elapsedMs,
  };
}
