// 横断検索（問題文・選択肢・解説・辞典・参考書）。端末内のデータだけで検索するためオフラインでも使える。
import { useDeferredValue, useMemo, useState } from 'react';
import { useApp } from '../app/context';
import { Link } from '../app/router';
import { matchesQuery } from '../lib/text';
import { stripMarkup } from '../components/Explanation';

export default function Search() {
  const { content, categoryName } = useApp();
  const [q, setQ] = useState(() => new URLSearchParams(location.hash.split('?')[1] ?? '').get('q') ?? '');
  const dq = useDeferredValue(q.trim());
  const index = useMemo(() => content!.questions.map((x) => ({
    q: x,
    text: [x.questionText, x.code ?? '', ...x.choices, x.explanation, ...x.choiceExplanations, x.knowledge ?? ''].join(' '),
  })), [content]);
  const results = useMemo(() => {
    if (dq.length < 1) return null;
    const terms = content!.glossary.filter((t) => matchesQuery([t.term, t.reading, t.fullName, t.japanese, t.simple, t.definition, ...((t as { aliases?: string[] }).aliases ?? [])].join(' '), dq));
    const refs = content!.reference.flatMap((ch) => ch.sections.filter((s) => matchesQuery(s.title + ' ' + s.body, dq)).map((s) => ({ ch, s })));
    const qs = index.filter((x) => matchesQuery(x.text, dq)).map((x) => x.q);
    return { terms, refs, qs };
  }, [dq, index, content]);

  return (
    <div className="stack">
      <h1 tabIndex={-1}>検索</h1>
      <div className="field">
        <label htmlFor="sq">キーワード（スペース区切りですべてを含むものを検索）</label>
        <input id="sq" type="search" autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder="例：公開鍵 署名" />
      </div>
      {results && (
        <>
          <p className="small muted" role="status">用語 {results.terms.length}件・参考書 {results.refs.length}件・問題 {results.qs.length}件</p>
          {results.terms.length > 0 && (
            <div className="card">
              <h2>用語辞典</h2>
              <ul className="list">
                {results.terms.slice(0, 30).map((t) => (
                  <li key={t.id}><Link className="item" to={`/term/${t.id}`}><span className="grow"><strong>{t.term}</strong> <span className="small muted">{t.fullName ?? ''}</span><br /><span className="small">{t.simple.slice(0, 70)}</span></span></Link></li>
                ))}
              </ul>
            </div>
          )}
          {results.refs.length > 0 && (
            <div className="card">
              <h2>コンパクト参考書</h2>
              <ul className="list">
                {results.refs.slice(0, 30).map(({ ch, s }) => (
                  <li key={ch.id + s.title}><Link className="item" to={`/reference/${ch.id}`}><span className="grow"><span className="xsmall muted">{ch.title}</span><br /><strong className="small">{s.title}</strong></span></Link></li>
                ))}
              </ul>
            </div>
          )}
          {results.qs.length > 0 && (
            <div className="card">
              <h2>問題・解説</h2>
              <ul className="list">
                {results.qs.slice(0, 100).map((x) => (
                  <li key={x.id}><Link className="item" to={`/q/${x.id}`}><span className="grow"><span className="xsmall muted">科目{x.subject}／{categoryName(x.category)}／{x.id}</span><br /><span className="small">{stripMarkup(x.questionText).slice(0, 90)}</span></span></Link></li>
                ))}
              </ul>
              {results.qs.length > 100 && <p className="small muted">上位100件を表示しています。キーワードを追加して絞り込んでください。</p>}
            </div>
          )}
        </>
      )}
    </div>
  );
}
