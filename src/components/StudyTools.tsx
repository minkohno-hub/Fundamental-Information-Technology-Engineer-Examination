// 理解度・お気に入り・見直し・メモ・誤り報告
import { useEffect, useRef, useState } from 'react';
import type { ProblemReport, Question, Understanding } from '../types';
import { useApp, useStore } from '../app/context';
import { IFlag, INote, IReport, IStar } from './Icons';

const UNDERSTANDING: { v: Understanding; label: string }[] = [
  { v: 'understood', label: '理解した' },
  { v: 'review', label: '復習したい' },
  { v: 'notUnderstood', label: '理解できない' },
];

export function StudyTools({ q, compact = false }: { q: Question; compact?: boolean }) {
  const st = useStore();
  const s = st.getState(q.id);
  const [memoOpen, setMemoOpen] = useState(Boolean(s.memo));
  const [memo, setMemo] = useState(s.memo ?? '');
  const [reportOpen, setReportOpen] = useState(false);
  useEffect(() => { setMemo(st.getState(q.id).memo ?? ''); setMemoOpen(Boolean(st.getState(q.id).memo)); }, [q.id, st]);

  return (
    <div style={{ marginTop: 16 }}>
      {!compact && (
        <div className="field" style={{ marginBottom: 8 }}>
          <span className="label small" id={`u-${q.id}`}>理解度（正解しても自信がなければ「復習したい」に）</span>
          <div className="segmented" role="group" aria-labelledby={`u-${q.id}`}>
            {UNDERSTANDING.map((u) => (
              <button key={u.v} type="button" aria-pressed={s.understanding === u.v}
                onClick={() => st.setUnderstanding(q.id, s.understanding === u.v ? undefined : u.v)}>{u.label}</button>
            ))}
          </div>
        </div>
      )}
      <div className="toolbar">
        <button type="button" className="icon-btn" aria-pressed={Boolean(s.favorite)} onClick={() => st.toggleFavorite(q.id)}>
          <IStar fill={s.favorite ? 'currentColor' : 'none'} />お気に入り
        </button>
        <button type="button" className="icon-btn" aria-pressed={Boolean(s.flagged)} onClick={() => st.toggleFlag(q.id)}>
          <IFlag />見直し
        </button>
        <button type="button" className="icon-btn" aria-pressed={memoOpen} aria-expanded={memoOpen} onClick={() => setMemoOpen((x) => !x)}>
          <INote />メモ{s.memo ? '（あり）' : ''}
        </button>
        <button type="button" className="icon-btn" onClick={() => setReportOpen(true)}>
          <IReport />誤りを報告
        </button>
      </div>
      {memoOpen && (
        <div className="field" style={{ marginTop: 8 }}>
          <label htmlFor={`memo-${q.id}`} className="small">自分用メモ（この端末にだけ保存されます）</label>
          <textarea id={`memo-${q.id}`} value={memo} maxLength={5000} onChange={(e) => setMemo(e.target.value)} onBlur={() => st.setMemo(q.id, memo)} />
          <div className="row"><button type="button" className="btn sm" onClick={() => st.setMemo(q.id, memo)}>メモを保存</button></div>
        </div>
      )}
      {reportOpen && <ReportDialog q={q} onClose={() => setReportOpen(false)} />}
    </div>
  );
}

const KINDS: { v: ProblemReport['kind']; label: string }[] = [
  { v: 'answer', label: '正解が誤っている' },
  { v: 'explanation', label: '解説が誤っている・分かりにくい' },
  { v: 'question', label: '問題文・選択肢が不明確' },
  { v: 'typo', label: '誤字・脱字' },
  { v: 'other', label: 'その他' },
];

export const REPO_URL = 'https://github.com/minkohno-hub/fundamental-information-technology-engineer-examination';

