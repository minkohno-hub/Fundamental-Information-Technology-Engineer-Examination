// 教材テキストの簡易マークアップを React 要素に変換する。HTML 文字列は一切挿入しない（XSS 対策）。
// 対応：空行で段落／改行／**太字**／`コード`／```コードブロック```／| 表 |／- 箇条書き／1. 番号付き／[[用語]]リンク
import { Fragment, type ReactNode } from 'react';
import { useApp } from '../app/context';
import { Link } from '../app/router';
import { normalizeForCompare } from '../lib/text';

function inline(text: string, keyBase: string, termLink: (name: string, key: string) => ReactNode): ReactNode[] {
  const out: ReactNode[] = [];
  const re = /(\*\*[^*]+\*\*|`[^`]+`|\[\[[^\]]+\]\])/g;
  let last = 0;
  let m: RegExpExecArray | null;
  let i = 0;
  while ((m = re.exec(text))) {
    if (m.index > last) out.push(text.slice(last, m.index));
    const tok = m[0];
    const key = `${keyBase}-${i++}`;
    if (tok.startsWith('**')) out.push(<strong key={key}>{tok.slice(2, -2)}</strong>);
    else if (tok.startsWith('`')) out.push(<code key={key} className="inline-code">{tok.slice(1, -1)}</code>);
    else out.push(termLink(tok.slice(2, -2), key));
    last = m.index + tok.length;
  }
  if (last < text.length) out.push(text.slice(last));
  return out;
}

function withBreaks(lines: string[], keyBase: string, termLink: (name: string, key: string) => ReactNode): ReactNode[] {
  return lines.flatMap((l, i) => [i > 0 ? <br key={`${keyBase}-br${i}`} /> : null, ...inline(l, `${keyBase}-l${i}`, termLink)]).filter((x) => x !== null);
}

export function RichText({ text, className }: { text: string; className?: string }) {
  const { content } = useApp();
  const termLink = (name: string, key: string) => {
    const [label, target] = name.split('|');
    const n = normalizeForCompare(target ?? label);
    const t = content?.glossary.find((g) => normalizeForCompare(g.term) === n || (g as { aliases?: string[] }).aliases?.some((a) => normalizeForCompare(a) === n));
    return t ? <Link key={key} to={`/term/${t.id}`} className="term-link">{label}</Link> : <Fragment key={key}>{label}</Fragment>;
  };
  const blocks: ReactNode[] = [];
  const lines = text.replace(/\r\n/g, '\n').split('\n');
  let i = 0;
  let b = 0;
  while (i < lines.length) {
    const line = lines[i];
    const key = `b${b++}`;
    if (line.trim() === '') { i++; continue; }
    if (line.trim().startsWith('```')) {
      const body: string[] = [];
      i++;
      while (i < lines.length && !lines[i].trim().startsWith('```')) body.push(lines[i++]);
      i++;
      blocks.push(<pre key={key} className="code-block"><code>{body.join('\n')}</code></pre>);
      continue;
    }
    if (line.trim().startsWith('|')) {
      const rows: string[][] = [];
      while (i < lines.length && lines[i].trim().startsWith('|')) {
        const cells = lines[i].trim().replace(/^\||\|$/g, '').split('|').map((c) => c.trim());
        if (!cells.every((c) => /^:?-{2,}:?$/.test(c))) rows.push(cells);
        i++;
      }
      const [head, ...body] = rows;
      blocks.push(
        <div key={key} className="table-wrap">
          <table>
            <thead><tr>{head.map((c, j) => <th key={j} scope="col">{inline(c, `${key}h${j}`, termLink)}</th>)}</tr></thead>
            <tbody>{body.map((r, ri) => <tr key={ri}>{r.map((c, j) => <td key={j}>{inline(c, `${key}r${ri}c${j}`, termLink)}</td>)}</tr>)}</tbody>
          </table>
        </div>,
      );
      continue;
    }
    if (/^\s*([-・]|\d+\.)\s/.test(line)) {
      const ordered = /^\s*\d+\.\s/.test(line);
      const items: string[] = [];
      while (i < lines.length && /^\s*([-・]|\d+\.)\s/.test(lines[i])) {
        items.push(lines[i].replace(/^\s*([-・]|\d+\.)\s/, ''));
        i++;
      }
      const L = ordered ? 'ol' : 'ul';
      blocks.push(<L key={key}>{items.map((it, j) => <li key={j}>{inline(it, `${key}i${j}`, termLink)}</li>)}</L>);
      continue;
    }
    const para: string[] = [];
    while (i < lines.length && lines[i].trim() !== '' && !lines[i].trim().startsWith('```') && !lines[i].trim().startsWith('|') && !/^\s*([-・]|\d+\.)\s/.test(lines[i])) {
      para.push(lines[i]);
      i++;
    }
    blocks.push(<p key={key}>{withBreaks(para, key, termLink)}</p>);
  }
  return <div className={className ? `rich ${className}` : 'rich'}>{blocks}</div>;
}
