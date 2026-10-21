// IPA 擬似言語の構文解析。行単位の文構造（if/elseif/else/endif など）と Pratt 法による式解析。
import { PseudoError, tokenize, normalizeSymbols, type Token } from './lexer';

export type Expr =
  | { k: 'num'; v: number; isInt: boolean }
  | { k: 'str'; v: string }
  | { k: 'bool'; v: boolean }
  | { k: 'undef' }
  | { k: 'var'; name: string }
  | { k: 'arr'; items: Expr[] }
  | { k: 'fill'; count: Expr; value: Expr }
  | { k: 'fill2'; rows: Expr; cols: Expr; value: Expr }
  | { k: 'fn'; fn: 'sqrt' | 'intpart' | 'sq' | 'nchars' | 'sumall' | 'uniqsort'; e: Expr }
  | { k: 'charAt'; target: Expr; index: Expr }
  | { k: 'sumline'; axis: 'row' | 'col'; target: Expr; index: Expr }
  | { k: 'any'; target: Expr; value: Expr; neg: boolean }
  | { k: 'without'; target: Expr; value: Expr }
  | { k: 'idx'; target: Expr; index: Expr[] }
  | { k: 'mem'; target: Expr; name: string }
  | { k: 'call'; callee: Expr; args: Expr[] }
  | { k: 'len' | 'rows' | 'cols'; target: Expr }
  | { k: 'un'; op: string; e: Expr }
  | { k: 'bin'; op: string; l: Expr; r: Expr };

export interface Declarator { name: string; init?: Expr }

export type Stmt = { line: number } & (
  | { k: 'decl'; type: string; vars: Declarator[]; global: boolean }
  | { k: 'assign'; target: Expr; value: Expr }
  | { k: 'append'; target: Expr; value: Expr }
  | { k: 'output'; value: Expr }
  | { k: 'outputList'; values: Expr[]; sep: string; spread: boolean }
  | { k: 'swap'; a: Expr; b: Expr }
  | { k: 'break'; label?: string }
  | { k: 'expr'; e: Expr }
  | { k: 'return'; value?: Expr }
  | { k: 'if'; branches: { cond: Expr; condText: string; body: Stmt[]; line: number }[]; elseBody?: Stmt[]; elseLine?: number; endLine: number }
  | { k: 'while'; cond: Expr; condText: string; body: Stmt[]; endLine: number; label?: string }
  | { k: 'do'; cond: Expr; condText: string; body: Stmt[]; condLine: number; label?: string }
  | { k: 'for'; v: string; from: Expr; to: Expr; step: Expr; dir: 1 | -1; body: Stmt[]; endLine: number; text: string; label?: string }
  | { k: 'foreach'; v: string; arr: Expr; body: Stmt[]; endLine: number; text: string; label?: string }
  | { k: 'nop' }
);

export interface FuncDef {
  name: string;
  returnType?: string;
  params: { type: string; name: string }[];
  body: Stmt[];
  line: number;
}

export interface Program {
  funcs: Record<string, FuncDef>;
  main: Stmt[];
  lines: string[];
}

// ===== 式 =====

const BIN_PREC: Record<string, number> = {
  or: 1, and: 2,
  '≠': 3, '≦': 3, '≧': 3, '<': 3, '>': 3, '=': 3,
  '+': 4, '-': 4, '∨': 4, '▽': 4,
  '×': 5, '÷': 5, mod: 5, '∧': 5, '≪': 5, '≫': 5,
};

class ExprParser {
  private i = 0;
  constructor(private toks: Token[], private line: number) {}
  private peek() { return this.toks[this.i]; }
  private next() { return this.toks[this.i++]; }
  private expect(kind: Token['kind'], value?: string) {
    const t = this.next();
    if (t.kind !== kind || (value !== undefined && t.value !== value)) {
      throw new PseudoError(`「${value ?? kind}」が必要な位置に「${t.value || '行末'}」があります`, this.line);
    }
    return t;
  }
  atEnd() { return this.peek().kind === 'eof'; }

