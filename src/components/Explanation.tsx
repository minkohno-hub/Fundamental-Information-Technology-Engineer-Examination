// 回答後の詳細解説：正解の理由・各選択肢の正誤理由・基礎知識・関連用語（略語の深掘り）・関連問題・出典
import { useState } from 'react';
import type { Question, GlossaryTerm } from '../types';
import { useApp } from '../app/context';
import { Link } from '../app/router';
import { RichText } from './RichText';
import { LETTERS } from './QuestionCard';
import { StudyTools } from './StudyTools';
import { Simulator } from './Simulator';

export function Explanation({ q, order, chosen, showTools = true }: { q: Question; order: number[]; chosen?: number; showTools?: boolean }) {
  const { content } = useApp();
  const [sim, setSim] = useState(false);
  const terms = q.relatedConcepts.map((id) => content?.termById.get(id)).filter(Boolean) as GlossaryTerm[];
  const related = q.relatedQuestionIds.map((id) => content?.byId.get(id)).filter(Boolean) as Question[];
  return (
    <section className="explain" aria-label="解説">
      <h3>正解：{LETTERS[order.indexOf(q.correctAnswer)]}（{stripMarkup(q.choices[q.correctAnswer])}）</h3>
      <RichText text={q.explanation} />

      <h3>各選択肢の解説</h3>
      <ul className="choice-exp">
        {order.map((orig, i) => (
          <li key={orig} className={orig === q.correctAnswer ? 'is-correct' : undefined}>
            <strong>{LETTERS[i]}{orig === q.correctAnswer ? '（正解）' : ''}{orig === chosen && orig !== q.correctAnswer ? '（あなたの解答）' : ''}：</strong>
            <RichText text={q.choiceExplanations[orig]} />
          </li>
        ))}
      </ul>

      {(q.scopeNote || q.prerequisites || q.difficultyFactors) && (
        <details className="notice small" style={{ marginTop: 12 }}>
          <summary>この問題の出題範囲・前提知識・難しさのポイント</summary>
          {q.scopeNote && <p><strong>出題範囲の根拠：</strong>{q.scopeNote}</p>}
          {q.prerequisites && <p><strong>必要な前提知識：</strong>{q.prerequisites}</p>}
          {q.difficultyFactors && <p><strong>難しくしている要素：</strong>{q.difficultyFactors}</p>}
        </details>
      )}

      {q.knowledge && (
        <>
          <h3>押さえておきたい知識</h3>
          <RichText text={q.knowledge} />
        </>
      )}

      {q.simulation && (
        <div style={{ marginTop: 16 }}>
          {!sim ? (
            <button className="btn" onClick={() => setSim(true)}>実行シミュレーターで動きを確認する</button>
          ) : (
            <Simulator spec={q.simulation} />
          )}
        </div>
      )}

      {terms.length > 0 && (
        <>
          <h3>関連用語</h3>
          <div className="stack">
            {terms.map((t) => <TermMini key={t.id} t={t} />)}
          </div>
        </>
      )}

      {related.length > 0 && (
        <details style={{ marginTop: 12 }}>
          <summary>関連問題（理解度チェック・任意）</summary>
          <ul className="list">
            {related.map((r) => (
              <li key={r.id}><Link className="item" to={`/q/${r.id}`}><span className="grow small">{stripMarkup(r.questionText).slice(0, 70)}…</span></Link></li>
            ))}
          </ul>
        </details>
      )}

      <SourceLine q={q} />
      {showTools && <StudyTools q={q} />}
    </section>
  );
}

export function SourceLine({ q }: { q: Question }) {
  return (
    <p className="xsmall muted" style={{ marginTop: 14 }}>
      問題ID：{q.id}（v{q.contentVersion}）／{q.source.kind === 'ipa' ? (
        <>出典：{q.source.title}{q.source.modified && q.source.modificationNote ? `（${q.source.modificationNote}）` : ''}{q.source.url && <> <a href={q.source.url} target="_blank" rel="noopener noreferrer">原典PDF</a></>}。解説は本アプリ独自です。</>
      ) : (
        <>本アプリのオリジナル問題（シラバス Ver.{q.syllabusVersion} 準拠）</>
      )}
    </p>
  );
}

function TermMini({ t }: { t: GlossaryTerm }) {
  return (
    <div className="notice">
      <div className="term-head">
        <Link to={`/term/${t.id}`}><strong>{t.term}</strong></Link>
        {t.fullName && <span className="small">{t.fullName}</span>}
        {t.japanese && <span className="small muted">（{t.japanese}）</span>}
      </div>
      {t.words && t.words.length > 0 && (
        <p className="small" style={{ margin: '4px 0' }}>{t.words.map((w) => `${w.en}＝${w.ja}`).join('／')}</p>
      )}
      <p className="small" style={{ margin: 0 }}>{t.simple}</p>
    </div>
  );
}

export function stripMarkup(s: string): string {
  return s.replace(/\[\[([^\]|]+)(?:\|[^\]]+)?\]\]/g, '$1').replace(/\*\*|`/g, '').replace(/\n+/g, ' ');
}
