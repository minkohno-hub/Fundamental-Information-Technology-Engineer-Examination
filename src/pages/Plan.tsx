import { useState } from 'react';
import { useApp, useStore } from '../app/context';
import { navigate } from '../app/router';
import { recommend, daysUntil } from '../lib/plan';
import type { StudyPlan } from '../types';

const EXP: { v: StudyPlan['experience']; label: string }[] = [
  { v: 'none', label: 'ITの学習は初めて' },
  { v: 'basic', label: 'ITパスポート程度の知識がある' },
  { v: 'some', label: 'プログラミングの経験が少しある' },
  { v: 'experienced', label: '実務・学習でプログラミング経験がある' },
];
const GOAL: { v: StudyPlan['goal']; label: string }[] = [
  { v: 'pass', label: 'まずは合格' },
  { v: 'high', label: '高得点で合格' },
  { v: 'review', label: '知識の復習・再確認' },
];

export default function Plan() {
  const { content } = useApp();
  const st = useStore();
  const p = st.settings.plan;
  const [experience, setExperience] = useState<StudyPlan['experience']>(p?.experience ?? 'basic');
  const [examDate, setExamDate] = useState(p?.examDate ?? '');
  const [dailyMinutes, setDailyMinutes] = useState(p?.dailyMinutes ?? 30);
  const [goal, setGoal] = useState<StudyPlan['goal']>(p?.goal ?? 'pass');
  const draft: StudyPlan = { experience, examDate: examDate || undefined, dailyMinutes, goal, createdAt: p?.createdAt ?? Date.now() };
  const rec = recommend(draft, content!.questions.length, Date.now());
  const days = daysUntil(draft.examDate, Date.now());

  return (
    <div className="stack">
      <h1 tabIndex={-1}>学習プラン</h1>
      <p className="small muted">すべて任意です。設定しなくても「今すぐ学習」からすぐに問題を解けます。</p>
      <form className="card" onSubmit={(e) => { e.preventDefault(); st.updateSettings({ plan: draft, onboarded: true }); navigate('/'); }}>
        <fieldset className="field" style={{ border: 0, padding: 0 }}>
          <legend className="label">これまでの学習経験</legend>
          {EXP.map((x) => (
            <label key={x.v} className="row"><input type="radio" name="exp" checked={experience === x.v} onChange={() => setExperience(x.v)} />{x.label}</label>
          ))}
        </fieldset>
        <div className="field">
          <label htmlFor="ed">受験予定日（未定なら空欄）</label>
          <input id="ed" type="date" value={examDate} onChange={(e) => setExamDate(e.target.value)} />
          {days !== null && <span className="small muted">{days >= 0 ? `あと${days}日` : '過去の日付です'}</span>}
        </div>
        <div className="field">
          <label htmlFor="dm">1日の学習時間：{dailyMinutes}分</label>
          <input id="dm" type="range" min={10} max={180} step={5} value={dailyMinutes} onChange={(e) => setDailyMinutes(Number(e.target.value))} />
        </div>
        <fieldset className="field" style={{ border: 0, padding: 0 }}>
          <legend className="label">学習目標</legend>
          <div className="segmented">
            {GOAL.map((g) => <button type="button" key={g.v} aria-pressed={goal === g.v} onClick={() => setGoal(g.v)}>{g.label}</button>)}
          </div>
        </fieldset>
        <div className="notice">
          <strong>提案</strong>
          <p className="small" style={{ margin: '4px 0' }}>「今すぐ学習」の出題配分：科目A {Math.round((1 - rec.ratioB) * 100)}%・科目B {Math.round(rec.ratioB * 100)}%（短時間で解ける問題）。1日の目安 約{rec.dailyQuestions}問。</p>
          <ol className="small" style={{ margin: 0, paddingLeft: '1.4em' }}>
            {rec.phases.map((ph) => <li key={ph.title}><strong>{ph.title}</strong>：{ph.detail}</li>)}
          </ol>
          {goal === 'high' && <p className="small" style={{ margin: '6px 0 0' }}>高得点を目指す場合は、全問を一巡したあと初見正答率の低い分野を重点的に強化し、模擬試験を複数回受けて解答時間も確認しましょう。</p>}
        </div>
        <div className="row" style={{ marginTop: 14 }}>
          <button type="submit" className="btn primary">この内容で保存</button>
          <button type="button" className="btn ghost" onClick={() => { st.updateSettings({ onboarded: true }); navigate('/'); }}>スキップ</button>
          {p && <button type="button" className="btn danger sm" onClick={() => st.updateSettings({ plan: undefined })}>プランを削除</button>}
        </div>
      </form>
    </div>
  );
}
