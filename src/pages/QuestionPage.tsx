// 単独の問題ページ（検索・関連問題・復習一覧から開く）
import { useState } from 'react';
import { useApp, useStore } from '../app/context';
import { Link } from '../app/router';
import { QuestionCard } from '../components/QuestionCard';
import { choiceOrder, mulberry32, randomSeed } from '../lib/rng';

export default function QuestionPage({ id }: { id?: string }) {
  const { content } = useApp();
  const st = useStore();
  const q = id ? content!.byId.get(id) : undefined;
  const [order] = useState(() => (q ? choiceOrder(q.choices.length, st.settings.shuffleChoices && !q.noShuffle, mulberry32(randomSeed())) : []));
  const [hidden, setHidden] = useState<number[]>([]);
  const [answered, setAnswered] = useState<{ chosen: number; correct: boolean; input?: string } | null>(null);
  if (!q) return <div className="card"><h1 tabIndex={-1}>問題が見つかりません</h1><p>教材の更新で削除された可能性があります。</p><Link to="/">ホームへ</Link></div>;
  return (
    <div className="stack">
      <div className="row between">
        <h1 tabIndex={-1} style={{ margin: 0, fontSize: '1.05em' }}>問題 {q.id}</h1>
        <button className="btn sm ghost" onClick={() => history.back()}>戻る</button>
      </div>
      <QuestionCard key={q.id} q={q} order={order} hidden={hidden} onHiddenChange={setHidden} answered={answered}
        onAnswer={(chosen, correct, timeMs, input) => {
          st.recordAnswer({ qid: q.id, at: Date.now(), correct, chosen, timeMs, mode: 'review' });
          setAnswered({ chosen, correct, input });
        }} />
    </div>
  );
}
