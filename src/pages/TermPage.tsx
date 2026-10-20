import { useApp } from '../app/context';
import { Link } from '../app/router';
import { startSession } from '../app/session';
import { RichText } from '../components/RichText';
import { normalizeForCompare } from '../lib/text';
import type { Question } from '../types';

export default function TermPage({ id }: { id?: string }) {
  const { content } = useApp();
  const t = id ? content!.termById.get(id) : undefined;
  if (!t) return <div className="card"><h1 tabIndex={-1}>用語が見つかりません</h1><Link to="/dict">辞典へ</Link></div>;
  const find = (name: string) => content!.glossary.find((g) => normalizeForCompare(g.term) === normalizeForCompare(name) || (g as { aliases?: string[] }).aliases?.some((a) => normalizeForCompare(a) === normalizeForCompare(name)));
  const qs = (t.questionIds ?? []).map((x) => content!.byId.get(x)).filter(Boolean) as Question[];
  const refs = content!.reference.filter((ch) => ch.sections.some((s) => s.body.includes(`[[${t.term}`)));
  return (
    <div className="stack">
      <div className="card">
        <p className="xsmall muted" style={{ margin: 0 }}>{t.category}</p>
        <h1 tabIndex={-1} style={{ marginBottom: 4 }}>{t.term}</h1>
        {t.reading && <p className="small muted" style={{ margin: 0 }}>読み：{t.reading}</p>}
        {t.fullName && (
          <div style={{ marginTop: 12 }}>
            <p style={{ margin: 0 }}><strong>{t.fullName}</strong></p>
            {t.japanese && <p className="small" style={{ margin: 0 }}>日本語訳：{t.japanese}</p>}
          </div>
        )}
        {t.words && t.words.length > 0 && (
          <div className="table-wrap" style={{ marginTop: 10 }}>
            <table className="word-table">
              <caption className="sr-only">英単語ごとの意味</caption>
              <thead><tr><th scope="col">英単語</th><th scope="col">意味</th></tr></thead>
              <tbody>{t.words.map((w) => <tr key={w.en}><td>{w.en}</td><td>{w.ja}</td></tr>)}</tbody>
            </table>
          </div>
        )}
      </div>
      <div className="card">
        <h2>ひとことで言うと</h2>
        <RichText text={t.simple} />
        <h2>正確な定義</h2>
        <RichText text={t.definition} />
        {t.example && (<><h2>具体例</h2><RichText text={t.example} /></>)}
        {t.difference && (<><h2>似た用語との違い</h2><RichText text={t.difference} /></>)}
      </div>
      {t.related.length > 0 && (
        <div className="card">
          <h2>関連用語</h2>
          <div className="chips">
            {t.related.map((r) => {
              const g = find(r);
              return g ? <Link key={r} to={`/term/${g.id}`} className="chip">{r}</Link> : <span key={r} className="chip">{r}</span>;
            })}
          </div>
        </div>
      )}
      {qs.length > 0 && (
        <div className="card">
          <h2>関連問題（{qs.length}問）</h2>
          <button className="btn primary" onClick={() => startSession('practice', `「${t.term}」の関連問題`, qs.slice(0, 20))}>関連問題を解く</button>
        </div>
      )}
      {refs.length > 0 && (
        <div className="card">
          <h2>参考書の該当章</h2>
          <ul>{refs.map((r) => <li key={r.id}><Link to={`/reference/${r.id}`}>{r.title}</Link></li>)}</ul>
        </div>
      )}
    </div>
  );
}
