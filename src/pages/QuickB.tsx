// 科目Bの短時間学習：擬似言語の読み方・短いコード・セキュリティ用語を単語帳感覚で
import { useMemo, useState } from 'react';
import { useApp, useStore } from '../app/context';
import { pick, startSession } from '../app/session';
import { Link } from '../app/router';

const GROUPS = [
  { id: 'B2', label: '処理の基本要素', desc: '型・変数・配列・演算子・条件分岐・繰返し・関数' },
  { id: 'B3', label: 'データ構造とアルゴリズム', desc: '探索・整列・スタック・キュー・リスト・木・再帰' },
  { id: 'B1', label: 'プログラム全般', desc: 'トレース・テスト・デバッグの考え方' },
  { id: 'B4', label: 'データサイエンス・AIの題材', desc: '統計量・行列・類似度などを扱うプログラム' },
  { id: 'B5', label: '情報セキュリティ', desc: '管理策・マルウェア対策・ログ・アクセス管理' },
];

export default function QuickB() {
  const { content } = useApp();
  const st = useStore();
  const [groups, setGroups] = useState<string[]>([]);
  const [count, setCount] = useState(10);
  const pool = useMemo(() => content!.questions.filter((q) => q.subject === 'B' && q.depth === 'quick' &&
    (groups.length === 0 || q.topicIds.some((t) => groups.includes(t)))), [content, groups]);
  const inputable = pool.filter((q) => q.acceptedInputs?.length || q.questionType === 'input').length;

  return (
    <div className="stack">
      <h1 tabIndex={-1}>科目B 短時間学習</h1>
      <p className="muted small">1問30秒〜1分で解ける短い問題です。長いプログラムの読解は <Link to="/deep">計算・プログラム読解</Link> で練習できます。</p>
      <div className="card">
        <div className="field">
          <span className="label">テーマ</span>
          <div className="chips">
            <button className="chip" aria-pressed={groups.length === 0} onClick={() => setGroups([])}>すべて</button>
            {GROUPS.map((g) => (
              <button key={g.id} className="chip" aria-pressed={groups.includes(g.id)} title={g.desc}
                onClick={() => setGroups(groups.includes(g.id) ? groups.filter((x) => x !== g.id) : [...groups, g.id])}>{g.label}</button>
            ))}
          </div>
        </div>
        <div className="field">
          <span className="label">問題数</span>
          <div className="segmented" role="group" aria-label="問題数">
            {[5, 10, 20, 50].map((n) => <button key={n} aria-pressed={count === n} onClick={() => setCount(n)}>{n}問</button>)}
          </div>
        </div>
        <div className="field">
          <label className="row">
            <input type="checkbox" checked={st.settings.quickBInput} onChange={(e) => st.updateSettings({ quickBInput: e.target.checked })} />
            文字入力で解答する（対応する問題のみ・{inputable}問）
          </label>
          <span className="xsmall muted">入力式では全角/半角・空白の違いは許容し、演算子や記号の違いは区別して採点します。</span>
        </div>
        <p className="small muted">対象：{pool.length}問</p>
        <button className="btn primary lg block" disabled={!pool.length} onClick={() => startSession('quickB', '科目B 短時間学習', pick(pool, 'standard', count))}>開始する</button>
      </div>
    </div>
  );
}
