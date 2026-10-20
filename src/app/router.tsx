// ハッシュ方式のルーター（GitHub Pages のサブパスでもリロードで 404 にならない）
import { useEffect, useSyncExternalStore, type AnchorHTMLAttributes, type MouseEvent } from 'react';

function subscribe(cb: () => void) {
  window.addEventListener('hashchange', cb);
  return () => window.removeEventListener('hashchange', cb);
}
const getHash = () => window.location.hash.slice(1) || '/';

export interface Route {
  path: string;
  parts: string[];
  query: URLSearchParams;
}

export function useRoute(): Route {
  const hash = useSyncExternalStore(subscribe, getHash, () => '/');
  const [path, qs] = hash.split('?');
  return { path, parts: path.split('/').filter(Boolean).map(decodeURIComponent), query: new URLSearchParams(qs ?? '') };
}

export function navigate(to: string, replace = false) {
  const url = '#' + to;
  if (replace) {
    history.replaceState(null, '', url);
    window.dispatchEvent(new HashChangeEvent('hashchange'));
  } else {
    window.location.hash = to;
  }
}

export function Link({ to, onClick, ...rest }: { to: string } & AnchorHTMLAttributes<HTMLAnchorElement>) {
  const handle = (e: MouseEvent<HTMLAnchorElement>) => {
    onClick?.(e);
  };
  return <a href={'#' + to} onClick={handle} {...rest} />;
}

/** ページ遷移時に先頭へスクロールし、見出しへフォーカスを移す（スクリーンリーダー向け） */
export function useScrollTopOnRoute(path: string) {
  useEffect(() => {
    window.scrollTo(0, 0);
    const h = document.querySelector<HTMLElement>('main h1');
    h?.focus({ preventScroll: true });
  }, [path]);
}