  parse(minPrec = 0): Expr {
    let left = this.unary();
    for (;;) {
      const t = this.peek();
      if (t.kind === 'ga') {
        // 「左辺 が 右辺 と等しい」「左辺 が 右辺 以下」「左辺 が 未定義」などの日本語の比較表現（関係演算子と同じ優先度）
        if (3 < minPrec) break;
        this.next();
        left = this.japaneseComparison(left);
        continue;
      }
      const op = t.kind === 'op' || t.kind === 'kw' ? t.value : '';
      const prec = BIN_PREC[op];
      if (prec === undefined || prec < minPrec) break;
      this.next();
      const right = this.parse(prec + 1);
      if (op === '÷' && (this.peek().kind === 'quot' || this.peek().kind === 'rem')) {
        // 「a ÷ b の商」「a ÷ b の余り」（整数の除算）
        const q = this.next();
        left = { k: 'bin', op: q.kind, l: left, r: right };
        continue;
      }
      left = { k: 'bin', op, l: left, r: right };
    }
    return left;
  }

  private japaneseComparison(left: Expr): Expr {
    if (this.peek().kind === 'undef') {
      this.next();
      if (this.peek().kind === 'notkw') { this.next(); return { k: 'bin', op: '≠', l: left, r: { k: 'undef' } }; }
      return { k: 'bin', op: '=', l: left, r: { k: 'undef' } };
    }
    const right = this.parse(4);
    if (this.peek().kind === 'valof') this.next(); // 「xの値と等しい」
    const c = this.next();
    if (c.kind !== 'cmp') throw new PseudoError(`「と等しい」「以下」などの比較表現が必要な位置に「${c.value || '行末'}」があります`, this.line);
    return { k: 'bin', op: c.value, l: left, r: right };
  }

  private unary(): Expr {
    const t = this.peek();
    if ((t.kind === 'kw' && t.value === 'not') || (t.kind === 'op' && (t.value === '-' || t.value === '+'))) {
      this.next();
      const e = this.unary();
      return { k: 'un', op: t.value, e };
    }
    return this.postfix(this.primary());
  }

  private postfix(e: Expr): Expr {
    for (;;) {
      const t = this.peek();
      if (t.kind === 'lbrack') {
        this.next();
        const index = [this.parse()];
        while (this.peek().kind === 'comma') { this.next(); index.push(this.parse()); }
        this.expect('rbrack');
        e = { k: 'idx', target: e, index };
      } else if (t.kind === 'lparen') {
        this.next();
        const args: Expr[] = [];
        if (this.peek().kind !== 'rparen') {
          args.push(this.parse());
          while (this.peek().kind === 'comma') { this.next(); args.push(this.parse()); }
        }
        this.expect('rparen');
        e = { k: 'call', callee: e, args };
      } else if (t.kind === 'dot') {
        this.next();
        const name = this.expect('ident').value;
        e = { k: 'mem', target: e, name };
      } else if (t.kind === 'len' || t.kind === 'rows' || t.kind === 'cols') {
        this.next();
        e = { k: t.kind, target: e };
      } else if (t.kind === 'sqrt' || t.kind === 'intpart' || t.kind === 'sq' || t.kind === 'sumall' || t.kind === 'uniqsort' || t.kind === 'nchars') {
        this.next();
        e = { k: 'fn', fn: t.kind, e };
      } else if (t.kind === 'no') {
        // 「s の i 文字目の文字」
        this.next();
        const index = this.primary();
        this.expect('nth');
        e = { k: 'charAt', target: e, index };
      } else if (t.kind === 'rowno' || t.kind === 'colno') {
        // 「a の行番号 r の要素の和」「a の列番号 c の要素の和」
        this.next();
        const index = this.primary();
        this.expect('sumall');
        e = { k: 'sumline', axis: t.kind === 'rowno' ? 'row' : 'col', target: e, index };
      } else if (t.kind === 'anyval') {
        // 「a のいずれかの要素の値が x の値と等しい」
        this.next();
        this.expect('ga');
        const value = this.parse(4);
        if (this.peek().kind === 'valof') this.next();
        const c = this.next();
        if (c.kind !== 'cmp' || c.value !== '=') throw new PseudoError('「と等しい」が必要です', this.line);
        e = { k: 'any', target: e, value, neg: false };
      } else if (t.kind === 'anyin' || t.kind === 'nonein') {
        // 「a の要素のいずれかに x の値が格納されている」「a の要素のいずれにも x の値が格納されていない」
        this.next();
        const value = this.parse(4);
        if (this.peek().kind === 'valof') this.next();
        const st = this.next();
        if (st.kind !== 'stored') throw new PseudoError('「が格納されている」又は「が格納されていない」が必要です', this.line);
        e = { k: 'any', target: e, value, neg: st.value === 'no' };
      } else if (t.kind === 'cloneexcl') {
        // 「a の複製から値が x である要素を除いた配列」
        this.next();
        const value = this.parse(4);
        this.expect('exclend');
        e = { k: 'without', target: e, value };
      } else {
        return e;
      }
    }
  }

