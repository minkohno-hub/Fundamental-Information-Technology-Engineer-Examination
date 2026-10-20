// 擬似言語の実行シミュレーター。事前に全ステップを記録し、進む・戻る・最初からを即座に切り替える。
import { useMemo, useState, useEffect } from 'react';
import type { SimulationSpec } from '../types';
import { runProgram, type SnapValue, type TraceStep } from '../pseudo/interpreter';
import { CodeBlock } from './CodeBlock';
import { IArrowL, IArrowR, IReset, IPlay } from './Icons';

function fmt(v: SnapValue): string {
  if (v === null) return '未定義';
  if (typeof v === 'string') return `"${v}"`;
  if (typeof v === 'number') return Number.isInteger(v) ? String(v) : String(Math.round(v * 1e6) / 1e6);
  if (typeof v === 'boolean') return String(v);
  if (Array.isArray(v)) return `{${v.map(fmt).join(', ')}}`;
  return `{${Object.entries(v).map(([k, x]) => `${k}: ${fmt(x)}`).join(', ')}}`;
}

function ValueView({ v }: { v: SnapValue }) {
  if (Array.isArray(v) && v.every((x) => !Array.isArray(x) && (x === null || typeof x !== 'object'))) {
    return (
      <span className="arr-cells" aria-label={`配列 ${fmt(v)}`}>
        {v.length === 0 ? <span>空</span> : v.map((x, i) => <span key={i}><small>[{i + 1}]</small>{fmt(x)}</span>)}
      </span>
    );
  }
  if (Array.isArray(v) && v.every(Array.isArray)) {
    return (
      <table className="var-table" style={{ width: 'auto' }}>
        <tbody>{(v as SnapValue[][]).map((row, i) => <tr key={i}><td>[{i + 1}]</td>{row.map((x, j) => <td key={j}>{fmt(x)}</td>)}</tr>)}</tbody>
      </table>
    );
  }
  return <>{fmt(v)}</>;
}

export function Simulator({ spec }: { spec: SimulationSpec }) {
  const result = useMemo(() => {
    try {
      return { ok: true as const, r: runProgram(spec.program, spec.entry, spec.args ?? [], { trace: true, maxTrace: 5000 }) };
    } catch (e) {
      return { ok: false as const, error: (e as Error).message };
    }
  }, [spec]);
  const [i, setI] = useState(0);
  const [showHistory, setShowHistory] = useState(false);
  useEffect(() => setI(0), [spec]);

  if (!result.ok) return <div className="notice ng">シミュレーションを実行できませんでした：{result.error}</div>;
  const trace = result.r.trace;
  const step: TraceStep = trace[Math.min(i, trace.length - 1)];
  const prev = i > 0 ? trace[i - 1] : null;
  const frame = step.frames[step.frames.length - 1];
  const prevFrame = prev?.frames[prev.frames.length - 1];
  const changed = (name: string, v: SnapValue) => prevFrame && prevFrame.name === frame.name && JSON.stringify(prevFrame.vars[name]) !== JSON.stringify(v);
  const loops = Object.entries(step.loopCounts);
  const callLabel = spec.entry ? `${spec.entry}(${(spec.args ?? []).map((a) => fmt(a as SnapValue)).join(', ')})` : 'プログラム';

  return (
    <section className="card sim" aria-label="実行シミュレーター">
      <div className="row between">
        <h3 style={{ margin: 0 }}>実行シミュレーター：{callLabel}</h3>
        <span className="small muted">ステップ {i + 1} / {trace.length}</span>
      </div>
      {spec.note && <p className="small muted" style={{ margin: 0 }}>{spec.note}</p>}
      <div className="sim-controls">
        <button className="btn sm" onClick={() => setI(0)} disabled={i === 0}><IReset width={18} />最初から</button>
        <button className="btn sm" onClick={() => setI((x) => Math.max(0, x - 1))} disabled={i === 0} aria-label="1ステップ戻る"><IArrowL width={18} />戻る</button>
        <button className="btn sm primary" onClick={() => setI((x) => Math.min(trace.length - 1, x + 1))} disabled={i >= trace.length - 1} aria-label="1ステップ進む">進む<IArrowR width={18} /></button>
        <button className="btn sm" onClick={() => setI(trace.length - 1)} disabled={i >= trace.length - 1}><IPlay width={16} />最後まで</button>
      </div>
      <div className="sim-note" aria-live="polite">{step.line}行目：{step.note}</div>
      <div className="sim split">
        <CodeBlock code={spec.program} activeLine={step.line} label="実行中のプログラム" />
        <div className="stack">
          <div>
            <h4 className="small" style={{ margin: '0 0 6px' }}>変数（{frame.name}）</h4>
            <table className="var-table">
              <tbody>
                {Object.keys(frame.vars).length === 0 && <tr><td colSpan={2} className="muted">まだ変数はありません</td></tr>}
                {Object.entries(frame.vars).map(([k, v]) => (
                  <tr key={k} className={changed(k, v) ? 'changed' : undefined}><td>{k}</td><td><ValueView v={v} /></td></tr>
                ))}
              </tbody>
            </table>
          </div>
          {Object.keys(step.globals).length > 0 && (
            <div>
              <h4 className="small" style={{ margin: '0 0 6px' }}>大域変数</h4>
              <table className="var-table"><tbody>{Object.entries(step.globals).map(([k, v]) => <tr key={k}><td>{k}</td><td><ValueView v={v} /></td></tr>)}</tbody></table>
            </div>
          )}
          {step.frames.length > 2 && (
            <p className="small muted" style={{ margin: 0 }}>呼出しの深さ：{step.frames.length - 1}（{step.frames.slice(1).map((f) => f.name).join(' → ')}）</p>
          )}
          {loops.length > 0 && (
            <p className="small" style={{ margin: 0 }}>繰返し回数：{loops.map(([line, n]) => `${line}行目 ${n}回`).join('、')}</p>
          )}
          {step.output.length > 0 && <p className="small" style={{ margin: 0 }}>出力：{step.output.join(' ')}</p>}
        </div>
      </div>
      <details open={showHistory} onToggle={(e) => setShowHistory((e.target as HTMLDetailsElement).open)}>
        <summary>実行履歴</summary>
        {showHistory && (
          <ol className="small" style={{ maxHeight: 240, overflowY: 'auto', paddingLeft: '2.4em' }}>
            {trace.slice(0, i + 1).map((t, k) => <li key={k}>{t.line}行目：{t.note}</li>)}
          </ol>
        )}
      </details>
      {result.r.traceTruncated && <p className="xsmall muted">記録できるステップ数の上限に達したため、途中までを表示しています。</p>}
    </section>
  );
}
