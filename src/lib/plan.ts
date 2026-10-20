// 学習プランの提案。計算の前提（1問あたりの所要時間など）を明示した単純なルールで提案する。
import type { StudyPlan } from '../types';
import type { Analytics } from './stats';

/** 1問あたりの目安時間（分）：解答＋解説を読む時間 */
export const MINUTES_PER_QUICK = 2;
export const MINUTES_PER_DEEP = 6;

export function daysUntil(date: string | undefined, now: number): number | null {
  if (!date) return null;
  const [y, m, d] = date.split('-').map(Number);
  const target = new Date(y, m - 1, d).getTime();
  const today = new Date(now);
  const t0 = new Date(today.getFullYear(), today.getMonth(), today.getDate()).getTime();
  return Math.round((target - t0) / 86400000);
}

/** 科目Bの出題比率（プログラミング経験が少ないほど科目Aを多めにして慣らす）。未設定時は 0.3 */
export function ratioB(plan: StudyPlan | undefined): number {
  if (!plan) return 0.3;
  return plan.experience === 'none' ? 0.2 : plan.experience === 'basic' ? 0.3 : 0.4;
}

export interface PlanRecommendation {
  ratioB: number;
  phases: { title: string; detail: string }[];
  dailyQuestions: number;
}

export function recommend(plan: StudyPlan, totalQuestions: number, now: number): PlanRecommendation {
  const days = daysUntil(plan.examDate, now);
  const dailyQuestions = Math.max(5, Math.floor(plan.dailyMinutes / MINUTES_PER_QUICK));
  const phases: PlanRecommendation['phases'] = [];
  if (plan.experience === 'none' || plan.experience === 'basic') {
    phases.push({ title: 'プログラミング講座で擬似言語の基礎を固める', detail: '変数・条件分岐・繰返し・配列の講座を先に終えると、科目Bの問題が読みやすくなります。' });
  }
  phases.push({ title: '全分野を一巡する', detail: `「今すぐ学習」で未回答の問題を中心に解きます（全${totalQuestions}問）。1日${dailyQuestions}問が目安です。` });
  phases.push({ title: '苦手分野と科目Bを強化する', detail: '分析画面の苦手分野から「苦手分野優先」で出題し、科目Bの「計算・プログラム読解」でトレースに慣れます。' });
  phases.push({ title: '模擬試験で時間配分を確認する', detail: '科目A（60問90分）と科目B（20問100分）を本番形式で解き、間違えた問題の復習セットを解き直します。' });
  if (days !== null && days < 14) phases.unshift({ title: '直前期：模擬試験と復習を優先', detail: '新しい問題よりも、間違えた問題・理解度が低い問題の復習と模擬試験を優先しましょう。' });
  return { ratioB: ratioB(plan), phases, dailyQuestions };
}

export function planAdvice(plan: StudyPlan, a: Analytics, now: number): { headline: string; detail: string } {
  const days = daysUntil(plan.examDate, now);
  const daily = Math.max(5, Math.floor(plan.dailyMinutes / MINUTES_PER_QUICK));
  if (days !== null && days < 0) {
    return { headline: '受験予定日を過ぎています。', detail: '学習プランの画面で受験予定日を更新できます。' };
  }
  if (days !== null && days <= 14) {
    return {
      headline: `受験まであと${days}日。模擬試験と復習を中心に進めましょう。`,
      detail: `未回答の問題は残り${a.unanswered}問です。復習と模擬試験を優先し、余力があれば未回答の問題に取り組みます。`,
    };
  }
  if (days !== null) {
    const perDay = Math.ceil(a.unanswered / Math.max(1, days - 14));
    return {
      headline: `受験まであと${days}日。今日は${Math.max(daily, Math.min(perDay, daily * 2))}問を目安に。`,
      detail: `直前2週間を復習と模擬試験にあてる場合、未回答の${a.unanswered}問を終えるには1日あたり約${perDay}問が必要です（1問${MINUTES_PER_QUICK}分で計算すると1日の学習時間${plan.dailyMinutes}分では約${daily}問）。`,
    };
  }
  return { headline: `今日は${daily}問を目安に学習しましょう。`, detail: `1日の学習時間${plan.dailyMinutes}分、1問あたり約${MINUTES_PER_QUICK}分（解説を読む時間を含む）で計算しています。` };
}