  private primary(): Expr {
    const t = this.next();
    switch (t.kind) {
      case 'num':
        return { k: 'num', v: Number(t.value), isInt: !t.value.includes('.') };
      case 'str':
        return { k: 'str', v: t.value };
      case 'undef':
        return { k: 'undef' };
      case 'kw':
        if (t.value === 'true' || t.value === 'false') return { k: 'bool', v: t.value === 'true' };
        break;
      case 'ident':
        return { k: 'var', name: t.value };
      case 'lparen': {
        const e = this.parse();
        this.expect('rparen');
        return e;
      }
      case 'lbrace': {
        if (this.peek().kind === 'rbrace') { this.next(); return { k: 'arr', items: [] }; }
        const first = this.parse();
        if (this.peek().kind === 'row') {
          // 「{n行m列の 0}」
          this.next();
          const cols = this.parse();
          this.expect('colof');
          const value = this.parse();
          this.expect('rbrace');
          return { k: 'fill2', rows: first, cols, value };
        }
        if (this.peek().kind === 'count') {
          this.next();
          const value = this.parse();
          this.expect('rbrace');
          return { k: 'fill', count: first, value };
        }
        const items = [first];
        while (this.peek().kind === 'comma') { this.next(); items.push(this.parse()); }
        this.expect('rbrace');
        return { k: 'arr', items };
      }
    }
    throw new PseudoError(`式の途中に「${t.value || '行末'}」があります`, this.line);
  }
}

export function parseExpr(text: string, line = 0): Expr {
  const p = new ExprParser(tokenize(text, line), line);
  const e = p.parse();
  if (!p.atEnd()) throw new PseudoError(`式「${text}」の解釈に失敗しました`, line);
  return e;
}

// ===== 文 =====

/** 括弧の外側にあるカンマで分割する */
export function splitTop(s: string): string[] {
  const out: string[] = [];
  let depth = 0;
  let cur = '';
  let inStr = false;
  for (const ch of s) {
    if (ch === '"') inStr = !inStr;
    if (!inStr) {
      if ('([{（［'.includes(ch)) depth++;
      if (')]}）］'.includes(ch)) depth--;
      if ((ch === ',' || ch === '，') && depth === 0) { out.push(cur); cur = ''; continue; }
    }
    cur += ch;
  }
  if (cur.trim() !== '' || out.length) out.push(cur);
  return out.map((x) => x.trim()).filter((x) => x !== '');
}

const TYPE_RE = /^((?:[^\s:：←()（）]*?(?:型|配列)[^\s:：←()（）]*)|[A-Z][A-Za-z0-9]*)\s*[:：]\s*(.*)$/;

function stripComments(src: string): string[] {
  // /* */ は複数行にまたがる可能性があるので文字単位で除去（改行は保持して行番号を保つ）
  let out = '';
  let i = 0;
  while (i < src.length) {
    if (src.startsWith('/*', i)) {
      const end = src.indexOf('*/', i + 2);
      const stop = end < 0 ? src.length : end + 2;
      out += src.slice(i, stop).replace(/[^\n]/g, ' ');
      i = stop;
      continue;
    }
    if (src.startsWith('//', i)) {
      const end = src.indexOf('\n', i);
      const stop = end < 0 ? src.length : end;
      out += ' '.repeat(stop - i);
      i = stop;
      continue;
    }
    out += src[i];
    i++;
  }
  return out.split('\n');
}

interface Frame {
  kind: 'root' | 'func' | 'if' | 'while' | 'do' | 'for' | 'foreach';
  label?: string;
  body: Stmt[];
  stmt?: Stmt;
  func?: FuncDef;
}

function parenContent(s: string, kw: string, line: number): string {
  const rest = s.slice(kw.length).trim();
  if (!rest.startsWith('(') || !rest.endsWith(')')) throw new PseudoError(`${kw} の後には (条件式) が必要です`, line);
  return rest.slice(1, -1).trim();
}