export function reportToIssueText(r: ProblemReport, kindLabel = KINDS.find((k) => k.v === r.kind)?.label ?? r.kind) {
  return {
    title: `[問題報告] ${r.qid}：${kindLabel}`,
    body: [
      `- 問題ID: ${r.qid}`,
      `- 問題の種類: ${r.questionSubject}`,
      `- 誤りの種類: ${kindLabel}`,
      `- アプリのバージョン: ${r.appVersion}`,
      `- 教材データのバージョン: ${r.contentVersion}`,
      '',
      '## 内容',
      r.detail || '（記入なし）',
    ].join('\n'),
  };
}

function ReportDialog({ q, onClose }: { q: Question; onClose: () => void }) {
  const st = useStore();
  const { content } = useApp();
  const ref = useRef<HTMLDialogElement>(null);
  const [kind, setKind] = useState<ProblemReport['kind']>('answer');
  const [detail, setDetail] = useState('');
  const [saved, setSaved] = useState<ProblemReport | null>(null);
  const [copied, setCopied] = useState(false);
  useEffect(() => {
    const d = ref.current;
    if (d && !d.open) d.showModal?.();
  }, []);
  const save = () => {
    const r: ProblemReport = {
      id: `r-${Date.now()}`,
      qid: q.id,
      questionSubject: `科目${q.subject}（${q.category}）／${q.source.kind === 'ipa' ? 'IPA公開問題' : 'オリジナル'}`,
      kind,
      detail: detail.trim().slice(0, 5000),
      appVersion: __APP_VERSION__,
      contentVersion: content?.manifest.version ?? '',
      createdAt: Date.now(),
    };
    st.addReport(r);
    setSaved(r);
  };
  const issue = saved ? reportToIssueText(saved) : null;
  const copy = async () => {
    if (!issue) return;
    const text = `${issue.title}\n\n${issue.body}`;
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
    } catch {
      setCopied(false);
      window.prompt('次の文章をコピーしてください', text);
    }
  };
  return (
    <dialog ref={ref} onClose={onClose} aria-labelledby="report-title">
      <h2 id="report-title">問題の誤りを報告</h2>
      {!saved ? (
        <form onSubmit={(e) => { e.preventDefault(); save(); }}>
          <p className="small muted">報告はこの端末に保存されます。保存後、GitHub の Issue 用の文章としてコピーできます（送信は行いません）。</p>
          <div className="field">
            <label htmlFor="rk">誤りの種類</label>
            <select id="rk" value={kind} onChange={(e) => setKind(e.target.value as ProblemReport['kind'])}>
              {KINDS.map((k) => <option key={k.v} value={k.v}>{k.label}</option>)}
            </select>
          </div>
          <div className="field">
            <label htmlFor="rd">内容（どこがどう誤っているか）</label>
            <textarea id="rd" value={detail} maxLength={5000} onChange={(e) => setDetail(e.target.value)} />
          </div>
          <div className="row">
            <button type="submit" className="btn primary">端末に保存</button>
            <button type="button" className="btn" onClick={() => ref.current?.close()}>キャンセル</button>
          </div>
        </form>
      ) : (
        <div className="stack">
          <div className="notice ok">保存しました（設定 ＞ 問題報告 から一覧できます）。</div>
          <pre className="code-block" style={{ whiteSpace: 'pre-wrap' }}>{issue!.title}{'\n\n'}{issue!.body}</pre>
          <div className="row">
            <button type="button" className="btn primary" onClick={copy}>{copied ? 'コピーしました' : 'Issue 用の文章をコピー'}</button>
            <a className="btn" href={`${REPO_URL}/issues/new?title=${encodeURIComponent(issue!.title)}&body=${encodeURIComponent(issue!.body)}`} target="_blank" rel="noopener noreferrer">GitHub で開く</a>
            <button type="button" className="btn ghost" onClick={() => ref.current?.close()}>閉じる</button>
          </div>
        </div>
      )}
    </dialog>
  );
}
