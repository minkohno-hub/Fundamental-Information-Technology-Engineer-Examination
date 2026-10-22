import { useMemo, useState } from 'react';
import { useApp, useStore } from '../app/context';
import { pick, startSession } from '../app/session';
import type { SelectMode } from '../lib/selection';
import type { Question } from '../types';

export const MODES: { v: SelectMode; label: string; desc: string }[] = [
  { v: 'standard', label: 'おまかせ（標準）', desc: '未回答を中心に、間違えた問題・復習時期の問題を適度に混ぜます' },
  { v: 'unanswered', label: '未回答優先', desc: 'まだ解いていない問題だけを分野が偏らないように出題' },
  { v: 'weakCategory', label: '苦手分野優先', desc: '正答率の低い分野の問題を優先' },
  { v: 'review', label: '復習優先', desc: '間違えた問題・理解度が低い問題・復習時期の問題' },
  { v: 'random', label: 'ランダム', desc: '条件に合う問題から無作為に出題' },
  { v: 'favorite', label: 'お気に入り', desc: 'お気に入りに登録した問題' },
  { v: 'flagged', label: '見直しフラグ', desc: '見直しフラグを付けた問題' },
  { v: 'notUnderstood', label: '「理解できない」', desc: '理解度を「理解できない」にした問題' },
  { v: 'reviewUnderstanding', label: '「復習したい」', desc: '理解度を「復習したい」にした問題' },
];

export function CategoryChips({ cats, selected, onChange }: { cats: string[]; selected: string[]; onChange: (c: string[]) => void }) {
  const { categoryName } = useApp();
  return (
    <div className="chips" role="group" aria-label="分野">
      <button className="chip" aria-pressed={selected.length === 0} onClick={() => onChange([])}>すべて</button>
      {cats.map((c) => (
        <button key={c} className="chip" aria-pressed={selected.includes(c)}
          onClick={() => onChange(selected.includes(c) ? selected.filter((x) => x !== c) : [...selected, c])}>
          {/^\d+$/.test(c) ? `${c}. ` : ''}{categoryName(c)}
        </button>
      ))}
    </div>
  );
}

export default function PracticeSetup() {
  const { content } = useApp();
  const st = useStore();
  const [subject, setSubject] = useState<'all' | 'A' | 'B'>('all');
  const [cats, setCats] = useState<string[]>([]);
  const [mode, setMode] = useState<SelectMode>('standard');
  const [includeDeep, setIncludeDeep] = useState(false);
  const [source, setSource] = useState<'all' | 'ipa' | 'original'>('all');
  const [levels, setLevels] = useState<number[]>([]);
  const [count, setCount] = useState(st.settings.defaultCount);

  const allCats = useMemo(() => {
    const s = new Set<string>();
    for (const q of content!.questions) if (subject === 'all' || q.subject === subject) s.add(q.category);
    return [...s].sort((a, b) => (a.startsWith('B') ? 100 : Number(a)) - (b.startsWith('B') ? 100 : Number(b)) || a.localeCompare(b));
  }, [content, subject]);

  const pool = useMemo(() => content!.questions.filter((q: Question) =>
    (subject === 'all' || q.subject === subject) &&
    (cats.length === 0 || cats.includes(q.category)) &&
    (includeDeep || q.depth === 'quick') &&
    (levels.length === 0 || levels.includes(q.difficulty)) &&
    (source === 'all' || q.source.kind === source)), [content, subject, cats, includeDeep, source, levels]);

  const start = () => {
    const qs = pick(pool, mode, count);
    if (!startSession('practice', MODES.find((m) => m.v === mode)!.label + '演習', qs)) {
      alert('条件に合う問題がありません。条件を変えてください。');
    }
  };

  const hardPool = useMemo(() => content!.questions.filter((q: Question) => q.difficulty >= 3 && (subject === 'all' || q.subject === subject) && (cats.length === 0 || cats.includes(q.category)) && (includeDeep || q.depth === 'quick')), [content, subject, cats, includeDeep]);
  const startHard = () => {
    const qs = pick(hardPool, 'standard', count);
    if (!startSession('practice', '高難度特訓', qs)) alert('条件に合う問題がありません。条件を変えてください。');
  };

  return (
    <div className="stack">
      <h1 tabIndex={-1}>問題演習</h1>
      <div className="card">
        <h2 style={{ marginTop: 0 }}>高難度特訓</h2>
        <p className="small muted">応用・高難度の問題だけを出題します（出題範囲は通常と同じシラバスの範囲内です）。下の科目・分野・問題数の設定が使えます。本番形式の模擬試験には高難度の問題は含まれません。</p>
        <button className="btn primary block" onClick={startHard} disabled={hardPool.length === 0}>高難度特訓を始める（対象 {hardPool.length}問）</button>
      </div>
      <div className="card">
        <div className="field">
          <span className="label">科目</span>
          <div className="segmented" role="group" aria-label="科目">
            {(['all', 'A', 'B'] as const).map((s) => (
              <button key={s} aria-pressed={subject === s} onClick={() => { setSubject(s); setCats([]); }}>{s === 'all' ? '両方' : `科目${s}`}</button>
            ))}
          </div>
        </div>
        <div className="field">
          <span className="label">分野</span>
          <CategoryChips cats={allCats} selected={cats} onChange={setCats} />
        </div>
        <div className="field">
          <label htmlFor="mode">出題方法</label>
          <select id="mode" value={mode} onChange={(e) => setMode(e.target.value as SelectMode)}>
            {MODES.map((m) => <option key={m.v} value={m.v}>{m.label}</option>)}
          </select>
          <span className="small muted">{MODES.find((m) => m.v === mode)!.desc}</span>
        </div>
        <div className="field">
          <span className="label">問題数</span>
          <div className="segmented" role="group" aria-label="問題数">
            {[5, 10, 20, 50].map((n) => <button key={n} aria-pressed={count === n} onClick={() => setCount(n)}>{n}問</button>)}
          </div>
        </div>
        <details>
          <summary>詳細な条件</summary>
          <div className="field">
            <label className="row"><input type="checkbox" checked={includeDeep} onChange={(e) => setIncludeDeep(e.target.checked)} /> 計算・長いプログラムの問題も含める</label>
          </div>
          <div className="field">
            <span className="label">難易度</span>
            <div className="chips" role="group" aria-label="難易度">
              <button className="chip" aria-pressed={levels.length === 0} onClick={() => setLevels([])}>すべて</button>
              {[[1, '基礎'], [2, '標準'], [3, '応用'], [4, '高難度']].map(([n, l]) => (
                <button key={n} className="chip" aria-pressed={levels.includes(n as number)}
                  onClick={() => setLevels(levels.includes(n as number) ? levels.filter((x) => x !== n) : [...levels, n as number])}>{l}</button>
              ))}
            </div>
          </div>
          <div className="field">
            <span className="label">出典</span>
            <div className="segmented" role="group" aria-label="出典">
              <button aria-pressed={source === 'all'} onClick={() => setSource('all')}>すべて</button>
              <button aria-pressed={source === 'ipa'} onClick={() => setSource('ipa')}>IPA公開問題</button>
              <button aria-pressed={source === 'original'} onClick={() => setSource('original')}>オリジナル</button>
            </div>
          </div>
        </details>
        <p className="small muted">対象：{pool.length}問</p>
        <button className="btn primary lg block" onClick={start} disabled={pool.length === 0}>開始する</button>
      </div>
    </div>
  );
}
