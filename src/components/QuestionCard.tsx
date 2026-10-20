// 一問一答の表示。回答前は正解の情報を一切描画しない（解答前に正解が漏れないようにする）。
import { useEffect, useRef, useState, type FormEvent } from 'react';
import type { Question } from '../types';
import { useApp } from '../app/context';
import { RichText } from './RichText';
import { CodeBlock } from './CodeBlock';
import { ICheck, ICross, IEyeOff } from './Icons';
import { isAcceptedInput } from '../lib/text';
import { Explanation } from './Explanation';

export const LETTERS = ['ア', 'イ', 'ウ', 'エ', 'オ', 'カ', 'キ', 'ク', 'ケ', 'コ'];
const DIFF = ['', '基礎', '標準', '応用'];

export function QuestionHeader({ q, index, total }: { q: Question; index?: number; total?: number }) {
  const { categoryName } = useApp();
  return (
    <div className="q-head">
      {index !== undefined && total !== undefined && <span className="tag primary">{index + 1} / {total}</span>}
      <span className="tag">科目{q.subject}</span>
      <span>{categoryName(q.category)}</span>
      <span className="tag">{DIFF[q.difficulty]}</span>
      {q.source.kind === 'ipa' && <span className="tag warn">IPA公開問題</span>}
      {q.depth === 'deep' && <span className="tag">じっくり</span>}
    </div>
  );
}

export function QuestionBody({ q }: { q: Question }) {
  return (
    <>
      <div className="q-text"><RichText text={q.questionText} /></div>
      {q.code && <CodeBlock code={q.code} />}
    </>
  );
}

export interface QuestionCardProps {
  q: Question;
  order: number[];
  hidden: number[];
  onHiddenChange: (h: number[]) => void;
  answered: { chosen: number; correct: boolean; input?: string } | null;
  onAnswer: (chosen: number, correct: boolean, timeMs: number, input?: string) => void;
  index?: number;
  total?: number;
  inputMode?: boolean;
}

export function QuestionCard({ q, order, hidden, onHiddenChange, answered, onAnswer, index, total, inputMode }: QuestionCardProps) {
  const shownAt = useRef(Date.now());
  const [input, setInput] = useState('');
  const resultRef = useRef<HTMLDivElement>(null);
  useEffect(() => { shownAt.current = Date.now(); setInput(''); }, [q.id]);
  useEffect(() => { if (answered) resultRef.current?.focus({ preventScroll: false }); }, [answered]);

  const useInput = q.questionType === 'input' || (inputMode && q.acceptedInputs && q.acceptedInputs.length > 0);

  const choose = (orig: number) => {
    if (answered) return;
    onAnswer(orig, orig === q.correctAnswer, Date.now() - shownAt.current);
  };

  // キーボード操作：1〜9 または a〜j で選択
  useEffect(() => {
    if (answered || useInput) return;
    const h = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement || e.metaKey || e.ctrlKey || e.altKey) return;
      const n = /^[1-9]$/.test(e.key) ? Number(e.key) - 1 : /^[a-j]$/i.test(e.key) ? e.key.toLowerCase().charCodeAt(0) - 97 : -1;
      if (n >= 0 && n < order.length && !hidden.includes(order[n])) {
        e.preventDefault();
        choose(order[n]);
      }
    };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  });

  const submitInput = (e: FormEvent) => {
    e.preventDefault();
    if (!input.trim() || answered) return;
    const accepted = [...(q.acceptedInputs ?? []), q.choices[q.correctAnswer]];
    const ok = isAcceptedInput(input, accepted);
    onAnswer(ok ? q.correctAnswer : -1, ok, Date.now() - shownAt.current, input);
  };

  const toggleHidden = (orig: number) => {
    onHiddenChange(hidden.includes(orig) ? hidden.filter((x) => x !== orig) : [...hidden, orig]);
  };

  return (
    <article className="card" aria-labelledby={`q-${q.id}`}>
      <QuestionHeader q={q} index={index} total={total} />
      <h2 id={`q-${q.id}`} className="sr-only">問題 {index !== undefined ? index + 1 : ''}</h2>
      <QuestionBody q={q} />
      {useInput ? (
        <form onSubmit={submitInput} className="stack">
          <div className="field">
            <label htmlFor={`in-${q.id}`}>解答を入力</label>
            <input id={`in-${q.id}`} type="text" autoComplete="off" autoCapitalize="off" spellCheck={false}
              value={answered ? answered.input ?? '' : input} onChange={(e) => setInput(e.target.value)} disabled={Boolean(answered)}
              placeholder="例：mod" />
            <span className="xsmall muted">全角・半角や空白の違いは区別しません。記号や演算子の違いは区別します。</span>
          </div>
          {!answered && <button className="btn primary block" type="submit" disabled={!input.trim()}>解答する</button>}
        </form>
      ) : (
        <ul className="choices" aria-label="選択肢">
          {order.map((orig, i) => {
            const isHidden = hidden.includes(orig);
            let cls = 'choice';
            if (answered) {
              if (orig === q.correctAnswer) cls += ' correct';
              else if (orig === answered.chosen) cls += ' wrong';
              else cls += ' dimmed';
            }
            return (
              <li key={orig} className="choice-row">
                <button type="button" className={cls} onClick={() => choose(orig)} disabled={Boolean(answered) || isHidden}
                  aria-label={`${LETTERS[i]}：${q.choices[orig]}${answered && orig === q.correctAnswer ? '（正解）' : ''}${answered && orig === answered.chosen && orig !== q.correctAnswer ? '（あなたの解答）' : ''}`}>
                  <span className="label" aria-hidden="true">
                    {answered && orig === q.correctAnswer ? <ICheck width={18} /> : answered && orig === answered.chosen ? <ICross width={18} /> : LETTERS[i]}
                  </span>
                  <span className={isHidden ? 'body choice-hidden' : 'body'}><RichText text={q.choices[orig]} /></span>
                </button>
                {!answered && (
                  <button type="button" className="hide-btn" aria-pressed={isHidden} onClick={() => toggleHidden(orig)}
                    aria-label={`${LETTERS[i]} を${isHidden ? '再表示' : '一時的に消す'}`} title={isHidden ? '再表示' : '消去法で一時的に消す'}>
                    <IEyeOff width={18} />
                  </button>
                )}
              </li>
            );
          })}
        </ul>
      )}
      <div ref={resultRef} tabIndex={-1} aria-live="polite">
        {answered && (
          <>
            <div className={answered.correct ? 'result-banner ok' : 'result-banner ng'}>
              {answered.correct ? <ICheck /> : <ICross />}
              {answered.correct ? '正解' : '不正解'}
              {useInput && !answered.correct && <span className="small" style={{ fontWeight: 600 }}>正解：{q.choices[q.correctAnswer]}</span>}
            </div>
            <Explanation q={q} order={order} chosen={answered.chosen} />
          </>
        )}
      </div>
    </article>
  );
}
