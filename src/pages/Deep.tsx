// 計算・プログラミング専用モード（科目A/Bの区分とは独立に「じっくり解く問題」を集めたもの）
import { useMemo, useState } from 'react';
import { useApp, useStore } from '../app/context';
import { pick, startSession } from '../app/session';
import { Link } from '../app/router';
import { stripMarkup } from '../components/Explanation';

export default function Deep() {
  const { content, categoryName } = useApp();
  const st = useStore();
  const [kind, setKind] = useState<'calcA' | 'progB' | 'secB' | 'all'>('all');
  const [simOnly, setSimOnly] = useState(false);
  const pool = useMemo(() => content!.questions.filter((q) => q.depth === 'deep' &&
    (kind === 'all' || (kind === 'calcA' && q.subject === 'A') || (kind === 'progB' && q.category === 'B-ALG') || (kind === 'secB' && q.category === 'B-SEC')) &&
    (!simOnly || q.simulation)), [content, kind, simOnly]);
  const [count, setCount] = useState(5);
  const list = pool.slice(0, 200);

  return (
    <div className="stack">
      <h1 tabIndex={-1}>計算・プログラム読解</h1>
      <p className="muted small">計算過程やプログラムの動きを追いながら、時間をかけて解く問題です。解説には段階的な解き方を示し、対応する問題では実行シミュレーターで変数や配列の変化を1ステップずつ確認できます。</p>
      <div className="card">
        <div className="segmented" role="group" aria-label="種類" style={{ marginBottom: 12 }}>
          <button aria-pressed={kind === 'all'} onClick={() => setKind('all')}>すべて</button>
          <button aria-pressed={kind === 'calcA'} onClick={() => setKind('calcA')}>科目A 計算</button>
          <button aria-pressed={kind === 'progB'} onClick={() => setKind('progB')}>科目B プログラム</button>
          <button aria-pressed={kind === 'secB'} onClick={() => setKind('secB')}>科目B セキュリティ</button>
        </div>
        <label className="row small"><input type="checkbox" checked={simOnly} onChange={(e) => setSimOnly(e.target.checked)} /> シミュレーター対応の問題だけ</label>
        <div className="segmented" role="group" aria-label="問題数" style={{ margin: '12px 0' }}>
          {[1, 3, 5, 10].map((n) => <button key={n} aria-pressed={count === n} onClick={() => setCount(n)}>{n}問</button>)}
        </div>
        <button className="btn primary lg block" disabled={!pool.length} onClick={() => startSession('deep', '計算・プログラム読解', pick(pool, 'standard', count))}>
          {count}問に取り組む（対象 {pool.length}問）
        </button>
      </div>
      <div className="card">
        <h2>問題一覧</h2>
        <ul className="list">
          {list.map((q) => {
            const s = st.states.get(q.id);
            return (
              <li key={q.id}>
                <Link className="item" to={`/q/${q.id}`}>
                  <span className="grow">
                    <span className="xsmall muted">{categoryName(q.category)} {q.simulation && <span className="tag primary">シミュレーター</span>} {s?.attempts ? (s.lastCorrect ? <span className="tag ok">正解済</span> : <span className="tag ng">要復習</span>) : null}</span><br />
                    <span className="small">{stripMarkup(q.questionText).slice(0, 90)}</span>
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>
      </div>
    </div>
  );
}
