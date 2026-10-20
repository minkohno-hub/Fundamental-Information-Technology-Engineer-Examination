import { createContext, useContext, useSyncExternalStore } from 'react';
import type { Content, LoadProgress } from '../data/content';
import { store } from '../data/store';

export interface AppState {
  content: Content | null;
  progress: LoadProgress | null;
  loadError: string | null;
  categoryName: (cat: string) => string;
  reload: () => void;
}

export const AppContext = createContext<AppState>({
  content: null,
  progress: null,
  loadError: null,
  categoryName: (c) => c,
  reload: () => {},
});

export function useApp() {
  return useContext(AppContext);
}

/** 学習データの変更を購読する（変更のたびに再描画） */
export function useStore() {
  useSyncExternalStore(store.subscribe, store.getVersion);
  return store;
}
