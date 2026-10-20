import { useApp } from '../app/context';
import { Link } from '../app/router';
import { pick, startSession } from '../app/session';
import { RichText } from '../components/RichText';

export default function Reference({ id }: { id?: string }) {
  const { content, categoryName } = useApp();
  const chapters = content!.reference;
  if (!id) {
    return (
      <div className="stack">
        <h1 tabIndex={-1}>コンパクト参考書</h1>
        <p className="small muted">シラバス Ver.{content!.syllabus.version} の章立てに沿って、問題演習で必要な要点を短くまとめています。分からなかった問題の解説から、関連用語をたどって確認する使い方がおすすめです。</p>
        <ul className="list card" style={{ padding: '4px 14px' }}>
          {chapters.map((c) => (
            <li key={c.id}><Link className="item" to={`/reference/${c.id}`}><span className="grow"><strong>{c.title}</strong><br /><span className="small muted">{c.sections.map((s) => s.title).join('・')}</span></span></Link></li>
          ))}
        </ul>
      </div>
    );
  }
  const idx = chapters.findIndex((c) => c.id === id);
  const ch = chapters[idx];
  if (!ch) return <div className="card"><h1 tabIndex={-1}>章が見つかりません</h1><Link to="/reference">目次へ</Link></div>;
  const pool = content!.questions.filter((q) => ch.categories.includes(q.category));
  return (
    <div className="stack">
      <p className="small" style={{ margin: 0 }}><Link to="/reference">参考書 目次</Link></p>
      <h1 tabIndex={-1}>{ch.title}</h1>
      <nav className="card toc" aria-label="この章の目次">
        {ch.sections.map((s, i) => <a key={i} href={`#/reference/${ch.id}`} onClick={(e) => { e.preventDefault(); document.getElementById(`sec-${i}`)?.scrollIntoView({ behavior: 'smooth' }); }}>{i + 1}. {s.title}</a>)}
      </nav>
      {ch.sections.map((s, i) => (
        <section key={i} className="card" id={`sec-${i}`}>
          <h2>{i + 1}. {s.title}</h2>
          <RichText text={s.body} />
        </section>
      ))}
      {pool.length > 0 && (
        <div className="card">
          <h2>この章の問題を解く</h2>
          <p className="small muted">対象分野：{ch.categories.map(categoryName).join('、')}（{pool.length}問）</p>
          <button className="btn primary" onClick={() => startSession('practice', `${ch.title}の演習`, pick(pool, 'standard', 10))}>10問解く</button>
        </div>
      )}
      <div className="row between">
        {idx > 0 ? <Link className="btn" to={`/reference/${chapters[idx - 1].id}`}>← {chapters[idx - 1].title}</Link> : <span />}
        {idx < chapters.length - 1 && <Link className="btn" to={`/reference/${chapters[idx + 1].id}`}>{chapters[idx + 1].title} →</Link>}
      </div>
    </div>
  );
}
