// 模擬試験の実施画面。解答中は正誤・解説を表示しない（終了後に一括採点）。
import { useCallback, useEffect, useRef, useState } from 'react';
import { useApp, useStore } from '../app/context';
import { Link, navigate } from '../app/router';
import { remainingMs } from '../lib/exam';
import { QuestionBody, QuestionHeader, LETTERS } from '../components/QuestionCard';
import { RichText } from '../components/RichText';
import { IFlag, IArrowL, IArrowR } from '../components/Icons';
import type { ExamRecord } from '../types';
import { examTitle } from './ExamSetup';

function fmtTime(ms: number) {
  const s = Math.ceil(ms / 1000);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const ss = s % 60;
  return `${h ? `${h}:` : ''}${String(m).padStart(h ? 2 : 1, '0')}:${String(ss).padStart(2, '0')}`;
}

export function finishExam(st: ReturnType<typeof useStore>, exam: ExamRecord, qById: Map<string, { correctAnswer: number }>) {
  const now = Date.now();
  const fin: ExamRecord = { ...exam, status: 'finished', finishedAt: now };
  st.saveExam(fin);
  // 解答した問題を回答履歴に記録（初見正答率などの分析に反映される）
  exam.questionIds.forEach((id, i) => {
    const a = exam.answers[i];
    const q = qById.get(id);
    if (a === null || !q) return;
    st.recordAnswer({ qid: id, at: now, correct: a === q.correctAnswer, chosen: a, timeMs: exam.timePerQuestionMs[i], mode: 'exam' });
  });
  navigate(`/exam/result/${exam.id}`, true);
}

