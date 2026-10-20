import { useState } from 'react';
import { useApp, useStore } from '../app/context';
import { Link } from '../app/router';
import { startSession } from '../app/session';
import { scoreExam } from '../lib/stats';
import { QuestionBody, QuestionHeader, LETTERS } from '../components/QuestionCard';
import { Explanation } from '../components/Explanation';
import { RichText } from '../components/RichText';
import type { Question } from '../types';
import { examTitle } from './ExamSetup';

export default function ExamResult({ id }: { id: string }) {
  const { content, categoryName } = useApp();
  const st = useStore();
  const [open, setOpen] = useState<number | null>(null);
  const [filter, setFilter] = useState<'all' | 'wrong' | 'flagged'>('all');
  const exam = st.exams.find((e) => e.id === id);
  if (!exam || !content) return <div className="card"><h1 tabIndex={-1}>結果が見つかりません</h1><Link to="/exam">模擬試験へ</Link></div>;
  const s = scoreExam(exam, content.byId);
  const past = st.exams.filter((e) => e.status === 'finished' && e.kind === exam.kind && e.id !== exam.id && e.startedAt < exam.startedAt);
  const prev = past.length ? scoreExam(past[past.length - 1], content.byId) : null;
  const trend = [...past.slice(-9), exam].map((e) => ({ e, s: scoreExam(e, content.byId) }));
  const weakCats = s.byCategory.filter((c) => c.total >= 2 && c.correct / c.total < 0.6).sort((a, b) => a.correct / a.total - b.correct / b.total);
  const reviewQs = [...s.wrongIds, ...s.unansweredIds].map((x) => content.byId.get(x)).filter(Boolean) as Question[];
  const flaggedQs = s.flaggedIds.map((x) => content.byId.get(x)).filter(Boolean) as Question[];
  const avg = exam.timePerQuestionMs.length ? exam.timePerQuestionMs.reduce((a, b) => a + b, 0) / exam.timePerQuestionMs.length : 0;

  const rows = exam.questionIds.map((qid, i) => ({ qid, i, q: content.byId.get(qid) })).filter((r) => r.q && (
    filter === 'all' || (filter === 'wrong' && exam.answers[r.i] !== r.q.correctAnswer) || (filter === 'flagged' && exam.flags[r.i])));

  return (
    <div className="stack">
      <h1 tabIndex={-1}>{examTitle(exam.kind, exam.format)}の結果</h1>
      <div className="card">
        <div className="grid three">
          <div className="stat"><span className="v">{s.correct} / {s.total}</span><span className="k">正答数</span></div>
          <div className="stat"><span className="v">{Math.round(s.rate * 100)}%</span><span className="k">正答率</span>
            {prev && <span className="sub">前回 {Math.round(prev.rate * 100)}%（{s.rate >= prev.rate ? '+' : ''}{Math.round((s.rate - prev.rate) * 100)}pt）</span>}</div>
          <div className="stat"><span className="v">{Math.round(exam.elapsedMs / 60000)}分</span><span className="k">解答時間</span><span className="sub">1問平均 {Math.round(avg / 1000)}秒</span></div>
          <div className="stat"><span className="v">{s.total - s.answered}</span><span className="k">未解答</span></div>
        </div>
        <p className="xsmall muted" style={{ marginTop: 12, marginBottom: 0 }}>本アプリの単純な正答数による集計です。本試験は IRT により評価点（1,000点満点、基準点600点）を算出するため、この結果から本試験の得点や合否は判断できません。</p>
      </div>

      {trend.length > 1 && (
        <div className="card">
          <h2>過去の科目{exam.kind}模擬試験との比較</h2>
          <div className="bar-chart">
            {trend.map(({ e, s: ts }) => (
              <div className="bar-row" key={e.id}>
                <span className="small">{new Date(e.startedAt).toLocaleDateString('ja-JP')}{e.id === exam.id ? '（今回）' : ''}</span>
                <span className="bar"><span style={{ width: `${ts.rate * 100}%` }} /></span>
                <span className="num">{Math.round(ts.rate * 100)}%</span>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="card">
        <h2>分野別の成績</h2>
        <div className="bar-chart">
          {s.byCategory.map((c) => (
            <div className="bar-row" key={c.category}>
              <span className="small">{categoryName(c.category)}</span>
              <span className="bar"><span className={c.correct / c.total < 0.6 ? 'low' : undefined} style={{ width: `${(c.correct / c.total) * 100}%` }} /></span>
              <span className="num">{c.correct}/{c.total}</span>
            </div>
          ))}
        </div>
        {weakCats.length > 0 && <p className="small" style={{ marginTop: 12 }}>苦手分野（2問以上出題・正答率60%未満）：{weakCats.map((c) => categoryName(c.category)).join('、')}</p>}
      </div>

      <div className="grid two">
        <button className="btn primary lg" disabled={!reviewQs.length} onClick={() => startSession('review', `模擬試験の復習（${reviewQs.length}問）`, reviewQs)}>
          間違えた・未解答の問題を復習（{reviewQs.length}問）
        </button>
        <button className="btn lg" disabled={!flaggedQs.length} onClick={() => startSession('review', '見直しフラグの問題', flaggedQs)}>見直しフラグの問題（{flaggedQs.length}問）</button>
      </div>

      <div className="card">
        <div className="row between">
          <h2 style={{ margin: 0 }}>解答の確認</h2>
          <div className="segmented" role="group" aria-label="絞り込み">
            <button aria-pressed={filter === 'all'} onClick={() => setFilter('all')}>すべて</button>
            <button aria-pressed={filter === 'wrong'} onClick={() => setFilter('wrong')}>不正解</button>
            <button aria-pressed={filter === 'flagged'} onClick={() => setFilter('flagged')}>見直し</button>
          </div>
        </div>
        <ul className="list">
          {rows.map(({ qid, i, q }) => {
            const a = exam.answers[i];
            const ok = a === q!.correctAnswer;
            const order = exam.orders[i];
            return (
              <li key={qid}>
                <button className="item" style={{ width: '100%', background: 'none', border: 0, textAlign: 'left', cursor: 'pointer' }} aria-expanded={open === i} onClick={() => setOpen(open === i ? null : i)}>
                  <span className={ok ? 'tag ok' : 'tag ng'}>{ok ? '正解' : a === null ? '未解答' : '不正解'}</span>
                  <span className="grow small">問{i + 1}　{categoryName(q!.category)}{exam.flags[i] ? '（見直し）' : ''}</span>
                  <span className="small muted">あなた：{a === null ? '—' : LETTERS[order.indexOf(a)]}／正解：{LETTERS[order.indexOf(q!.correctAnswer)]}</span>
                </button>
                {open === i && (
                  <div style={{ padding: '4px 0 16px' }}>
                    <QuestionHeader q={q!} />
                    <QuestionBody q={q!} />
                    <ol className="small" type="1" style={{ listStyle: 'none', paddingLeft: 0 }}>
                      {order.map((orig, k) => <li key={orig}><strong>{LETTERS[k]}</strong> <RichText text={q!.choices[orig]} /></li>)}
                    </ol>
                    <Explanation q={q!} order={order} chosen={a ?? undefined} />
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      </div>
      <Link to="/exam" className="btn">模擬試験のトップへ</Link>
    </div>
  );
}
