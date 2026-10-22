// 演習セッション（一問一答）。途中で閉じても store.session に保存され、続きから再開できる。
import { useEffect, useMemo, useRef } from 'react';
import { useApp, useStore } from '../app/context';
import { Link, navigate } from '../app/router';
import { QuestionCard } from '../components/QuestionCard';
import { startSession } from '../app/session';
import { IArrowR } from '../components/Icons';
import { stripMarkup } from '../components/Explanation';
import type { Question } from '../types';

export default function SessionPage() {
  const { content } = useApp();
  const st = useStore();
  const s = st.session;
  const nextRef = useRef<HTMLButtonElement>(null);
  const qs = useMemo(() => (s && content ? s.questionIds.map((id) => content.byId.get(id)).filter(Boolean) as Question[] : []), [s, content]);

  // 回答後は Enter で次へ
  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      if (e.key === 'Enter' && s && s.results[s.index] !== null && !(e.target instanceof HTMLTextAreaElement) && !(e.target instanceof HTMLButtonElement)) {
        e.preventDefault();
        nextRef.current?.click();
      }
    };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, [s]);

  if (!s || !content) {
    return (
      <div className="card">
        <h1 tabIndex={-1}>演習</h1>
        <p>進行中の演習はありません。</p>
        <Link to="/practice" className="btn primary">演習を始める</Link>
      </div>
    );
  }
  if (qs.length === 0 && s.questionIds.length > 0) {
    return (
      <div className="card" role="status">
        <h1 tabIndex={-1}>演習</h1>
        <p>中断していた演習の問題が教材の更新ですべて削除されたため、続けられません。</p>
        <div className="row">
          <button className="btn" onClick={() => st.saveSession(null)}>この演習を破棄する</button>
          <Link to="/practice" className="btn primary">演習を始める</Link>
        </div>
      </div>
    );
  }
  if (qs.length !== s.questionIds.length) {
    // 教材更新で問題が削除された場合は存在する問題だけで続ける
    const keep = s.questionIds.map((id, i) => ({ id, i })).filter(({ id }) => content.byId.has(id));
    st.saveSession({
      ...s,
      questionIds: keep.map((k) => k.id),
      orders: keep.map((k) => s.orders[k.i]),
      results: keep.map((k) => s.results[k.i]),
      chosen: keep.map((k) => s.chosen?.[k.i] ?? null),
      inputs: keep.map((k) => s.inputs?.[k.i] ?? null),
      hidden: keep.map((k) => s.hidden[k.i] ?? []),
      index: Math.min(s.index, Math.max(0, keep.length - 1)),
    });
    return null;
  }

  const done = s.index >= qs.length;
  if (done) return <Summary />;

  const q = qs[s.index];
  const result = s.results[s.index];
  const answered = result === null ? null : { chosen: s.chosen?.[s.index] ?? -1, correct: result, input: s.inputs?.[s.index] ?? undefined };

  const onAnswer = (chosen: number, correct: boolean, timeMs: number, input?: string) => {
    st.recordAnswer({ qid: q.id, at: Date.now(), correct, chosen, timeMs, mode: s.mode });
    const results = [...s.results];
    const chosenArr = [...(s.chosen ?? s.results.map(() => null))];
    const inputs = [...(s.inputs ?? s.results.map(() => null))];
    results[s.index] = correct;
    chosenArr[s.index] = chosen;
    inputs[s.index] = input ?? null;
    st.saveSession({ ...s, results, chosen: chosenArr, inputs });
  };
  const next = () => st.saveSession({ ...s, index: s.index + 1 });

  return (
    <div>
      <div className="row between" style={{ marginBottom: 10 }}>
        <h1 tabIndex={-1} style={{ margin: 0, fontSize: '1.05em' }}>{s.title}</h1>
        <button className="btn sm ghost" onClick={() => navigate('/')}>中断する</button>
      </div>
      <div className="progress" aria-hidden="true" style={{ marginBottom: 14 }}><span style={{ width: `${(s.index / qs.length) * 100}%` }} /></div>
      <QuestionCard
        key={q.id + s.id}
        q={q}
        order={s.orders[s.index]}
        hidden={s.hidden[s.index] ?? []}
        onHiddenChange={(h) => { const hidden = [...s.hidden]; hidden[s.index] = h; st.saveSession({ ...s, hidden }); }}
        answered={answered}
        onAnswer={onAnswer}
        index={s.index}
        total={qs.length}
        inputMode={s.mode === 'quickB' && st.settings.quickBInput}
      />
      {result !== null && (
        <div className="sticky-actions">
          <button ref={nextRef} className="btn primary lg" onClick={next}>
            {s.index + 1 < qs.length ? '次の問題へ' : '結果を見る'}<IArrowR width={20} />
          </button>
        </div>
      )}
      <p className="xsmall muted" style={{ marginTop: 10 }}>キーボード：<span className="kbd">1</span>〜<span className="kbd">4</span> で選択、<span className="kbd">Enter</span> で次へ。途中で閉じても続きから再開できます。</p>
    </div>
  );
}

function Summary() {
  const { content, categoryName } = useApp();
  const st = useStore();
  const s = st.session!;
  const qs = s.questionIds.map((id) => content!.byId.get(id)!);
  const correct = s.results.filter((r) => r === true).length;
  const wrong = qs.filter((_, i) => s.results[i] === false);
  return (
    <div className="stack">
      <div className="card">
        <h1 tabIndex={-1}>{s.title}：結果</h1>
        <div className="grid three">
          <div className="stat"><span className="v">{correct} / {qs.length}</span><span className="k">正解数</span></div>
          <div className="stat"><span className="v">{qs.length ? Math.round((correct / qs.length) * 100) : 0}%</span><span className="k">正答率</span></div>
          <div className="stat"><span className="v">{st.answersToday()}</span><span className="k">今日の回答数</span></div>
        </div>
      </div>
      {wrong.length > 0 && (
        <div className="card">
          <h2>間違えた問題</h2>
          <ul className="list">
            {wrong.map((q) => (
              <li key={q.id}><Link className="item" to={`/q/${q.id}`}><span className="grow"><span className="xsmall muted">{categoryName(q.category)}</span><br /><span className="small">{stripMarkup(q.questionText).slice(0, 80)}</span></span></Link></li>
            ))}
          </ul>
        </div>
      )}
      <div className="grid two">
        {wrong.length > 0 && (
          <button className="btn primary lg" onClick={() => startSession('review', '間違えた問題の解き直し', wrong)}>間違えた問題を解き直す</button>
        )}
        <button className="btn lg" onClick={() => { st.saveSession(null); navigate('/'); }}>ホームへ戻る</button>
      </div>
    </div>
  );
}
