import { useMemo, useState } from 'react';
import { useApp } from '../app/context';
import { Link } from '../app/router';
import { matchesQuery } from '../lib/text';

export default function Dictionary() {
  const { content } = useApp();
  const [q, setQ] = useState('');
  const [cat, setCat] = useState<string>('');
  const cats = useMemo(() => [...new Set(content!.glossary.map((t) => t.category))], [content]);
  const list = content!.glossary
    .filter((t) => (!cat || t.category === cat) && (!q || matchesQuery([t.term, t.reading, t.fullName, t.japanese, t.simple, ...(((t as { aliases?: string[] }).aliases) ?? [])].join(' '), q)))
    .sort((a, b) => (a.reading ?? a.term).localeCompare(b.reading ?? b.term, 'ja'));
  return (
    <div className="stack">
      <h1 tabIndex={-1}>IT用語辞典</h1>
      <div className="row">
        <Link to="/reference" className="btn sm">コンパクト参考書</Link>
        <Link to="/lessons" className="btn sm">プログラミング講座</Link>
        <Link to="/search" className="btn sm">問題・解説も含めて検索</Link>
      </div>
      <div className="field">
        <label htmlFor="dq">用語を検索（略語・正式名称・読み方）</label>
        <input id="dq" type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="例：DNS、ドメイン、ハッシュ" />
      </div>
      <div className="chips">
        <button className="chip" aria-pressed={!cat} onClick={() => setCat('')}>すべて（{content!.glossary.length}）</button>
        {cats.map((c) => <button key={c} className="chip" aria-pressed={cat === c} onClick={() => setCat(c)}>{c}</button>)}
      </div>
      <ul className="list card" style={{ padding: '4px 14px' }}>
        {list.length === 0 && <li className="item muted small">該当する用語がありません。</li>}
        {list.map((t) => (
          <li key={t.id}>
            <Link to={`/term/${t.id}`} className="item">
              <span className="grow">
                <strong>{t.term}</strong>{t.fullName && <span className="small muted">　{t.fullName}</span>}
                <br /><span className="small muted">{t.japanese ? `${t.japanese}：` : ''}{t.simple.slice(0, 60)}{t.simple.length > 60 ? '…' : ''}</span>
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
