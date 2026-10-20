import { lazy, Suspense, useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import { AppContext, useStore } from './app/context';
import { Link, useRoute, useScrollTopOnRoute } from './app/router';
import { loadContent, type Content, type LoadProgress } from './data/content';
import { IBook, IChart, IDict, IExam, IHome, ILesson, IPlan, IPractice, IReview, ISearch, ISettings, IInfo, ICode } from './components/Icons';
import Home from './pages/Home';
import SessionPage from './pages/Session';

const PracticeSetup = lazy(() => import('./pages/PracticeSetup'));
const QuickB = lazy(() => import('./pages/QuickB'));
const Deep = lazy(() => import('./pages/Deep'));
const ExamSetup = lazy(() => import('./pages/ExamSetup'));
const ExamRun = lazy(() => import('./pages/ExamRun'));
const ExamResult = lazy(() => import('./pages/ExamResult'));
const Analytics = lazy(() => import('./pages/Analytics'));
const Review = lazy(() => import('./pages/Review'));
const Dictionary = lazy(() => import('./pages/Dictionary'));
const TermPage = lazy(() => import('./pages/TermPage'));
const Search = lazy(() => import('./pages/Search'));
const Reference = lazy(() => import('./pages/Reference'));
const Lessons = lazy(() => import('./pages/Lessons'));
const Plan = lazy(() => import('./pages/Plan'));
const SettingsPage = lazy(() => import('./pages/Settings'));
const About = lazy(() => import('./pages/About'));
const QuestionPage = lazy(() => import('./pages/QuestionPage'));
const Reports = lazy(() => import('./pages/Reports'));
const Coverage = lazy(() => import('./pages/Coverage'));

export const APP_VERSION = __APP_VERSION__;

function useCategoryName(content: Content | null) {
  return useCallback((cat: string) => {
    if (cat === 'B-ALG') return '科目B アルゴリズムとプログラミング';
    if (cat === 'B-SEC') return '科目B 情報セキュリティ';
    if (!content) return cat;
    for (const M of content.syllabus.majors) for (const m of M.middles) if (String(m.no) === cat) return m.name;
    return cat;
  }, [content]);
}

const NAV = [
  { to: '/', label: 'ホーム', icon: IHome, match: (p: string) => p === '/' },
  { to: '/practice', label: '演習', icon: IPractice, match: (p: string) => p.startsWith('/practice') || p.startsWith('/session') || p.startsWith('/quick-b') || p.startsWith('/deep') },
  { to: '/exam', label: '模擬試験', icon: IExam, match: (p: string) => p.startsWith('/exam') },
  { to: '/dict', label: '辞典・参考書', icon: IDict, match: (p: string) => p.startsWith('/dict') || p.startsWith('/term') || p.startsWith('/reference') || p.startsWith('/search') || p.startsWith('/lessons') },
  { to: '/analytics', label: '分析', icon: IChart, match: (p: string) => p.startsWith('/analytics') || p.startsWith('/review') },
];
const SIDE_EXTRA = [
  { to: '/quick-b', label: '科目B 短時間学習', icon: ICode },
  { to: '/deep', label: '計算・プログラム', icon: ICode },
  { to: '/review', label: '復習', icon: IReview },
  { to: '/lessons', label: 'プログラミング講座', icon: ILesson },
  { to: '/reference', label: 'コンパクト参考書', icon: IBook },
  { to: '/search', label: '検索', icon: ISearch },
  { to: '/plan', label: '学習プラン', icon: IPlan },
  { to: '/settings', label: '設定・バックアップ', icon: ISettings },
  { to: '/about', label: '出典・このアプリについて', icon: IInfo },
];

function Page({ path, parts }: { path: string; parts: string[] }): ReactNode {
  const [a, b, c] = parts;
  if (path === '/' || !a) return <Home />;
  switch (a) {
    case 'practice': return <PracticeSetup />;
    case 'session': return <SessionPage />;
    case 'quick-b': return <QuickB />;
    case 'deep': return <Deep />;
    case 'exam':
      if (b === 'run') return <ExamRun />;
      if (b === 'result' && c) return <ExamResult id={c} />;
      return <ExamSetup />;
    case 'analytics': return <Analytics />;
    case 'review': return <Review />;
    case 'dict': return <Dictionary />;
    case 'term': return <TermPage key={b} id={b} />;
    case 'search': return <Search />;
    case 'reference': return <Reference key={b ?? 'index'} id={b} />;
    case 'lessons': return <Lessons key={b ?? 'index'} id={b} />;
    case 'plan': return <Plan />;
    case 'settings': return <SettingsPage />;
    case 'about': return <About />;
    case 'q': return <QuestionPage key={b} id={b} />;
    case 'reports': return <Reports />;
    case 'coverage': return <Coverage />;
  }
  return (
    <div className="card">
      <h1 tabIndex={-1}>ページが見つかりません</h1>
      <Link to="/" className="btn">ホームへ</Link>
    </div>
  );
}

export default function App() {
  const route = useRoute();
  const st = useStore();
  const [content, setContent] = useState<Content | null>(null);
  const [progress, setProgress] = useState<LoadProgress | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);
  useScrollTopOnRoute(route.path);

  useEffect(() => {
    let alive = true;
    setLoadError(null);
    loadContent((p) => alive && setProgress(p))
      .then((c) => alive && setContent(c))
      .catch((e: Error) => alive && setLoadError(e.message));
    return () => { alive = false; };
  }, [attempt]);

  // 表示設定の反映
  useEffect(() => {
    const root = document.documentElement;
    root.style.setProperty('--scale', String(st.settings.fontScale));
    if (st.settings.theme === 'system') root.removeAttribute('data-theme');
    else root.setAttribute('data-theme', st.settings.theme);
    root.setAttribute('data-reduce-motion', String(st.settings.reduceMotion));
  }, [st.settings.fontScale, st.settings.theme, st.settings.reduceMotion]);

  const categoryName = useCategoryName(content);
  const ctx = useMemo(() => ({ content, progress, loadError, categoryName, reload: () => setAttempt((x) => x + 1) }), [content, progress, loadError, categoryName]);
  const wide = ['analytics', 'exam', 'coverage', 'about'].includes(route.parts[0] ?? '');
  const needsContent = route.parts[0] !== 'settings' && route.parts[0] !== 'about';

  return (
    <AppContext.Provider value={ctx}>
      <a href="#main" className="skip-link" onClick={(e) => { e.preventDefault(); document.getElementById('main')?.focus(); }}>本文へ移動</a>
      <div className="app">
        <nav className="side-nav" aria-label="メインメニュー">
          <Link to="/" className="brand"><img src="./icon.svg" alt="" />FE 完全学習</Link>
          {NAV.map((n) => (
            <Link key={n.to} to={n.to} className="nav-item" aria-current={n.match(route.path) ? 'page' : undefined}><n.icon />{n.label}</Link>
          ))}
          <div className="nav-sep" />
          {SIDE_EXTRA.map((n) => (
            <Link key={n.to} to={n.to} className="nav-item" aria-current={route.path.startsWith(n.to) ? 'page' : undefined}><n.icon />{n.label}</Link>
          ))}
        </nav>
        <div className="content-col">
          <header className="topbar">
            <Link to="/" className="brand"><img src="./icon.svg" alt="" />FE 完全学習</Link>
            <span className="spacer" />
            <Link to="/search" className="icon-btn" aria-label="検索"><ISearch /></Link>
            <Link to="/settings" className="icon-btn" aria-label="設定"><ISettings /></Link>
          </header>
          {!st.persistent && st.storageError && (
            <div className="notice warn" role="status" style={{ margin: '12px 16px 0' }}>
              端末内に学習データを保存できない状態です（{st.storageError}）。このままでも学習できますが、ページを閉じると記録は消えます。プライベートブラウズを解除するか、別のブラウザをお試しください。
            </div>
          )}
          <main id="main" tabIndex={-1} className={wide ? 'main wide' : 'main'}>
            {needsContent && !content ? (
              <LoadingView progress={progress} error={loadError} retry={() => setAttempt((x) => x + 1)} />
            ) : (
              <Suspense fallback={<div className="loading" aria-busy="true">読み込み中…</div>}>
                <Page path={route.path} parts={route.parts} />
              </Suspense>
            )}
          </main>
        </div>
        <nav className="bottom-nav" aria-label="メインメニュー">
          {NAV.map((n) => (
            <Link key={n.to} to={n.to} aria-current={n.match(route.path) ? 'page' : undefined}><n.icon />{n.label}</Link>
          ))}
        </nav>
      </div>
    </AppContext.Provider>
  );
}

function LoadingView({ progress, error, retry }: { progress: LoadProgress | null; error: string | null; retry: () => void }) {
  if (error) {
    return (
      <div className="card" role="alert">
        <h1 tabIndex={-1}>教材データを読み込めませんでした</h1>
        <p>{error}</p>
        <button className="btn primary" onClick={retry}>再試行</button>
      </div>
    );
  }
  const pct = progress && progress.bytesTotal ? Math.round((progress.bytesLoaded / progress.bytesTotal) * 100) : 0;
  return (
    <div className="loading" aria-busy="true" aria-live="polite">
      <h1 tabIndex={-1} style={{ fontSize: '1.1em' }}>教材データを準備しています</h1>
      <div className="progress" style={{ width: 'min(320px, 80vw)' }}><span style={{ width: `${pct}%` }} /></div>
      <p className="muted small">{progress ? `${progress.loaded} / ${progress.total} ファイル（${pct}%）` : '一覧を確認中…'}</p>
    </div>
  );
}
