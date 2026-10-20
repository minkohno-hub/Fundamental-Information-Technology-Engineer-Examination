// 教材データ（問題・辞典・参考書など）の取得と端末内キャッシュ。
// manifest.json に列挙されたファイルを Cache Storage に保存し、全ファイルの保存を確認できたら
// 「オフライン準備完了」とする。ファイル名に内容のハッシュを含むため、更新時は差分だけ取得される。
import type { ContentManifest, GlossaryTerm, Lesson, Question, ReferenceChapter, Syllabus } from '../types';

const CACHE = 'fe-content-v1';
const BASE = new URL('./data/', document.baseURI).href;

export interface Coverage {
  leafTotal: number;
  leafCovered: number;
  middles: { no: string; name: string; field: string; questions: number; verified: number; leafTotal: number; leafCovered: number; uncovered: string[] }[];
  subjectB: { id: string; name: string; questions: number }[];
}

export interface SourcesDoc {
  checkedAt: string;
  official: { name: string; url: string; note: string }[];
  license: Record<string, string>;
  disclaimer: string;
}

export interface SyllabusData extends Syllabus {
  subjectB: { id: string; area: string; name: string; desc: string }[];
}

export interface Content {
  manifest: ContentManifest;
  questions: Question[];
  byId: Map<string, Question>;
  syllabus: SyllabusData;
  glossary: GlossaryTerm[];
  termById: Map<string, GlossaryTerm>;
  reference: ReferenceChapter[];
  lessons: Lesson[];
  coverage: Coverage;
  sources: SourcesDoc;
}

export interface LoadProgress {
  loaded: number;
  total: number;
  bytesLoaded: number;
  bytesTotal: number;
  fromCache: number;
}

const hasCaches = () => typeof caches !== 'undefined';

async function fetchManifest(): Promise<ContentManifest> {
  const url = BASE + 'manifest.json';
  try {
    const res = await fetch(url, { cache: 'no-cache' });
    if (!res.ok) throw new Error(String(res.status));
    if (hasCaches()) {
      const c = await caches.open(CACHE);
      await c.put(url, res.clone());
    }
    return (await res.json()) as ContentManifest;
  } catch (e) {
    if (hasCaches()) {
      const cached = await caches.match(url, { cacheName: CACHE });
      if (cached) return (await cached.json()) as ContentManifest;
    }
    throw new Error(`教材データの一覧を取得できませんでした（${(e as Error).message}）。初回はインターネットに接続してください`);
  }
}

async function getFile(path: string): Promise<{ data: unknown; cached: boolean }> {
  const url = BASE + path;
  if (hasCaches()) {
    const cached = await caches.match(url, { cacheName: CACHE });
    if (cached) return { data: await cached.json(), cached: true };
  }
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${path} を取得できませんでした（${res.status}）`);
  if (hasCaches()) {
    const c = await caches.open(CACHE);
    await c.put(url, res.clone());
  }
  return { data: await res.json(), cached: false };
}

/** 現在の manifest に含まれないファイルをキャッシュから削除する */
async function pruneCache(manifest: ContentManifest) {
  if (!hasCaches()) return;
  const c = await caches.open(CACHE);
  const keep = new Set([BASE + 'manifest.json', ...manifest.files.map((f) => BASE + f.path)]);
  for (const req of await c.keys()) if (!keep.has(req.url)) await c.delete(req);
}

export async function loadContent(onProgress: (p: LoadProgress) => void): Promise<Content> {
  const manifest = await fetchManifest();
  const total = manifest.files.length;
  const bytesTotal = manifest.files.reduce((a, f) => a + f.bytes, 0);
  const prog: LoadProgress = { loaded: 0, total, bytesLoaded: 0, bytesTotal, fromCache: 0 };
  onProgress({ ...prog });
  const results = new Map<string, unknown>();
  const questions: Question[] = [];
  // 小さいファイル（シラバス・辞典など）を先に、問題データは並列に取得する
  const order = [...manifest.files].sort((a, b) => (a.kind === 'questions' ? 1 : 0) - (b.kind === 'questions' ? 1 : 0));
  await Promise.all(order.map(async (f) => {
    const { data, cached } = await getFile(f.path);
    if (f.kind === 'questions') questions.push(...(data as Question[]));
    else results.set(f.name, data);
    prog.loaded++;
    prog.bytesLoaded += f.bytes;
    if (cached) prog.fromCache++;
    onProgress({ ...prog });
  }));
  void pruneCache(manifest);
  questions.sort((a, b) => a.id.localeCompare(b.id, 'ja', { numeric: true }));
  const glossary = (results.get('glossary') as GlossaryTerm[]) ?? [];
  return {
    manifest,
    questions,
    byId: new Map(questions.map((q) => [q.id, q])),
    syllabus: results.get('syllabus') as SyllabusData,
    glossary,
    termById: new Map(glossary.map((t) => [t.id, t])),
    reference: (results.get('reference') as ReferenceChapter[]) ?? [],
    lessons: ((results.get('lessons') as Lesson[]) ?? []).sort((a, b) => a.order - b.order),
    coverage: results.get('coverage') as Coverage,
    sources: results.get('sources') as SourcesDoc,
  };
}

export interface OfflineStatus {
  contentCached: boolean;
  shellCached: boolean;
  swActive: boolean;
  missing: string[];
}

/** 教材データとアプリ本体が実際に端末内へ保存されているかを確認する */
export async function checkOffline(manifest: ContentManifest): Promise<OfflineStatus> {
  const missing: string[] = [];
  let shellCached = false;
  if (hasCaches()) {
    for (const f of manifest.files) {
      const hit = await caches.match(BASE + f.path, { cacheName: CACHE });
      if (!hit) missing.push(f.name);
    }
    const index = new URL('./index.html', document.baseURI).href;
    shellCached = Boolean(await caches.match(index, { ignoreSearch: true }));
  } else {
    missing.push('（このブラウザは Cache Storage に対応していません）');
  }
  const swActive = Boolean(typeof navigator !== 'undefined' && navigator.serviceWorker?.controller);
  return { contentCached: missing.length === 0, shellCached, swActive, missing };
}
