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
  | { k: 'expr'; e: Expr }
  | { k: 'return'; value?: Expr }
  | { k: 'if'; branches: { cond: Expr; condText: string; body: Stmt[]; line: number }[]; elseBody?: Stmt[]; elseLine?: number; endLine: number }
  | { k: 'while'; cond: Expr; condText: string; body: Stmt[]; endLine: number }
  | { k: 'do'; cond: Expr; condText: string; body: Stmt[]; condLine: number }
  | { k: 'for'; v: string; from: Expr; to: Expr; step: Expr; dir: 1 | -1; body: Stmt[]; endLine: number; text: string }
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
      const op = t.kind === 'op' || t.kind === 'kw' ? t.value : '';
      const prec = BIN_PREC[op];
      if (prec === undefined || prec < minPrec) break;
      this.next();
      const right = this.parse(prec + 1);
      left = { k: 'bin', op, l: left, r: right };
    }
    return left;
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

/** 日本語の比較表現を記号に置き換える（例: 「nが2以下」→「n ≦ 2」） */
export function rewriteJapaneseCondition(text: string): string {
  let s = normalizeSymbols(text);
  const rules: [RegExp, string][] = [
    [/([^()]+?)が未定義でない/g, '($1) ≠ 未定義'],
    [/([^()]+?)が未定義/g, '($1) = 未定義'],
    [/([^()]+?)が([^()]+?)と等しくない/g, '($1) ≠ ($2)'],
    [/([^()]+?)が([^()]+?)と等しい/g, '($1) = ($2)'],
    [/([^()]+?)が([^()]+?)以下/g, '($1) ≦ ($2)'],
    [/([^()]+?)が([^()]+?)以上/g, '($1) ≧ ($2)'],
    [/([^()]+?)が([^()]+?)より小さい/g, '($1) < ($2)'],
    [/([^()]+?)が([^()]+?)より大きい/g, '($1) > ($2)'],
  ];
  for (const [re, rep] of rules) s = s.replace(re, rep);
  return s;
}

export function parseExpr(text: string, line = 0): Expr {
  const p = new ExprParser(tokenize(rewriteJapaneseCondition(text), line), line);
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
  kind: 'root' | 'func' | 'if' | 'while' | 'do' | 'for';
  body: Stmt[];
  stmt?: Stmt;
  func?: FuncDef;
}

function parenContent(s: string, kw: string, line: number): string {
  const rest = s.slice(kw.length).trim();
  if (!rest.startsWith('(') || !rest.endsWith(')')) throw new PseudoError(`${kw} の後には (条件式) が必要です`, line);
  return rest.slice(1, -1).trim();
}

const FOR_RE = /^([A-Za-z_][A-Za-z0-9_]*)\s*を\s*(.+?)\s*から\s*(.+?)\s*まで\s*(.+?)\s*ずつ\s*(増やす|減らす)$/;

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

  clean.forEach((raw, idx) => {
    const line = idx + 1;
    const s = raw.trim();
    if (!s) return;

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
      if (!f || f.kind !== 'for') throw new PseudoError('対応する for がない endfor です', line);
      (f.stmt as Extract<Stmt, { k: 'for' }>).endLine = line;
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
      const st: Stmt = { k: 'while', line, cond: parseExpr(condText, line), condText, body: [], endLine: -1 };
      add(st);
      stack.push({ kind: 'while', body: st.body, stmt: st });
      return;
    }
    if (s === 'do') {
      const st: Stmt = { k: 'do', line, cond: { k: 'bool', v: false }, condText: '', body: [], condLine: -1 };
      add(st);
      stack.push({ kind: 'do', body: st.body, stmt: st });
      return;
    }
    if (/^for\s*\(/.test(s)) {
      const ctl = parenContent(s, 'for', line);
      const m = normalizeSymbols(ctl).match(FOR_RE);
      if (!m) throw new PseudoError(`for の制御記述「${ctl}」を解釈できません`, line);
      const st: Stmt = {
        k: 'for', line, v: m[1], from: parseExpr(m[2], line), to: parseExpr(m[3], line), step: parseExpr(m[4], line),
        dir: m[5] === '増やす' ? 1 : -1, body: [], endLine: -1, text: ctl,
      };
      add(st);
      stack.push({ kind: 'for', body: st.body, stmt: st });
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
    const ap = s.match(/^(.+?)\s*の末尾に\s*(.+?)\s*(?:の値)?\s*を追加する$/);
    if (ap) {
      add({ k: 'append', line, target: parseExpr(ap[1], line), value: parseExpr(ap[2], line) });
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