/** 括弧が閉じていない行や、二項演算子・コンマで終わる行は次の行に続く */
function needsContinuation(t: string): boolean {
  let depth = 0;
  let inStr = false;
  for (const ch of t) {
    if (ch === '"') inStr = !inStr;
    if (inStr) continue;
    if ('([{'.includes(ch)) depth++;
    if (')]}'.includes(ch)) depth--;
  }
  return depth > 0 || /(?:[×÷+\-←,を]|\band|\bor|である)$/.test(t);
}

/** ループ見出し行末の注釈（例: `// α`）をループの名前（「αの行から始まる繰返し処理を終了する」の α）として取り出す */
function loopLabel(rawLine: string): string | undefined {
  const m = rawLine.match(/(?:\/\/|\/\*)\s*([^\s*/]{1,3})\s*(?:\*\/)?\s*$/);
  return m ? m[1] : undefined;
}

const FOR_RE = /^([A-Za-z_][A-Za-z0-9_]*)\s*を\s*(.+?)\s*から\s*(.+?)\s*まで\s*(.+?)\s*ずつ\s*(増やす|減らす)$/;
// 「jをnから始めてmを超えない範囲でtempNずつ増やす」「…から始めて…を下回らない範囲で…ずつ減らす」
const FOR_RE2 = /^([A-Za-z_][A-Za-z0-9_]*)\s*を\s*(.+?)\s*から始めて\s*(.+?)\s*を(?:超えない|下回らない)範囲で\s*(.+?)\s*ずつ\s*(増やす|減らす)$/;
// 「orderにordersの要素を順に代入する」
const FOREACH_RE = /^([A-Za-z_][A-Za-z0-9_]*)\s*に\s*(.+?)\s*の要素を順に代入する$/;

