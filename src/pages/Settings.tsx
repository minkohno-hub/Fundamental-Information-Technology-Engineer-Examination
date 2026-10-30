import { useEffect, useRef, useState } from 'react';
import { useApp, useStore } from '../app/context';
import { Link } from '../app/router';
import { checkOffline, type OfflineStatus } from '../data/content';
import { DEFAULT_SETTINGS } from '../data/store';
import { makeBackup, parseBackup, BackupError, type BackupFile } from '../lib/backup';

export default function SettingsPage() {
  const st = useStore();
  const { content, reload } = useApp();
  const s = st.settings;
  const fileRef = useRef<HTMLInputElement>(null);
  const [pending, setPending] = useState<BackupFile | null>(null);
  const [msg, setMsg] = useState<{ kind: 'ok' | 'ng'; text: string } | null>(null);
  const [offline, setOffline] = useState<OfflineStatus | null>(null);
  const [estimate, setEstimate] = useState<{ usage?: number; quota?: number; persisted?: boolean } | null>(null);

  useEffect(() => {
    if (content) void checkOffline(content.manifest).then(setOffline);
    void (async () => {
      try {
        const e = await navigator.storage?.estimate?.();
        const persisted = await navigator.storage?.persisted?.();
        setEstimate({ usage: e?.usage, quota: e?.quota, persisted });
      } catch { setEstimate(null); }
    })();
  }, [content]);

  const exportData = () => {
    const b = makeBackup(st.exportData(), __APP_VERSION__);
    const blob = new Blob([JSON.stringify(b)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    const d = new Date();
    a.href = url;
    a.download = `fe-study-backup-${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}.json`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    setMsg({ kind: 'ok', text: `エクスポートしました（回答履歴 ${b.data.answers.length}件・模擬試験 ${b.data.exams.length}件）。ファイルを移行先の端末に送り、この画面の「インポート」で読み込んでください。` });
  };

  const onFile = async (f: File | undefined) => {
    if (!f) return;
    setMsg(null);
    try {
      const text = await f.text();
      setPending(parseBackup(text, DEFAULT_SETTINGS));
    } catch (e) {
      setMsg({ kind: 'ng', text: e instanceof BackupError ? e.message : `読み込みに失敗しました：${(e as Error).message}` });
    } finally {
      if (fileRef.current) fileRef.current.value = '';
    }
  };

  const confirmImport = async () => {
    if (!pending) return;
    await st.replaceAll(pending.data);
    setMsg({ kind: 'ok', text: `インポートしました（回答履歴 ${pending.data.answers.length}件・問題の状態 ${pending.data.states.length}件・模擬試験 ${pending.data.exams.length}件）。` });
    setPending(null);
  };

  const mb = (n?: number) => (n === undefined ? '—' : `${(n / 1024 / 1024).toFixed(1)}MB`);
  const GOAL_LABEL: Record<string, string> = { pass: 'まずは合格', high: '高得点で合格', review: '知識の復習・再確認' };

  return (
    <div className="stack">
      <h1 tabIndex={-1}>設定・バックアップ</h1>
      {st.ignoredRecords > 0 && <div className="notice warn" role="status">保存データのうち形式が不正な記録 {st.ignoredRecords} 件を無視しました（ほかの記録はそのまま使えます）。</div>}
      {msg && <div className={`notice ${msg.kind}`} role="status">{msg.text}</div>}

      <section className="card">
        <h2>表示</h2>
        <div className="field">
          <label htmlFor="fs">文字サイズ：{Math.round(s.fontScale * 100)}%</label>
          <input id="fs" type="range" min={0.85} max={1.5} step={0.05} value={s.fontScale} onChange={(e) => st.updateSettings({ fontScale: Number(e.target.value) })} />
        </div>
        <div className="field">
          <span className="label">配色</span>
          <div className="segmented" role="group" aria-label="配色">
            {(['system', 'light', 'dark'] as const).map((t) => (
              <button key={t} aria-pressed={s.theme === t} onClick={() => st.updateSettings({ theme: t })}>{t === 'system' ? '端末に合わせる' : t === 'light' ? 'ライト' : 'ダーク'}</button>
            ))}
          </div>
        </div>
        <label className="row field"><input type="checkbox" checked={s.reduceMotion} onChange={(e) => st.updateSettings({ reduceMotion: e.target.checked })} />アニメーションを減らす</label>
        <label className="row field"><input type="checkbox" checked={s.shuffleChoices} onChange={(e) => st.updateSettings({ shuffleChoices: e.target.checked })} />選択肢の順番を毎回入れ替える（IPA 公開問題と順番に意味がある問題は入れ替えません）</label>
      </section>

      <section className="card">
        <h2>学習プラン</h2>
        <p className="small muted">受験予定日や1日の学習時間から、科目A/Bの配分と進め方を提案します。設定しなくても学習できます。</p>
        {s.plan ? (
          <>
            <p className="small">設定済み：1日の学習時間 {s.plan.dailyMinutes}分／目標 {GOAL_LABEL[s.plan.goal] ?? s.plan.goal}{s.plan.examDate ? `／受験予定日 ${s.plan.examDate}` : ''}</p>
            <div className="row"><Link to="/plan" className="btn primary sm">プランを変更する</Link></div>
          </>
        ) : (
          <div className="row"><Link to="/plan" className="btn primary sm">設定する</Link></div>
        )}
      </section>

      <section className="card">
        <h2>バックアップと端末間の移行</h2>
        <p className="small muted">学習データはこの端末のブラウザ内にだけ保存され、外部には送信されません。スマホ⇔PCで移行するときは、エクスポートしたファイルを移行先で読み込みます。</p>
        <div className="row">
          <button className="btn primary" onClick={exportData}>エクスポート（ファイルに保存）</button>
          <button className="btn" onClick={() => fileRef.current?.click()}>インポート（ファイルから復元）</button>
          <input ref={fileRef} type="file" accept="application/json,.json" hidden onChange={(e) => onFile(e.target.files?.[0])} aria-label="バックアップファイルを選択" />
        </div>
        {pending && (
          <div className="notice warn" style={{ marginTop: 12 }} role="alertdialog" aria-label="インポートの確認">
            <p style={{ marginTop: 0 }}><strong>現在の学習データを置き換えます。よろしいですか？</strong></p>
            <p className="small">読み込むデータ：回答履歴 {pending.data.answers.length}件・問題の状態 {pending.data.states.length}件・模擬試験 {pending.data.exams.length}件・問題報告 {pending.data.reports.length}件（{pending.exportedAt ? new Date(pending.exportedAt).toLocaleString('ja-JP') : '日時不明'} にエクスポート）</p>
            <p className="small">現在のデータ：回答履歴 {st.answers.length}件・模擬試験 {st.exams.length}件。必要なら先に現在のデータをエクスポートしてください。</p>
            <div className="row">
              <button className="btn primary" onClick={confirmImport}>置き換える</button>
              <button className="btn" onClick={() => setPending(null)}>やめる</button>
            </div>
          </div>
        )}
      </section>

      <section className="card">
        <h2>オフライン利用</h2>
        {offline ? (
          <ul className="small">
            <li>教材データ：{offline.contentCached ? `保存済み（${content?.manifest.files.length}ファイル）` : `未保存のファイルあり（${offline.missing.join('、')}）`}</li>
            <li>アプリ本体：{offline.shellCached ? '保存済み' : '未保存（オンラインで一度再読み込みすると保存されます）'}</li>
            <li>オフライン起動：{offline.swActive ? '有効' : '準備中（再読み込み後に有効になります）'}</li>
          </ul>
        ) : <p className="small muted">確認中…</p>}
        {offline && offline.contentCached && offline.shellCached && <div className="notice ok small">オフライン準備完了：機内モードなどでも問題演習・解説・辞典・参考書・模擬試験・分析・シミュレーターを利用できます。</div>}
        <p className="small muted">端末の保存容量：使用 {mb(estimate?.usage)} / 上限 {mb(estimate?.quota)}・永続化 {estimate?.persisted ? '許可済み' : '未許可（ブラウザの判断で削除される可能性があります）'}</p>
        <p className="xsmall muted">ブラウザの「履歴・サイトデータの削除」や、長期間アクセスしなかった場合のブラウザによる自動削除（特に iPhone の Safari）では、学習データも消える可能性があります。アプリ側では防げないため、定期的なエクスポートをおすすめします。</p>
        <button className="btn sm" onClick={reload}>教材データを再取得する</button>
      </section>

      <section className="card">
        <h2>その他</h2>
        <ul className="list">
          <li><Link className="item" to="/reports">問題報告の一覧（{st.reports.length}件）</Link></li>
          <li><Link className="item" to="/about">出典・利用条件・このアプリについて</Link></li>
        </ul>
        <p className="xsmall muted">アプリ v{__APP_VERSION__}（{__BUILD_DATE__}）／教材データ {content?.manifest.version ?? '—'}</p>
        <button className="btn danger sm" onClick={async () => {
          if (confirm('この端末の学習データ（回答履歴・理解度・お気に入り・メモ・模擬試験・設定・問題報告）をすべて削除します。元に戻せません。よろしいですか？')) {
            await st.clearAll();
            setMsg({ kind: 'ok', text: '学習データを削除しました。' });
          }
        }}>学習データをすべて削除</button>
      </section>
    </div>
  );
}