export default function ExamRun() {
  const { content } = useApp();
  const st = useStore();
  const exam = st.exams.find((e) => e.status === 'inProgress');
  const [idx, setIdx] = useState(0);
  const [now, setNow] = useState(Date.now());
  const [paused, setPaused] = useState(false);
  const [showNav, setShowNav] = useState(false);
  const activeSince = useRef<number | null>(Date.now());
  const qStart = useRef(Date.now());
  const examRef = useRef(exam);
  examRef.current = exam;

  /** 経過時間・問題ごとの解答時間を確定して保存 */
  const commitTime = useCallback((extra?: Partial<ExamRecord>) => {
    // 最新の保存内容を参照し、終了済みの試験は上書きしない（終了処理後のアンマウント対策）
    const e = examRef.current && st.exams.find((x) => x.id === examRef.current!.id);
    if (!e || e.status !== 'inProgress') return;
    const t = Date.now();
    const tp = [...e.timePerQuestionMs];
    if (activeSince.current !== null) tp[idxRef.current] += t - qStart.current;
    const elapsed = e.format === 'real' ? t - e.startedAt : e.elapsedMs + (activeSince.current !== null ? t - activeSince.current : 0);
    qStart.current = t;
    if (activeSince.current !== null) activeSince.current = t;
    st.saveExam({ ...e, timePerQuestionMs: tp, elapsedMs: elapsed, ...extra });
  }, [st]);
  const navBtnRef = useRef<HTMLButtonElement>(null);
  const articleRef = useRef<HTMLElement>(null);
  const wasPaused = useRef(false);
  // 再開後はフォーカスが消えたボタンに残らないよう、問題の先頭へ移す（キーボード・スクリーンリーダー向け）
  useEffect(() => {
    if (wasPaused.current && !paused) articleRef.current?.focus({ preventScroll: true });
    wasPaused.current = paused;
  }, [paused]);
  const idxRef = useRef(idx);
  idxRef.current = idx;

  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 500);
    const vis = () => { if (document.hidden) commitTime(); };
    document.addEventListener('visibilitychange', vis);
    return () => { clearInterval(t); document.removeEventListener('visibilitychange', vis); commitTime(); };
  }, [commitTime]);

  const remain = exam ? remainingMs(exam, now, paused ? null : activeSince.current) : null;
  useEffect(() => {
    if (exam && remain === 0) {
      commitTime();
      finishExam(st, examRef.current!, content!.byId);
    }
  }, [remain]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!exam || !content) {
    return (
      <div className="card"><h1 tabIndex={-1}>模擬試験</h1><p>実施中の模擬試験はありません。</p><Link to="/exam" className="btn primary">模擬試験へ</Link></div>
    );
  }
  const q = content.byId.get(exam.questionIds[idx]);
  const go = (i: number) => {
    commitTime();
    setIdx(Math.max(0, Math.min(exam.questionIds.length - 1, i)));
    setShowNav(false);
    window.scrollTo(0, 0);
  };
  const answer = (orig: number) => {
    const answers = [...exam.answers];
    answers[idx] = answers[idx] === orig ? null : orig;
    st.saveExam({ ...exam, answers });
  };
  const toggleFlag = () => {
    const flags = [...exam.flags];
    flags[idx] = !flags[idx];
    st.saveExam({ ...exam, flags });
  };
  const answeredCount = exam.answers.filter((a) => a !== null).length;
  const submit = () => {
    const un = exam.questionIds.length - answeredCount;
    const fl = exam.flags.filter(Boolean).length;
    if (!confirm(`試験を終了して採点しますか？${un ? `\n未解答：${un}問` : ''}${fl ? `\n見直しフラグ：${fl}問` : ''}`)) return;
    commitTime();
    finishExam(st, examRef.current!, content.byId);
  };
  const pause = () => {
    commitTime();
    activeSince.current = null;
    setPaused(true);
  };
  const resume = () => {
    activeSince.current = Date.now();
    qStart.current = Date.now();
    setPaused(false);
  };
  const canPause = exam.format !== 'real';

  return (
    <div>
      <div className="row between" style={{ marginBottom: 10, position: 'sticky', top: 56, zIndex: 15, background: 'var(--bg)', padding: '6px 0' }}>
        <div>
          <h1 tabIndex={-1} style={{ margin: 0, fontSize: '1em' }}>{examTitle(exam.kind, exam.format)}</h1>
          <span className="small muted">解答済み {answeredCount}/{exam.questionIds.length}</span>
        </div>
        <div className="row">
          {remain !== null && <span className={remain < 5 * 60000 ? 'timer low' : 'timer'} role="timer" aria-label="残り時間">残り {fmtTime(remain)}</span>}
          {canPause && <button className="btn sm" onClick={pause}>一時停止</button>}
          <button ref={navBtnRef} className="btn sm" onClick={() => setShowNav((x) => !x)} aria-expanded={showNav}>問題一覧</button>
        </div>
      </div>

      {showNav && (
        <div className="card" style={{ marginBottom: 12 }}>
          <div className="qnav" role="group" aria-label="問題一覧">
            {exam.questionIds.map((_, i) => (
              <button key={i} className={[exam.answers[i] !== null ? 'answered' : '', exam.flags[i] ? 'flagged' : '', i === idx ? 'current' : ''].join(' ')}
                onClick={() => { go(i); navBtnRef.current?.focus(); }} aria-current={i === idx ? 'true' : undefined} aria-label={`問${i + 1}${exam.answers[i] !== null ? ' 解答済み' : ' 未解答'}${exam.flags[i] ? ' 見直し' : ''}`}>{i + 1}</button>
            ))}
          </div>
          <p className="xsmall muted" style={{ marginBottom: 0 }}>青：解答済み／橙の点：見直しフラグ</p>
        </div>
      )}

      {paused ? (
        <div className="card loading">
          <p>一時停止中です（問題は非表示）。</p>
          <button className="btn primary lg" onClick={resume} autoFocus>再開する</button>
        </div>
      ) : q ? (
        <article className="card" ref={articleRef} tabIndex={-1} aria-label={`問${idx + 1}`}>
          <div className="row between">
            <span className="tag primary">問{idx + 1}</span>
            <button className="icon-btn" aria-pressed={exam.flags[idx]} onClick={toggleFlag}><IFlag />見直し</button>
          </div>
          <QuestionHeader q={q} />
          <QuestionBody q={q} />
          <ul className="choices" aria-label="選択肢">
            {exam.orders[idx].map((orig, i) => (
              <li key={orig}>
                <button className={exam.answers[idx] === orig ? 'choice selected' : 'choice'} aria-pressed={exam.answers[idx] === orig} onClick={() => answer(orig)}>
                  <span className="label" aria-hidden="true">{LETTERS[i]}</span>
                  <span className="body"><RichText text={q.choices[orig]} /></span>
                </button>
              </li>
            ))}
          </ul>
        </article>
      ) : <p>この問題は教材の更新で削除されました。</p>}

      {!paused && (
        <div className="sticky-actions">
          <button className="btn" onClick={() => go(idx - 1)} disabled={idx === 0}><IArrowL width={18} />前へ</button>
          {idx < exam.questionIds.length - 1
            ? <button className="btn primary" onClick={() => go(idx + 1)}>次へ<IArrowR width={18} /></button>
            : <button className="btn primary" onClick={submit}>終了して採点</button>}
        </div>
      )}
      <div className="row" style={{ marginTop: 16, justifyContent: 'center' }}>
        <button className="btn danger sm" onClick={submit}>試験を終了して採点する</button>
      </div>
    </div>
  );
}
