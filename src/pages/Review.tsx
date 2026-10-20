import { useApp, useStore } from '../app/context';
import { Link } from '../app/router';
import { pick, startSession } from '../app/session';
import { isReviewDue, isWeak, REVIEW_INTERVAL_DAYS } from '../lib/selection';
import { stripMarkup } from '../components/Explanation';
import type { Question } from '../types';

export default function Review() {
  const { content, categoryName } = useApp();
  const st = useStore();
  const now = Date.now();
  const qs = content!.questions;
  const groups: { key: string; title: string; desc: string; list: Question[] }[] = [
    { key: 'wrong', title: '最後に間違えた問題', desc: '直近の回答が不正解だった問題', list: qs.filter((q) => st.states.get(q.id)?.attempts && st.states.get(q.id)?.lastCorrect === false) },
    { key: 'nu', title: '「理解できない」にした問題', desc: '', list: qs.filter((q) => st.states.get(q.id)?.understanding === 'notUnderstood') },
    { key: 'rv', title: '「復習したい」にした問題', desc: '正解しても自信がなかった問題など', list: qs.filter((q) => st.states.get(q.id)?.understanding === 'review') },
    { key: 'due', title: '復習時期の問題', desc: `正解した回数に応じて ${REVIEW_INTERVAL_DAYS.join('・')} 日後に再出題`, list: qs.filter((q) => !isWeak(st.states.get(q.id)) && isReviewDue(st.states.get(q.id), now)) },
    { key: 'flag', title: '見直しフラグ', desc: '', list: qs.filter((q) => st.states.get(q.id)?.flagged) },
    { key: 'fav', title: 'お気に入り', desc: '', list: qs.filter((q) => st.states.get(q.id)?.favorite) },
    { key: 'memo', title: 'メモを書いた問題', desc: '', list: qs.filter((q) => st.states.get(q.id)?.memo) },
  ];
  const all = qs.filter((q) => isWeak(st.states.get(q.id)) || isReviewDue(st.states.get(q.id), now));
  return (
    <div className="stack">
      <h1 tabIndex={-1}>復習</h1>
      <button className="btn primary lg block" disabled={!all.length} onClick={() => startSession('review', '復習', pick(qs, 'review', 20))}>
        復習が必要な問題をまとめて解く（{all.length}問から20問）
      </button>
      {groups.map((g) => (
        <details key={g.key} className="card">
          <summary>{g.title}（{g.list.length}問）</summary>
          {g.desc && <p className="small muted">{g.desc}</p>}
          {g.list.length > 0 && (
            <>
              <button className="btn sm primary" onClick={() => startSession('review', g.title, pick(g.list, 'random', 50))}>この{Math.min(50, g.list.length)}問を解く</button>
              <ul className="list">
                {g.list.slice(0, 100).map((q) => (
                  <li key={q.id}>
                    <Link className="item" to={`/q/${q.id}`}>
                      <span className="grow"><span className="xsmall muted">{categoryName(q.category)}</span><br /><span className="small">{stripMarkup(q.questionText).slice(0, 80)}</span>
                        {st.states.get(q.id)?.memo && <><br /><span className="xsmall">メモ：{st.states.get(q.id)!.memo!.slice(0, 60)}</span></>}</span>
                    </Link>
                  </li>
                ))}
              </ul>
            </>
          )}
        </details>
      ))}
    </div>
  );
}
