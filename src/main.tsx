import { StrictMode, useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import { store } from './data/store';
import './styles.css';

declare global {
  const __APP_VERSION__: string;
  const __BUILD_DATE__: string;
}

/** 新しい版のアプリが配信されたときに再読み込みを促す（学習中に勝手に再読み込みしない） */
function UpdateBar() {
  const [update, setUpdate] = useState<null | (() => void)>(null);
  useEffect(() => {
    if (!('serviceWorker' in navigator) || import.meta.env.DEV) return;
    let cancelled = false;
    import('virtual:pwa-register').then(({ registerSW }) => {
      if (cancelled) return;
      const updateSW = registerSW({
        immediate: true,
        onNeedRefresh() { setUpdate(() => () => updateSW(true)); },
      });
    }).catch(() => { /* Service Worker を利用できない環境ではオンライン専用で動作 */ });
    return () => { cancelled = true; };
  }, []);
  if (!update) return null;
  return (
    <div className="update-bar" role="status">
      <span style={{ flex: 1 }}>新しいバージョンがあります。学習データはそのまま引き継がれます。</span>
      <button className="btn sm primary" onClick={update}>更新</button>
      <button className="btn sm" onClick={() => setUpdate(null)}>後で</button>
    </div>
  );
}

async function start() {
  await store.init();
  // 永続ストレージを要求（ブラウザによる自動削除を受けにくくする。拒否されても動作は続行）
  try { await navigator.storage?.persist?.(); } catch { /* noop */ }
  createRoot(document.getElementById('root')!).render(
    <StrictMode>
      <App />
      <UpdateBar />
    </StrictMode>,
  );
}
void start();