export function parseProgram(source: string): Program {
  const lines = normalizeSymbols(source).split('\n');
  const clean = stripComments(normalizeSymbols(source));
  const funcs: Record<string, FuncDef> = {};
  const main: Stmt[] = [];
  const stack: Frame[] = [{ kind: 'root', body: main }];
  const top = () => stack[stack.length - 1];
  const closeFunc = () => {
    if (top().kind === 'func') stack.pop();
  };

  // 複数行にまたがる文を 1 行にまとめる（行番号は先頭行）
  const logical: { line: number; text: string }[] = [];
  let pending: { line: number; text: string } | null = null;
  clean.forEach((raw, idx) => {
    const t = raw.trim();
    if (!t) return;
    if (pending) { pending.text += (/(?:を|である)$/.test(pending.text) ? '' : ' ') + t; } else { pending = { line: idx + 1, text: t }; }
    if (!needsContinuation(pending.text)) { logical.push(pending); pending = null; }
  });
  if (pending) logical.push(pending);

  const enclosingLoops = (): Frame[] => {
    const out: Frame[] = [];
    for (let i = stack.length - 1; i >= 0 && stack[i].kind !== 'func'; i--) {
      if (['while', 'do', 'for', 'foreach'].includes(stack[i].kind)) out.push(stack[i]);
    }
    return out;
  };

  logical.forEach(({ line, text: s }) => {

    // 関数・手続の宣言
    if (s.startsWith('○') || s.startsWith('〇')) {
      if (stack.length > 2 || (stack.length === 2 && top().kind !== 'func')) {
        throw new PseudoError('ブロックが閉じられないまま次の関数が始まっています', line);
      }
      closeFunc();
      const m = s.slice(1).trim().match(/^(?:(.+?)\s*[:：]\s*)?([A-Za-z_][A-Za-z0-9_]*)\s*\((.*)\)$/);
      if (!m) throw new PseudoError('関数宣言の形式が正しくありません', line);
      const params = splitTop(m[3]).map((p) => {
        const pm = p.match(/^(.+?)\s*[:：]\s*([A-Za-z_][A-Za-z0-9_]*)$/);
        if (!pm) throw new PseudoError(`引数「${p}」の形式が正しくありません`, line);
        return { type: pm[1].trim(), name: pm[2] };
      });
      const f: FuncDef = { name: m[2], returnType: m[1]?.trim(), params, body: [], line };
      funcs[f.name] = f;
      stack.push({ kind: 'func', body: f.body, func: f });
      return;
    }

    const add = (st: Stmt) => top().body.push(st);

    if (s === 'endif') {
      const f = stack.pop();
      if (!f || f.kind !== 'if') throw new PseudoError('対応する if がない endif です', line);
      (f.stmt as Extract<Stmt, { k: 'if' }>).endLine = line;
      return;
    }
    if (s === 'endwhile') {
      const f = stack.pop();
      if (!f || f.kind !== 'while') throw new PseudoError('対応する while がない endwhile です', line);
      (f.stmt as Extract<Stmt, { k: 'while' }>).endLine = line;
      return;
    }
    if (s === 'endfor') {
      const f = stack.pop();
      if (!f || (f.kind !== 'for' && f.kind !== 'foreach')) throw new PseudoError('対応する for がない endfor です', line);
      (f.stmt as Extract<Stmt, { k: 'for' | 'foreach' }>).endLine = line;
      return;
    }
    if (s.startsWith('elseif')) {
      const f = top();
      if (f.kind !== 'if') throw new PseudoError('対応する if がない elseif です', line);
      const st = f.stmt as Extract<Stmt, { k: 'if' }>;
      if (st.elseBody) throw new PseudoError('else の後に elseif は書けません', line);
      const condText = parenContent(s, 'elseif', line);
      const br = { cond: parseExpr(condText, line), condText, body: [] as Stmt[], line };
      st.branches.push(br);
      f.body = br.body;
      return;
    }
    if (s === 'else') {
      const f = top();
      if (f.kind !== 'if') throw new PseudoError('対応する if がない else です', line);
      const st = f.stmt as Extract<Stmt, { k: 'if' }>;
      st.elseBody = [];
      st.elseLine = line;
      f.body = st.elseBody;
      return;
    }
    if (/^if\s*\(/.test(s)) {
      const condText = parenContent(s, 'if', line);
      const br = { cond: parseExpr(condText, line), condText, body: [] as Stmt[], line };
      const st: Stmt = { k: 'if', line, branches: [br], endLine: -1 };
      add(st);
      stack.push({ kind: 'if', body: br.body, stmt: st });
      return;
    }
    if (/^while\s*\(/.test(s)) {
      const condText = parenContent(s, 'while', line);
      if (top().kind === 'do') {
        const f = stack.pop()!;
        const st = f.stmt as Extract<Stmt, { k: 'do' }>;
        st.cond = parseExpr(condText, line);
        st.condText = condText;
        st.condLine = line;
        return;
      }
      const label = loopLabel(lines[line - 1]);
      const st: Stmt = { k: 'while', line, cond: parseExpr(condText, line), condText, body: [], endLine: -1, label };
      add(st);
      stack.push({ kind: 'while', label, body: st.body, stmt: st });
      return;
    }
    if (s === 'do') {
      const label = loopLabel(lines[line - 1]);
      const st: Stmt = { k: 'do', line, cond: { k: 'bool', v: false }, condText: '', body: [], condLine: -1, label };
      add(st);
      stack.push({ kind: 'do', label, body: st.body, stmt: st });
      return;
    }
    if (/^for\s*\(/.test(s)) {
      const ctl = parenContent(s, 'for', line);
      const label = loopLabel(lines[line - 1]);
      const fe = normalizeSymbols(ctl).match(FOREACH_RE);
      if (fe) {
        const st: Stmt = { k: 'foreach', line, v: fe[1], arr: parseExpr(fe[2], line), body: [], endLine: -1, text: ctl, label };
        add(st);
        stack.push({ kind: 'foreach', label, body: st.body, stmt: st });
        return;
      }
      const m = normalizeSymbols(ctl).match(FOR_RE) ?? normalizeSymbols(ctl).match(FOR_RE2);
      if (!m) throw new PseudoError(`for の制御記述「${ctl}」を解釈できません`, line);
      const st: Stmt = {
        k: 'for', line, v: m[1], from: parseExpr(m[2], line), to: parseExpr(m[3], line), step: parseExpr(m[4], line),
        dir: m[5] === '増やす' ? 1 : -1, body: [], endLine: -1, text: ctl, label,
      };
      add(st);
      stack.push({ kind: 'for', label, body: st.body, stmt: st });
      return;
    }
    if (s === 'return' || s.startsWith('return ') || s.startsWith('return(')) {
      const rest = s.slice(6).trim();
      add({ k: 'return', line, value: rest ? parseExpr(rest, line) : undefined });
      return;
    }

    // 宣言（大域: を含む）
    let declText = s;
    let global = false;
    const gm = s.match(/^大域\s*[:：]\s*(.*)$/);
    if (gm) { declText = gm[1]; global = true; }
    const dm = declText.match(TYPE_RE);
    if (dm && !dm[1].includes('←')) {
      const vars = splitTop(dm[2]).map((d) => {
        const am = d.match(/^([A-Za-z_][A-Za-z0-9_]*)\s*(?:←\s*(.+))?$/);
        if (!am) throw new PseudoError(`変数宣言「${d}」の形式が正しくありません`, line);
        return { name: am[1], init: am[2] !== undefined ? parseExpr(am[2], line) : undefined };
      });
      add({ k: 'decl', line, type: dm[1], vars, global });
      return;
    }

    // 末尾への追加
    const ap = s.match(/^(.+?)\s*の末尾\s*に\s*(.+?)\s*(?:の値)?\s*を追加する$/);
    if (ap) {
      add({ k: 'append', line, target: parseExpr(ap[1], line), value: parseExpr(ap[2], line) });
      return;
    }
    const brk = s.match(/^(?:(\S+?)の行から始まる)?繰返し処理を終了する$/);
    if (brk) {
      const loops = enclosingLoops();
      if (!loops.length) throw new PseudoError('繰返し処理の外に「繰返し処理を終了する」があります', line);
      if (brk[1] && !loops.some((f) => f.label === brk[1])) throw new PseudoError(`「${brk[1]}」の行から始まる繰返し処理が見つかりません`, line);
      add({ k: 'break', line, label: brk[1] });
      return;
    }
    const sw = s.match(/^(.+?)\s*と\s*(.+?)\s*の値を入れ替える$/);
    if (sw) {
      add({ k: 'swap', line, a: parseExpr(sw[1], line), b: parseExpr(sw[2], line) });
      return;
    }
    const outAll = s.match(/^(.+?)\s*の全要素の値を要素番号の順に空白区切りで出力する$/);
    if (outAll) {
      add({ k: 'outputList', line, values: [parseExpr(outAll[1], line)], sep: ' ', spread: true });
      return;
    }
    const outComma = s.match(/^(.+?)\s*をこの順にコンマ区切りで出力する$/);
    if (outComma) {
      const parts = outComma[1].split(/の値と/).map((x, i, a) => (i === a.length - 1 ? x.replace(/の値$/, '') : x));
      add({ k: 'outputList', line, values: parts.map((x) => parseExpr(x, line)), sep: ',', spread: false });
      return;
    }
    const inc = s.match(/^([^を]+?)\s*の値を\s*(.+?)\s*(増やす|減らす)$/);
    if (inc) {
      const target = parseExpr(inc[1], line);
      add({ k: 'assign', line, target, value: { k: 'bin', op: inc[3] === '増やす' ? '+' : '-', l: target, r: parseExpr(inc[2], line) } });
      return;
    }
    const op = s.match(/^(.+?)\s*を出力する$/);
    if (op) {
      add({ k: 'output', line, value: parseExpr(op[1], line) });
      return;
    }
    if (s === '何もしない') { add({ k: 'nop', line }); return; }

    const asg = splitAssign(s);
    if (asg) {
      add({ k: 'assign', line, target: parseExpr(asg[0], line), value: parseExpr(asg[1], line) });
      return;
    }
    const e = parseExpr(s, line);
    if (e.k !== 'call') throw new PseudoError(`文「${s}」を解釈できません`, line);
    add({ k: 'expr', line, e });
  });
  closeFunc();
  if (stack.length !== 1) {
    const f = top();
    throw new PseudoError(`${f.kind} ブロックが閉じられていません（end${f.kind === 'do' ? ' の while' : f.kind} が必要）`);
  }
  return { funcs, main, lines };
}

function splitAssign(s: string): [string, string] | null {
  let depth = 0;
  for (let i = 0; i < s.length; i++) {
    const ch = s[i];
    if ('([{'.includes(ch)) depth++;
    if (')]}'.includes(ch)) depth--;
    if (ch === '←' && depth === 0) return [s.slice(0, i).trim(), s.slice(i + 1).trim()];
  }
  return null;
}
