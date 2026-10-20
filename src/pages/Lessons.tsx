// 初心者向けプログラミング講座：短い説明 → 動作例（シミュレーター）→ 確認問題
import { useState } from 'react';
import { useApp, useStore } from '../app/context';
import { Link } from '../app/router';
import { startSession } from '../app/session';
import { RichText } from '../components/RichText';
import { Simulator } from '../components/Simulator';
import { CodeBlock } from '../components/CodeBlock';
import type { Question } from '../types';

export default function Lessons({ id }: { id?: string }) {
  const { content } = useApp();
  const st = useStore();
  const lessons = content!.lessons;
  const [sim, setSim] = useState(false);
  const done = (qids: string[]) => qids.length > 0 && qids.every((q) => st.states.get(q)?.lastCorrect);
  if (!id) {
    return (
      <div className="stack">
        <h1 tabIndex={-1}>初心者向けプログラミング講座</h1>
        <p className="small muted">プログラミング経験がほとんどない方向けに、科目Bで使う IPA の擬似言語を一歩ずつ学びます。各回は短い説明・動作例・確認問題でできています。</p>
        <ol className="list card" style={{ padding: '4px 14px' }}>
          {lessons.map((l) => (
            <li key={l.id}>
              <Link className="item" to={`/lessons/${l.id}`}>
                <span className="tag primary">{l.order}</span>
                <span className="grow"><strong>{l.title}</strong></span>
                {done(l.questionIds) && <span className="tag ok">確認問題 全問正解</span>}
              </Link>
            </li>
          ))}
        </ol>
      </div>
    );
  }
  const i = lessons.findIndex((l) => l.id === id);
  const l = lessons[i];
  if (!l) return <div className="card"><h1 tabIndex={-1}>講座が見つかりません</h1><Link to="/lessons">講座一覧へ</Link></div>;
  const qs = l.questionIds.map((x) => content!.byId.get(x)).filter(Boolean) as Question[];
  return (
    <div className="stack" key={l.id}>
      <p className="small" style={{ margin: 0 }}><Link to="/lessons">講座一覧</Link></p>
      <h1 tabIndex={-1}>第{l.order}回　{l.title}</h1>
      <div className="card"><RichText text={l.body} /></div>
      {l.example && (
        <div className="card">
          <h2>動作例</h2>
          {!sim ? (
            <>
              <CodeBlock code={l.example} />
              <button className="btn" onClick={() => setSim(true)}>1行ずつ実行してみる</button>
            </>
          ) : <Simulator spec={{ program: l.example }} />}
        </div>
      )}
      {qs.length > 0 && (
        <div className="card">
          <h2>確認問題（{qs.length}問）</h2>
          <button className="btn primary" onClick={() => startSession('lesson', `第${l.order}回 確認問題`, qs)}>確認問題を解く</button>
        </div>
      )}
      <div className="row between">
        {i > 0 ? <Link className="btn" to={`/lessons/${lessons[i - 1].id}`} onClick={() => setSim(false)}>← 前の回</Link> : <span />}
        {i < lessons.length - 1 && <Link className="btn primary" to={`/lessons/${lessons[i + 1].id}`} onClick={() => setSim(false)}>次の回 →</Link>}
      </div>
    </div>
  );
}
