// 擬似言語プログラムの表示（行番号・空欄の強調・実行中の行の強調）
import { useEffect, useRef } from 'react';

export function CodeBlock({ code, activeLine, label = 'プログラム' }: { code: string; activeLine?: number; label?: string }) {
  const lines = code.replace(/\s+$/, '').split('\n');
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (activeLine === undefined || !ref.current) return;
    const el = ref.current.querySelector<HTMLElement>(`[data-line="${activeLine}"]`);
    if (!el) return;
    const box = ref.current.getBoundingClientRect();
    const r = el.getBoundingClientRect();
    if (r.top < box.top || r.bottom > box.bottom) el.scrollIntoView({ block: 'nearest' });
  }, [activeLine]);
  return (
    <div className="code" ref={ref} role="region" aria-label={label} tabIndex={0} style={activeLine !== undefined ? { maxHeight: '60vh', overflowY: 'auto' } : undefined}>
      {lines.map((l, i) => (
        <div key={i} className={activeLine === i + 1 ? 'ln active' : 'ln'} data-line={i + 1} aria-current={activeLine === i + 1 ? 'step' : undefined}>
          <span className="no">{i + 1}</span>
          <span className="src">{renderBlanks(l)}</span>
        </div>
      ))}
    </div>
  );
}

function renderBlanks(line: string) {
  const parts = line.split(/(【[a-z]】)/);
  return parts.map((p, i) => (/^【[a-z]】$/.test(p) ? <span key={i} className="blank" aria-label={`空欄${p[1]}`}>{p[1]}</span> : p));
}
