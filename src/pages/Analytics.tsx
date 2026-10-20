import { useMemo } from 'react';
import { useApp, useStore } from '../app/context';
import { Link } from '../app/router';
import { computeAnalytics, scoreExam, type Rate } from '../lib/stats';
import { pick, startSession } from '../app/session';

const pct = (r: Rate) => (r.rate === null ? '—' : `${Math.round(r.rate * 100)}%`);

export default function Analytics() {
  const { content, categoryName } = useApp();
  const st = useStore();
  const a = useMemo(() => computeAnalytics(content!.questions, st.answers, Date.now(), content!.coverage.leafTotal), [content, st.answers.length]); // eslint-disable-line react-hooks/exhaustive-deps
  const maxDaily = Math.max(1, ...a.daily.map((d) => d.answers));
  const exams = st.exams.filter((e) => e.status === 'finished');
  const cats = [...a.byCategory].sort((x, y) => (x.category.startsWith('B') ? 100 : Number(x.category)) - (y.category.startsWith('B') ? 100 : Number(y.category)));

  return (
    <div className="stack">
      <h1 tabIndex={-1}>学習分析</h1>
      {a.totalAnswers === 0 && <div className="notice">まだ回答の記録がありません。問題を解くと、ここに実際の回答データから計算した分析が表示されます。</div>}
      <div className="card">
        <div className="grid three">
          <div className="stat"><span className="v">{a.totalAnswers}</span><span className="k">総回答数</span></div>
          <div className="stat"><span className="v">{pct(a.first)}</span><span className="k">初見正答率</span><span className="sub">初めて解いたときの正答率（{a.first.total}問）</span></div>
          <div className="stat"><span className="v">{pct(a.all)}</span><span className="k">全回答の正答率</span><span className="sub">解き直しを含む</span></div>
          <div className="stat"><span className="v">{pct(a.review)}</span><span className="k">復習時の正答率</span><span className="sub">2回目以降の回答（{a.review.total}回）</span></div>
          <div className="stat"><span className="v">{a.unanswered}</span><span className="k">未回答問題</span><span className="sub">全{content!.questions.length}問</span></div>
          <div className="stat"><span className="v">{a.studyDays}日</span><span className="k">学習日数</span><span className="sub">連続 {a.streak}日</span></div>
        </div>
        <p className="xsmall muted" style={{ marginTop: 12, marginBottom: 0 }}>
          初見正答率は、同じ問題を繰り返して正答率が上がる影響を除いた「初めて見た問題を解く力」の目安です。合格可能性の予測は表示していません。
        </p>
      </div>

      <div className="grid two">
        {(['A', 'B'] as const).map((s) => (
          <div className="card" key={s}>
            <h2>科目{s}</h2>
            <p className="small" style={{ margin: 0 }}>初見正答率 <strong>{pct(a.bySubject[s].first)}</strong>／全回答 {pct(a.bySubject[s].all)}</p>
            <p className="small muted" style={{ margin: 0 }}>未回答 {a.bySubject[s].unanswered} / {a.bySubject[s].questions}問</p>
          </div>
        ))}
      </div>

      <div className="card">
        <h2>学習の推移（直近30日の回答数）</h2>
        <div className="spark" role="img" aria-label={`直近30日の回答数。最大 ${maxDaily} 問`}>
          {a.daily.map((d) => <span key={d.date} className={d.answers ? undefined : 'zero'} style={{ height: `${(d.answers / maxDaily) * 100}%` }} title={`${d.date}：${d.answers}問（正解${d.correct}）`} />)}
        </div>
        <div className="row between xsmall muted"><span>{a.daily[0].date}</span><span>今日</span></div>
      </div>

      <div className="card">
        <div className="row between">
          <h2 style={{ margin: 0 }}>分野別の正答率</h2>
          <span className="xsmall muted">棒：全回答の正答率／右：初見正答率</span>
        </div>
        <div className="bar-chart" style={{ marginTop: 12 }}>
          {cats.map((c) => (
            <div className="bar-row" key={c.category}>
              <span className="small">{categoryName(c.category)}<br /><span className="xsmall muted">{c.answeredQuestions}/{c.questions}問 回答</span></span>
              <span className="bar"><span className={(c.all.rate ?? 1) < 0.6 ? 'low' : undefined} style={{ width: `${(c.all.rate ?? 0) * 100}%` }} /></span>
              <span className="num">{pct(c.first)}</span>
            </div>
          ))}
        </div>
      </div>

      <div className="card">
        <h2>苦手分野</h2>
        {a.weakCategories.length === 0 ? (
          <p className="small muted">現在、苦手分野（5回以上回答し正答率60%未満の分野）はありません。</p>
        ) : (
          <ul className="list">
            {a.weakCategories.map((c) => (
              <li key={c.category} className="item">
                <span className="grow">{categoryName(c.category)}<br /><span className="small muted">正答率 {pct(c.all)}（{c.all.total}回）</span></span>
                <button className="btn sm primary" onClick={() => startSession('practice', `${categoryName(c.category)}の強化`, pick(content!.questions.filter((q) => q.category === c.category), 'standard', 10))}>10問解く</button>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="card">
        <h2>シラバス網羅率</h2>
        <p className="small">あなたが問題を解いた学習論点：<strong>{a.topicCoverage.studied}</strong> / {a.topicCoverage.total}（{Math.round((a.topicCoverage.studied / a.topicCoverage.total) * 100)}%）</p>
        <div className="progress"><span style={{ width: `${(a.topicCoverage.studied / a.topicCoverage.total) * 100}%` }} /></div>
        <p className="xsmall muted">シラバス Ver.{content!.syllabus.version} の末端の学習論点（{a.topicCoverage.total}個）のうち、関連する問題を1問以上解いた論点の割合です。<Link to="/coverage">論点ごとの収録状況</Link></p>
      </div>

      <div className="card">
        <h2>模擬試験の成績推移</h2>
        {exams.length === 0 ? <p className="small muted">まだ受験していません。<Link to="/exam">模擬試験へ</Link></p> : (
          <div className="bar-chart">
            {exams.slice(-12).map((e) => {
              const s = scoreExam(e, content!.byId);
              return (
                <div className="bar-row" key={e.id}>
                  <Link to={`/exam/result/${e.id}`} className="small">科目{e.kind} {new Date(e.startedAt).toLocaleDateString('ja-JP')}</Link>
                  <span className="bar"><span style={{ width: `${s.rate * 100}%` }} /></span>
                  <span className="num">{Math.round(s.rate * 100)}%</span>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
