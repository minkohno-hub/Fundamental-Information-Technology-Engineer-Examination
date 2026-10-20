import { useState } from 'react';
import { useApp, useStore } from '../app/context';
import { Link, navigate } from '../app/router';
import { composeExam, createExamRecord, examPlan, EXAM_SPEC, type ExamFormat } from '../lib/exam';
import { mulberry32, randomSeed } from '../lib/rng';
import { scoreExam } from '../lib/stats';

const FORMATS: { v: ExamFormat; label: string; desc: string }[] = [
  { v: 'real', label: '本番形式', desc: '本番と同じ問題数・試験時間。開始後は時計が止まらず（画面を閉じても経過）、終了後に一括採点します。' },
  { v: 'practice', label: '練習形式', desc: '本番と同じ問題数・時間。一時停止と再開ができます。' },
  { v: 'short', label: '短縮版', desc: '問題数と時間を本番の約3分の1にした版。すき間時間に。' },
  { v: 'untimed', label: '時間無制限', desc: '本番と同じ問題数で、時間を気にせず解きます。' },
];

export function examTitle(kind: 'A' | 'B', format: ExamFormat) {
  return `科目${kind} ${FORMATS.find((f) => f.v === format)?.label ?? ''}`;
}

export default function ExamSetup() {
  const { content } = useApp();
  const st = useStore();
  const [kind, setKind] = useState<'A' | 'B'>('A');
  const [format, setFormat] = useState<ExamFormat>('real');
  const inProgress = st.exams.find((e) => e.status === 'inProgress');
  const plan = examPlan(kind, format);

  const weights = () => {
    // 科目Aの分野配分：シラバスの末端論点数に比例（IPA は分野別出題数を公表していないため本アプリ独自の方針）
    return new Map(content!.coverage.middles.map((m) => [m.no, m.leafTotal]));
  };
  const available = kind === 'A'
    ? content!.questions.filter((q) => q.subject === 'A').length
    : content!.questions.filter((q) => q.subject === 'B' && q.depth === 'deep').length;

  const start = () => {
    if (inProgress && !confirm('実施中の模擬試験があります。中止して新しく始めますか？（実施中の試験は削除されます）')) return;
    if (inProgress) st.deleteExam(inProgress.id);
    const rand = mulberry32(randomSeed());
    const qs = composeExam(plan, content!.questions, weights(), rand);
    if (qs.length < plan.count) {
      alert(`問題が不足しています（${qs.length}/${plan.count}問）`);
      return;
    }
    st.saveExam(createExamRecord(plan, qs, st.settings.shuffleChoices, rand, Date.now()));
    navigate('/exam/run');
  };

  const history = [...st.exams].filter((e) => e.status === 'finished').reverse();
  return (
    <div className="stack">
      <h1 tabIndex={-1}>模擬試験</h1>
      {inProgress && (
        <div className="notice warn row between">
          <span>実施中の模擬試験があります（{examTitle(inProgress.kind, inProgress.format)}）。</span>
          <button className="btn sm primary" onClick={() => navigate('/exam/run')}>再開する</button>
        </div>
      )}
      <div className="card">
        <div className="field">
          <span className="label">科目</span>
          <div className="segmented" role="group" aria-label="科目">
            <button aria-pressed={kind === 'A'} onClick={() => setKind('A')}>科目A（{EXAM_SPEC.A.count}問・{EXAM_SPEC.A.minutes}分）</button>
            <button aria-pressed={kind === 'B'} onClick={() => setKind('B')}>科目B（{EXAM_SPEC.B.count}問・{EXAM_SPEC.B.minutes}分）</button>
          </div>
        </div>
        <div className="field">
          <span className="label">形式</span>
          <div className="stack">
            {FORMATS.map((f) => (
              <label key={f.v} className="row" style={{ alignItems: 'flex-start', gap: 10 }}>
                <input type="radio" name="fmt" checked={format === f.v} onChange={() => setFormat(f.v)} style={{ marginTop: 7 }} />
                <span><strong>{f.label}</strong><br /><span className="small muted">{f.desc}</span></span>
              </label>
            ))}
          </div>
        </div>
        <p className="small">この設定：{plan.count}問／{plan.minutes ? `${plan.minutes}分` : '時間無制限'}（出題対象 {available}問から選択）</p>
        <button className="btn primary lg block" onClick={start}>試験を開始する</button>
        <div className="notice small" style={{ marginTop: 12 }}>
          {kind === 'A'
            ? '科目Aは四肢択一です。本アプリでは分野ごとの出題数をシラバスの論点数に比例させて配分しています（IPA は科目Aの分野別出題数を公表していません）。'
            : '科目Bはアルゴリズムとプログラミング16問・情報セキュリティ4問の構成です（IPA 試験要綱 Ver.5.6）。'}
          本試験は IRT（項目応答理論）で採点され、合格基準は科目A・Bとも 600点/1,000点です。本アプリの得点は単純な正答数であり、本試験の評価点や合否を示すものではありません。
        </div>
      </div>

      <div className="card">
        <h2>受験履歴</h2>
        {history.length === 0 ? <p className="muted small">まだ受験履歴はありません。</p> : (
          <ul className="list">
            {history.map((e) => {
              const s = scoreExam(e, content!.byId);
              return (
                <li key={e.id}>
                  <Link className="item" to={`/exam/result/${e.id}`}>
                    <span className="grow">
                      <strong>{examTitle(e.kind, e.format)}</strong> <span className="small muted">{new Date(e.startedAt).toLocaleString('ja-JP')}</span><br />
                      <span className="small">{s.correct}/{s.total}問正解（{Math.round(s.rate * 100)}%）・{Math.round(e.elapsedMs / 60000)}分</span>
                    </span>
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}
