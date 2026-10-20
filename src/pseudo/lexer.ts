// IPA 擬似言語（基本情報技術者試験用の記述形式）の字句解析。
// 識別子は ASCII 英数字とする。日本語の定型句（「の要素数」「未定義の値」など）は専用トークンにする。

export type TokKind =
  | 'num' | 'str' | 'ident' | 'op' | 'lparen' | 'rparen' | 'lbrack' | 'rbrack'
  | 'lbrace' | 'rbrace' | 'comma' | 'dot' | 'colon' | 'kw' | 'len' | 'rows' | 'cols' | 'undef' | 'count' | 'eof';

export interface Token {
  kind: TokKind;
  value: string;
  pos: number;
}

export class PseudoError extends Error {
  line?: number;
  constructor(message: string, line?: number) {
    super(line ? `${line}行目: ${message}` : message);
    this.line = line;
  }
}

const KEYWORDS = new Set(['and', 'or', 'not', 'mod', 'true', 'false']);

/** 全角記号などを擬似言語の標準記号に揃える */
export function normalizeSymbols(src: string): string {
  return src
    .replace(/[＋]/g, '+')
    .replace(/[－−‐]/g, '-')
    .replace(/[＝]/g, '=')
    .replace(/[＜]/g, '<')
    .replace(/[＞]/g, '>')
    .replace(/[（]/g, '(')
    .replace(/[）]/g, ')')
    .replace(/[［]/g, '[')
    .replace(/[］]/g, ']')
    .replace(/[，]/g, ',')
    .replace(/[：]/g, ':')
    .replace(/[　]/g, ' ')
    .replace(/≤/g, '≦')
    .replace(/≥/g, '≧')
    .replace(/[“”]/g, '"')
    .replace(/[０-９]/g, (d) => String.fromCharCode(d.charCodeAt(0) - 0xfee0))
    .replace(/[Ａ-Ｚａ-ｚ]/g, (d) => String.fromCharCode(d.charCodeAt(0) - 0xfee0));
}

const OPS = ['←', '≠', '≦', '≧', '<', '>', '=', '+', '-', '×', '÷', '∧', '∨', '▽', '≪', '≫'];

export function tokenize(text: string, line?: number): Token[] {
  const s = normalizeSymbols(text);
  const out: Token[] = [];
  let i = 0;
  while (i < s.length) {
    const c = s[i];
    if (c === ' ' || c === '\t') { i++; continue; }
    if (s.startsWith('の要素数', i)) { out.push({ kind: 'len', value: 'の要素数', pos: i }); i += 4; continue; }
    if (s.startsWith('の行数', i)) { out.push({ kind: 'rows', value: 'の行数', pos: i }); i += 3; continue; }
    if (s.startsWith('の列数', i)) { out.push({ kind: 'cols', value: 'の列数', pos: i }); i += 3; continue; }
    if (s.startsWith('未定義の値', i)) { out.push({ kind: 'undef', value: '未定義', pos: i }); i += 5; continue; }
    if (s.startsWith('未定義', i)) { out.push({ kind: 'undef', value: '未定義', pos: i }); i += 3; continue; }
    if (s.startsWith('個の', i)) { out.push({ kind: 'count', value: '個の', pos: i }); i += 2; continue; }
    if (/[0-9]/.test(c)) {
      let j = i;
      while (j < s.length && /[0-9]/.test(s[j])) j++;
      if (s[j] === '.' && /[0-9]/.test(s[j + 1] ?? '')) {
        j++;
        while (j < s.length && /[0-9]/.test(s[j])) j++;
      }
      out.push({ kind: 'num', value: s.slice(i, j), pos: i });
      i = j;
      continue;
    }
    if (/[A-Za-z_]/.test(c)) {
      let j = i;
      while (j < s.length && /[A-Za-z0-9_]/.test(s[j])) j++;
      const w = s.slice(i, j);
      out.push({ kind: KEYWORDS.has(w) ? 'kw' : 'ident', value: w, pos: i });
      i = j;
      continue;
    }
    if (c === '"' || c === '\'') {
      const end = s.indexOf(c, i + 1);
      if (end < 0) throw new PseudoError('文字列が閉じられていません', line);
      out.push({ kind: 'str', value: s.slice(i + 1, end), pos: i });
      i = end + 1;
      continue;
    }
    const single: Record<string, TokKind> = {
      '(': 'lparen', ')': 'rparen', '[': 'lbrack', ']': 'rbrack', '{': 'lbrace', '}': 'rbrace',
      ',': 'comma', '.': 'dot', ':': 'colon',
    };
    if (single[c]) { out.push({ kind: single[c], value: c, pos: i }); i++; continue; }
    const op = OPS.find((o) => s.startsWith(o, i));
    if (op) { out.push({ kind: 'op', value: op, pos: i }); i += op.length; continue; }
    throw new PseudoError(`解釈できない文字「${c}」があります`, line);
  }
  out.push({ kind: 'eof', value: '', pos: s.length });
  return out;
}
