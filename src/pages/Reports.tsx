import { useState } from 'react';
import { useStore } from '../app/context';
import { Link } from '../app/router';
import { reportToIssueText, REPO_URL } from '../components/StudyTools';

export default function Reports() {
  const st = useStore();
  const [copied, setCopied] = useState<string | null>(null);
  const copy = async (id: string, text: string) => {
    try { await navigator.clipboard.writeText(text); setCopied(id); } catch { window.prompt('次の文章をコピーしてください', text); }
  };
  return (
    <div className="stack">
      <h1 tabIndex={-1}>問題報告</h1>
      <p className="small muted">各問題の「誤りを報告」から作成した報告です。端末内に保存され、GitHub の Issue 用の文章としてコピーできます。</p>
      {st.reports.length === 0 && <p className="muted">報告はまだありません。</p>}
      {st.reports.map((r) => {
        const t = reportToIssueText(r);
        const text = `${t.title}\n\n${t.body}`;
        return (
          <div key={r.id} className="card">
            <p className="small muted" style={{ marginTop: 0 }}>{new Date(r.createdAt).toLocaleString('ja-JP')}・<Link to={`/q/${r.qid}`}>{r.qid}</Link></p>
            <pre className="code-block" style={{ whiteSpace: 'pre-wrap' }}>{text}</pre>
            <div className="row">
              <button className="btn sm primary" onClick={() => copy(r.id, text)}>{copied === r.id ? 'コピーしました' : 'コピー'}</button>
              <a className="btn sm" target="_blank" rel="noopener noreferrer" href={`${REPO_URL}/issues/new?title=${encodeURIComponent(t.title)}&body=${encodeURIComponent(t.body)}`}>GitHub で開く</a>
              <button className="btn sm danger" onClick={() => confirm('この報告を削除しますか？') && st.deleteReport(r.id)}>削除</button>
            </div>
          </div>
        );
      })}
    </div>
  );
}
