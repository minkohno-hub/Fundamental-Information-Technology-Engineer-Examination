// IPA 擬似言語の実行器。実行の各段階をスナップショットとして記録でき、
// シミュレーター（1ステップ進む・戻る）と問題の自動検証の両方で使う。
import { PseudoError } from './lexer';
import { parseProgram, type Expr, type FuncDef, type Program, type Stmt } from './parser';

export const UNDEF = Object.freeze({ t: 'undef' as const });
export type ArrV = { t: 'arr'; items: Value[] };
export type ObjV = { t: 'obj'; cls: string; fields: Record<string, Value> };
export type Value = number | boolean | string | ArrV | ObjV | typeof UNDEF;

export interface ClassDef {
  fields: string[];
  /** コンストラクタ引数の順に設定するフィールド名 */
  ctor: string[];
}

export interface RunOptions {
  classes?: Record<string, ClassDef>;
  /** 8桁の 0/1 の並びを 2 進数リテラルとして解釈する（8ビット型の問題用） */
  bitLiterals?: boolean;
  maxSteps?: number;
  /** トレースを記録する（シミュレーター用） */
  trace?: boolean;
  maxTrace?: number;
  /** 呼出し回数を記録する関数名 */
  countCalls?: boolean;
  /** 初期化済みの大域変数（問題文で「〜が格納されている」とされる値） */
  globals?: Record<string, unknown>;
}

export interface FrameSnapshot {
  name: string;
  vars: Record<string, SnapValue>;
}
export type SnapValue = number | boolean | string | null | SnapValue[] | { [k: string]: SnapValue };

export interface TraceStep {
  line: number;
  kind: 'stmt' | 'cond' | 'call' | 'return' | 'loop' | 'end';
  note: string;
  frames: FrameSnapshot[];
  globals: Record<string, SnapValue>;
  output: string[];
  loopCounts: Record<number, number>;
  changed?: string[];
}

export interface RunResult {
  returnValue?: Value;
  output: string[];
  globals: Record<string, Value>;
  mainVars: Record<string, Value>;
  steps: number;
  trace: TraceStep[];
  callCounts: Record<string, number>;
  warnings: string[];
  traceTruncated: boolean;
}

class ReturnSignal {
  constructor(public value: Value | undefined) {}
}

/** 「繰返し処理を終了する」。label があるときはその名前の行から始まる繰返し処理まで抜ける */
class BreakSignal {
  constructor(public label: string | undefined) {}
}

interface Scope {
  name: string;
  vars: Map<string, Value>;
  types: Map<string, string>;
}

export function toValue(x: unknown): Value {
  if (x === null || x === undefined) return UNDEF;
  if (Array.isArray(x)) return { t: 'arr', items: x.map(toValue) };
  if (typeof x === 'number' || typeof x === 'boolean' || typeof x === 'string') return x;
  if (typeof x === 'object' && (x as ArrV).t === 'arr') return x as ArrV;
  if (typeof x === 'object') {
    const o = x as Record<string, unknown>;
    if (o.t === 'obj' || o.t === 'undef') return o as unknown as Value;
    const fields: Record<string, Value> = {};
    for (const [k, v] of Object.entries(o)) if (k !== '__cls') fields[k] = toValue(v);
    return { t: 'obj', cls: String(o.__cls ?? 'Object'), fields };
  }
  throw new PseudoError('変換できない値です');
}

/** 比較・表示用に素の JS 値へ変換する（未定義は null） */
export function toPlain(v: Value, seen = new Set<object>()): SnapValue {
  if (typeof v !== 'object') return v;
  if (v.t === 'undef') return null;
  if (seen.has(v)) return '(循環参照)';
  seen.add(v);
  try {
    if (v.t === 'arr') return v.items.map((x) => toPlain(x, seen));
    const o: Record<string, SnapValue> = {};
    for (const [k, x] of Object.entries(v.fields)) o[k] = toPlain(x, seen);
    return o;
  } finally {
    seen.delete(v);
  }
}

export function formatValue(v: Value): string {
  if (typeof v === 'number') return Number.isInteger(v) ? String(v) : String(Math.round(v * 1e10) / 1e10);
  if (typeof v === 'boolean') return v ? 'true' : 'false';
  if (typeof v === 'string') return `"${v}"`;
  if (v.t === 'undef') return '未定義';
  if (v.t === 'arr') return `{${v.items.map(formatValue).join(', ')}}`;
  return `${v.cls}`;
}

function isInt(n: number) {
  return Number.isInteger(n);
}

export class Interpreter {
  readonly program: Program;
  private globals: Scope = { name: '大域', vars: new Map(), types: new Map() };
  private stack: Scope[] = [];
  private output: string[] = [];
  private steps = 0;
  private trace: TraceStep[] = [];
  private loopCounts: Record<number, number> = {};
  private callCounts: Record<string, number> = {};
  private warnings = new Set<string>();
  private traceTruncated = false;
  private opts: Required<Pick<RunOptions, 'maxSteps' | 'maxTrace'>> & RunOptions;

  constructor(source: string | Program, opts: RunOptions = {}) {
    this.program = typeof source === 'string' ? parseProgram(source) : source;
    this.opts = { maxSteps: 200000, maxTrace: 5000, ...opts };
    for (const [k, v] of Object.entries(opts.globals ?? {})) this.globals.vars.set(k, toValue(v));
  }

  /** トップレベルの文を実行し、必要なら関数を呼び出す */
  run(entry?: string, args: unknown[] = []): RunResult {
    const mainScope: Scope = { name: 'メイン', vars: new Map(), types: new Map() };
    this.stack.push(mainScope);
    let returnValue: Value | undefined;
    try {
      this.execBlock(this.program.main);
      if (entry) {
        const f = this.program.funcs[entry];
        if (!f) throw new PseudoError(`関数 ${entry} が定義されていません`);
        returnValue = this.callFunc(f, args.map(toValue), f.line);
      }
    } catch (e) {
      if (e instanceof ReturnSignal) {
        returnValue = e.value;
      } else {
        throw e;
      }
    }
    this.record(this.lastLine(), 'end', returnValue !== undefined ? `実行終了（戻り値 ${formatValue(returnValue)}）` : '実行終了');
    const mainVars = Object.fromEntries(mainScope.vars);
    this.stack.pop();
    return {
      returnValue,
      output: this.output,
      globals: Object.fromEntries(this.globals.vars),
      mainVars,
      steps: this.steps,
      trace: this.trace,
      callCounts: this.callCounts,
      warnings: [...this.warnings],
      traceTruncated: this.traceTruncated,
    };
  }

  private lastLine() {
    // 末尾の空行は表示されない（CodeBlock が削る）ため、最後の非空行を終了ステップの行にする
    const ls = this.program.lines;
    let n = ls.length;
    while (n > 1 && ls[n - 1].trim() === '') n--;
    return n;
  }

  // ===== トレース =====

  private snapshotScope(s: Scope): Record<string, SnapValue> {
    const o: Record<string, SnapValue> = {};
    for (const [k, v] of s.vars) o[k] = toPlain(v);
    return o;
  }

  private record(line: number, kind: TraceStep['kind'], note: string, changed?: string[]) {
    if (!this.opts.trace) return;
    if (this.trace.length >= this.opts.maxTrace) { this.traceTruncated = true; return; }
    this.trace.push({
      line,
      kind,
      note,
      frames: this.stack.map((s) => ({ name: s.name, vars: this.snapshotScope(s) })),
      globals: this.snapshotScope(this.globals),
      output: [...this.output],
      loopCounts: { ...this.loopCounts },
      changed,
    });
  }

  private tick(line: number) {
    this.steps++;
    if (this.steps > this.opts.maxSteps) throw new PseudoError('実行ステップ数が上限を超えました（無限ループの可能性があります）', line);
  }

  // ===== 変数 =====

  private scope() {
    return this.stack[this.stack.length - 1];
  }

  private lookup(name: string, line: number): Value {
    const s = this.scope();
    if (s.vars.has(name)) return s.vars.get(name)!;
    if (this.globals.vars.has(name)) return this.globals.vars.get(name)!;
    throw new PseudoError(`変数 ${name} は宣言されていません`, line);
  }

  private setVar(name: string, v: Value, line: number) {
    const s = this.scope();
    const target = s.vars.has(name) ? s : this.globals.vars.has(name) ? this.globals : null;
    if (!target) throw new PseudoError(`変数 ${name} は宣言されていません`, line);
    target.vars.set(name, this.coerce(target.types.get(name), v, line));
  }

  private coerce(type: string | undefined, v: Value, line: number): Value {
    if (type === '整数型' && typeof v === 'number' && !isInt(v)) {
      this.warnings.add(`${line}行目: 整数型への代入で小数点以下を切り捨てました`);
      return Math.trunc(v);
    }
    return v;
  }

  // ===== 文の実行 =====

  private execBlock(body: Stmt[]) {
    for (const st of body) this.exec(st);
  }

  private exec(st: Stmt): void {
    this.tick(st.line);
    switch (st.k) {
      case 'nop':
        this.record(st.line, 'stmt', '何もしない');
        return;
      case 'decl': {
        const target = st.global ? this.globals : this.scope();
        const names: string[] = [];
        for (const d of st.vars) {
          const v = d.init ? this.eval(d.init, st.line) : UNDEF;
          target.types.set(d.name, st.type);
          target.vars.set(d.name, this.coerce(st.type, v, st.line));
          names.push(d.name);
        }
        this.record(st.line, 'stmt', `${names.join(', ')} を宣言${st.vars.some((d) => d.init) ? '・初期化' : ''}`, names);
        return;
      }
      case 'assign': {
        const v = this.eval(st.value, st.line);
        const name = this.assign(st.target, v, st.line);
        this.record(st.line, 'stmt', `${name} ← ${formatValue(v)}`, [rootName(st.target)]);
        return;
      }
      case 'append': {
        const arr = this.eval(st.target, st.line);
        if (typeof arr !== 'object' || arr.t !== 'arr') throw new PseudoError('末尾に追加できるのは配列だけです', st.line);
        const v = this.eval(st.value, st.line);
        arr.items.push(v);
        this.record(st.line, 'stmt', `配列の末尾に ${formatValue(v)} を追加（要素数 ${arr.items.length}）`, [rootName(st.target)]);
        return;
      }
      case 'output': {
        const v = this.eval(st.value, st.line);
        this.output.push(typeof v === 'string' ? v : formatValue(v));
        this.record(st.line, 'stmt', `${formatValue(v)} を出力`);
        return;
      }
      case 'expr':
        this.eval(st.e, st.line);
        this.record(st.line, 'stmt', '呼出しから戻った');
        return;
      case 'outputList': {
        const vals: Value[] = [];
        for (const e of st.values) {
          const v = this.eval(e, st.line);
          if (st.spread) vals.push(...this.flatten(v, st.line));
          else vals.push(v);
        }
        const text = vals.map((v) => (typeof v === 'string' ? v : formatValue(v))).join(st.sep);
        this.output.push(text);
        this.record(st.line, 'stmt', `${text} を出力`);
        return;
      }
      case 'swap': {
        const a = this.eval(st.a, st.line);
        const b = this.eval(st.b, st.line);
        const na = this.assign(st.a, b, st.line);
        const nb = this.assign(st.b, a, st.line);
        this.record(st.line, 'stmt', `${na} と ${nb} の値を入れ替えた`, [rootName(st.a), rootName(st.b)]);
        return;
      }
      case 'break':
        this.record(st.line, 'stmt', st.label ? `${st.label} の行から始まる繰返し処理を終了` : '繰返し処理を終了');
        throw new BreakSignal(st.label);
      case 'return': {
        const v = st.value ? this.eval(st.value, st.line) : undefined;
        this.record(st.line, 'return', v !== undefined ? `${formatValue(v)} を返す` : '手続を終了');
        throw new ReturnSignal(v);
      }
      case 'if': {
        for (const br of st.branches) {
          const c = this.cond(br.cond, br.line);
          this.record(br.line, 'cond', `条件「${br.condText}」は ${c}`);
          if (c) { this.execBlock(br.body); return; }
        }
        if (st.elseBody) {
          this.record(st.elseLine!, 'cond', 'どの条件も偽なので else を実行');
          this.execBlock(st.elseBody);
        }
        return;
      }
      case 'while': {
        this.loopCounts[st.line] = 0;
        for (;;) {
          this.tick(st.line);
          const c = this.cond(st.cond, st.line);
          this.record(st.line, 'cond', `条件「${st.condText}」は ${c}${c ? '（繰返しを継続）' : '（繰返しを終了）'}`);
          if (!c) break;
          this.loopCounts[st.line]++;
          if (!this.loopBody(st)) break;
        }
        return;
      }
      case 'do': {
        this.loopCounts[st.line] = 0;
        for (;;) {
          this.tick(st.line);
          this.loopCounts[st.line]++;
          if (!this.loopBody(st)) break;
          const c = this.cond(st.cond, st.condLine);
          this.record(st.condLine, 'cond', `条件「${st.condText}」は ${c}${c ? '（繰返しを継続）' : '（繰返しを終了）'}`);
          if (!c) break;
        }
        return;
      }
      case 'foreach': {
        const arr = this.eval(st.arr, st.line);
        if (typeof arr !== 'object' || arr.t !== 'arr') throw new PseudoError(`${exprText(st.arr)} は配列ではありません`, st.line);
        this.loopCounts[st.line] = 0;
        for (const item of [...arr.items]) {
          this.tick(st.line);
          this.setVar(st.v, item, st.line);
          this.record(st.line, 'loop', `${st.v} ← ${formatValue(item)}：繰返しを実行（${st.text}）`, [st.v]);
          this.loopCounts[st.line]++;
          if (!this.loopBody(st)) break;
        }
        return;
      }
      case 'for': {
        const from = this.num(this.eval(st.from, st.line), st.line);
        this.setVar(st.v, from, st.line);
        this.loopCounts[st.line] = 0;
        for (;;) {
          this.tick(st.line);
          const i = this.num(this.lookup(st.v, st.line), st.line);
          const to = this.num(this.eval(st.to, st.line), st.line);
          const ok = st.dir === 1 ? i <= to : i >= to;
          this.record(st.line, 'loop', ok ? `${st.v} = ${i}：繰返しを実行（${st.text}）` : `${st.v} = ${i}：終了条件を満たしたので繰返しを終了`, [st.v]);
          if (!ok) break;
          this.loopCounts[st.line]++;
          if (!this.loopBody(st)) break;
          const step = this.num(this.eval(st.step, st.line), st.line);
          this.setVar(st.v, this.num(this.lookup(st.v, st.line), st.line) + st.dir * step, st.line);
        }
        return;
      }
    }
  }

  /** 繰返しの本体を実行する。「繰返し処理を終了する」で抜けたら false */
  private loopBody(st: { body: Stmt[]; label?: string }): boolean {
    try {
      this.execBlock(st.body);
      return true;
    } catch (e) {
      if (e instanceof BreakSignal && (e.label === undefined || e.label === st.label)) return false;
      throw e;
    }
  }

  private flatten(v: Value, line: number): Value[] {
    if (typeof v !== 'object' || v.t !== 'arr') return [v];
    return v.items.flatMap((x) => this.flatten(x, line));
  }

  private assign(target: Expr, v: Value, line: number): string {
    if (target.k === 'var') {
      this.setVar(target.name, v, line);
      return target.name;
    }
    if (target.k === 'idx') {
      const { container, index } = this.resolveIndex(target, line);
      container.items[index] = v;
      return exprText(target);
    }
    if (target.k === 'mem') {
      const o = this.eval(target.target, line);
      if (typeof o !== 'object' || o.t !== 'obj') throw new PseudoError(`${exprText(target.target)} はインスタンスではありません`, line);
      if (!(target.name in o.fields)) throw new PseudoError(`メンバ変数 ${target.name} はありません`, line);
      o.fields[target.name] = v;
      return exprText(target);
    }
    throw new PseudoError('代入先が正しくありません', line);
  }

  private resolveIndex(e: Extract<Expr, { k: 'idx' }>, line: number): { container: ArrV; index: number } {
    let cur = this.eval(e.target, line);
    for (let d = 0; d < e.index.length; d++) {
      if (typeof cur !== 'object' || cur.t !== 'arr') throw new PseudoError(`${exprText(e.target)} は配列ではありません`, line);
      const n = this.num(this.eval(e.index[d], line), line);
      if (!isInt(n) || n < 1 || n > cur.items.length) {
        throw new PseudoError(`要素番号 ${n} は配列の範囲（1〜${cur.items.length}）外です`, line);
      }
      if (d === e.index.length - 1) return { container: cur, index: n - 1 };
      cur = cur.items[n - 1];
    }
    throw new PseudoError('要素番号が指定されていません', line);
  }

  private num(v: Value, line: number): number {
    if (typeof v !== 'number') throw new PseudoError(`数値が必要な位置に ${formatValue(v)} があります`, line);
    return v;
  }

  private cond(e: Expr, line: number): boolean {
    const v = this.eval(e, line);
    if (typeof v !== 'boolean') throw new PseudoError(`条件式の値が論理型ではありません（${formatValue(v)}）`, line);
    return v;
  }

  // ===== 関数呼出し =====

  private callFunc(f: FuncDef, args: Value[], line: number): Value | undefined {
    if (args.length !== f.params.length) throw new PseudoError(`${f.name} の引数の個数が一致しません`, line);
    this.callCounts[f.name] = (this.callCounts[f.name] ?? 0) + 1;
    if (this.stack.length > 2000) throw new PseudoError('呼出しが深すぎます（再帰が終わらない可能性があります）', line);
    const scope: Scope = { name: `${f.name}(${args.map(formatValue).join(', ')})`, vars: new Map(), types: new Map() };
    f.params.forEach((p, i) => {
      scope.types.set(p.name, p.type);
      scope.vars.set(p.name, args[i]);
    });
    this.stack.push(scope);
    this.record(f.line, 'call', `${scope.name} を呼び出す`);
    try {
      this.execBlock(f.body);
      return undefined;
    } catch (e) {
      if (e instanceof ReturnSignal) return e.value;
      throw e;
    } finally {
      this.stack.pop();
    }
  }

  // ===== 式の評価 =====

  eval(e: Expr, line: number): Value {
    switch (e.k) {
      case 'num':
        if (this.opts.bitLiterals && e.isInt && /^[01]{8}$/.test(String(e.v).padStart(8, '0')) && String(e.v).length > 1) {
          return parseInt(String(e.v), 2);
        }
        return e.v;
      case 'str':
        return e.v;
      case 'bool':
        return e.v;
      case 'undef':
        return UNDEF;
      case 'var':
        return this.lookup(e.name, line);
      case 'arr':
        return { t: 'arr', items: e.items.map((x) => this.eval(x, line)) };
      case 'fill': {
        const n = this.num(this.eval(e.count, line), line);
        const items: Value[] = [];
        for (let i = 0; i < n; i++) items.push(cloneValue(this.eval(e.value, line)));
        return { t: 'arr', items };
      }
      case 'fill2': {
        const r = this.num(this.eval(e.rows, line), line);
        const c = this.num(this.eval(e.cols, line), line);
        const rows: Value[] = [];
        for (let i = 0; i < r; i++) {
          const items: Value[] = [];
          for (let j = 0; j < c; j++) items.push(cloneValue(this.eval(e.value, line)));
          rows.push({ t: 'arr', items });
        }
        return { t: 'arr', items: rows };
      }
      case 'fn':
        return this.evalFn(e, line);
      case 'charAt': {
        const s = this.eval(e.target, line);
        if (typeof s !== 'string') throw new PseudoError(`${exprText(e.target)} は文字列ではありません`, line);
        const n = this.num(this.eval(e.index, line), line);
        const chars = [...s];
        if (!isInt(n) || n < 1 || n > chars.length) throw new PseudoError(`${n} 文字目は文字列の範囲（1〜${chars.length}）外です`, line);
        return chars[n - 1];
      }
      case 'sumline': {
        const a = this.eval(e.target, line);
        const n = this.num(this.eval(e.index, line), line);
        if (typeof a !== 'object' || a.t !== 'arr') throw new PseudoError(`${exprText(e.target)} は配列ではありません`, line);
        const sumOf = (xs: Value[]) => xs.reduce<number>((acc, x) => acc + this.num(x, line), 0);
        const rowOf = (i: number): ArrV => {
          const r = a.items[i - 1];
          if (!isInt(i) || typeof r !== 'object' || r?.t !== 'arr') throw new PseudoError(`行番号 ${i} は配列の範囲外です`, line);
          return r;
        };
        if (e.axis === 'row') return sumOf(rowOf(n).items);
        return sumOf(a.items.map((_, i) => {
          const r = rowOf(i + 1);
          if (!isInt(n) || n < 1 || n > r.items.length) throw new PseudoError(`列番号 ${n} は配列の範囲外です`, line);
          return r.items[n - 1];
        }));
      }
      case 'any': {
        const a = this.eval(e.target, line);
        if (typeof a !== 'object' || a.t !== 'arr') throw new PseudoError(`${exprText(e.target)} は配列ではありません`, line);
        const v = this.eval(e.value, line);
        const hit = a.items.some((x) => equals(x, v));
        return e.neg ? !hit : hit;
      }
      case 'without': {
        const a = this.eval(e.target, line);
        if (typeof a !== 'object' || a.t !== 'arr') throw new PseudoError(`${exprText(e.target)} は配列ではありません`, line);
        const v = this.eval(e.value, line);
        return { t: 'arr', items: a.items.filter((x) => !equals(x, v)).map(cloneValue) };
      }
      case 'idx': {
        const { container, index } = this.resolveIndex(e, line);
        return container.items[index];
      }
      case 'mem': {
        const o = this.eval(e.target, line);
        if (typeof o !== 'object' || o.t !== 'obj') throw new PseudoError(`${exprText(e.target)} はインスタンスではありません（${formatValue(o)}）`, line);
        if (!(e.name in o.fields)) throw new PseudoError(`メンバ変数 ${e.name} はありません`, line);
        return o.fields[e.name];
      }
      case 'len':
      case 'rows': {
        const a = this.eval(e.target, line);
        if (typeof a === 'string' && e.k === 'len') return [...a].length;
        if (typeof a !== 'object' || a.t !== 'arr') throw new PseudoError(`${exprText(e.target)} は配列ではありません`, line);
        return a.items.length;
      }
      case 'cols': {
        const a = this.eval(e.target, line);
        if (typeof a !== 'object' || a.t !== 'arr') throw new PseudoError(`${exprText(e.target)} は配列ではありません`, line);
        const first = a.items[0];
        if (typeof first !== 'object' || first.t !== 'arr') return 0;
        return first.items.length;
      }
      case 'call':
        return this.evalCall(e, line);
      case 'un': {
        const v = this.eval(e.e, line);
        if (e.op === 'not') {
          if (typeof v !== 'boolean') throw new PseudoError('not の対象が論理型ではありません', line);
          return !v;
        }
        const n = this.num(v, line);
        return e.op === '-' ? -n : n;
      }
      case 'bin':
        return this.evalBin(e, line);
    }
  }

  private evalFn(e: Extract<Expr, { k: 'fn' }>, line: number): Value {
    const v = this.eval(e.e, line);
    switch (e.fn) {
      case 'sqrt': {
        const n = this.num(v, line);
        if (n < 0) throw new PseudoError('負の数の正の平方根は求められません', line);
        return Math.sqrt(n);
      }
      case 'intpart':
        return Math.floor(this.num(v, line));
      case 'sq': {
        const n = this.num(v, line);
        return n * n;
      }
      case 'nchars':
        if (typeof v !== 'string') throw new PseudoError(`${exprText(e.e)} は文字列ではありません`, line);
        return [...v].length;
      case 'sumall':
        return this.flatten(v, line).reduce<number>((acc, x) => acc + this.num(x, line), 0);
      case 'uniqsort': {
        const strs = this.flatten(v, line).map((x) => {
          if (typeof x !== 'string') throw new PseudoError(`文字列以外の値 ${formatValue(x)} が含まれています`, line);
          return x;
        });
        return { t: 'arr', items: [...new Set(strs)].sort((a, b) => (a < b ? -1 : a > b ? 1 : 0)) };
      }
    }
  }

  private evalCall(e: Extract<Expr, { k: 'call' }>, line: number): Value {
    if (e.callee.k === 'var') {
      const name = e.callee.name;
      const f = this.program.funcs[name];
      const args = e.args.map((a) => this.eval(a, line));
      if (f) {
        const r = this.callFunc(f, args, line);
        this.tick(line);
        return r === undefined ? UNDEF : r;
      }
      const cls = this.opts.classes?.[name];
      if (cls) {
        const fields: Record<string, Value> = {};
        for (const fn of cls.fields) fields[fn] = UNDEF;
        cls.ctor.forEach((fn, i) => { fields[fn] = args[i] ?? UNDEF; });
        return { t: 'obj', cls: name, fields };
      }
      const b = BUILTINS[name];
      if (b) return b(args, line);
      throw new PseudoError(`関数 ${name} は定義されていません`, line);
    }
    throw new PseudoError('呼び出せない式です', line);
  }

  private evalBin(e: Extract<Expr, { k: 'bin' }>, line: number): Value {
    if (e.op === 'and' || e.op === 'or') {
      // 短絡評価（IPA の擬似言語の問題では短絡評価を前提とした記述が一般的）
      const l = this.eval(e.l, line);
      if (typeof l !== 'boolean') throw new PseudoError(`${e.op} の左辺が論理型ではありません`, line);
      if (e.op === 'and' && !l) return false;
      if (e.op === 'or' && l) return true;
      const r = this.eval(e.r, line);
      if (typeof r !== 'boolean') throw new PseudoError(`${e.op} の右辺が論理型ではありません`, line);
      return r;
    }
    const l = this.eval(e.l, line);
    const r = this.eval(e.r, line);
    switch (e.op) {
      case '=':
        return equals(l, r);
      case '≠':
        return !equals(l, r);
    }
    if (e.op === '+' && (typeof l === 'string' || typeof r === 'string')) {
      return (typeof l === 'string' ? l : formatValue(l)) + (typeof r === 'string' ? r : formatValue(r));
    }
    if ((typeof l === 'string' && typeof r === 'string') && ['<', '>', '≦', '≧'].includes(e.op)) {
      return compare(e.op, l < r ? -1 : l > r ? 1 : 0);
    }
    const a = this.num(l, line);
    const b = this.num(r, line);
    switch (e.op) {
      case '+': return a + b;
      case '-': return a - b;
      case '×': return a * b;
      case '÷':
        if (b === 0) throw new PseudoError('0 で除算しました', line);
        return a / b;
      case 'mod':
        if (b === 0) throw new PseudoError('0 で剰余算をしました', line);
        return a - b * Math.floor(a / b);
      case 'quot':
      case 'rem': {
        if (!isInt(a) || !isInt(b) || a < 0 || b <= 0) {
          throw new PseudoError(`「÷ の${e.op === 'quot' ? '商' : '余り'}」は 0 以上の整数を正の整数で割る場合だけ使えます（${a} ÷ ${b}）`, line);
        }
        return e.op === 'quot' ? Math.floor(a / b) : a % b;
      }
      case '∧': return (a & b) >>> 0;
      case '∨': return (a | b) >>> 0;
      case '▽': return (a ^ b) >>> 0;
      case '≪': return this.opts.bitLiterals ? (a << b) & 0xff : a << b;
      case '≫': return a >>> b;
      case '<': case '>': case '≦': case '≧':
        return compare(e.op, a < b ? -1 : a > b ? 1 : 0);
    }
    throw new PseudoError(`演算子 ${e.op} は使えません`, line);
  }
}

function compare(op: string, c: number): boolean {
  switch (op) {
    case '<': return c < 0;
    case '>': return c > 0;
    case '≦': return c <= 0;
    default: return c >= 0;
  }
}

export function equals(a: Value, b: Value): boolean {
  if (typeof a !== 'object' || typeof b !== 'object') return a === b;
  if (a.t === 'undef' || b.t === 'undef') return a.t === b.t;
  return a === b;
}

export function cloneValue(v: Value): Value {
  if (typeof v !== 'object' || v.t === 'undef') return v;
  if (v.t === 'arr') return { t: 'arr', items: v.items.map(cloneValue) };
  return { t: 'obj', cls: v.cls, fields: Object.fromEntries(Object.entries(v.fields).map(([k, x]) => [k, cloneValue(x)])) };
}

function rootName(e: Expr): string {
  if (e.k === 'var') return e.name;
  if (e.k === 'idx' || e.k === 'mem') return rootName(e.target);
  return '';
}

export function exprText(e: Expr): string {
  switch (e.k) {
    case 'var': return e.name;
    case 'num': return String(e.v);
    case 'str': return `"${e.v}"`;
    case 'bool': return String(e.v);
    case 'undef': return '未定義';
    case 'idx': return `${exprText(e.target)}[${e.index.map((x) => exprText(x)).join(', ')}]`;
    case 'mem': return `${exprText(e.target)}.${e.name}`;
    case 'len': return `${exprText(e.target)}の要素数`;
    case 'rows': return `${exprText(e.target)}の行数`;
    case 'cols': return `${exprText(e.target)}の列数`;
    case 'call': return `${exprText(e.callee)}(${e.args.map(exprText).join(', ')})`;
    case 'un': return `${e.op === 'not' ? 'not ' : e.op}${exprText(e.e)}`;
    case 'bin':
      if (e.op === 'quot' || e.op === 'rem') return `(${exprText(e.l)} ÷ ${exprText(e.r)} の${e.op === 'quot' ? '商' : '余り'})`;
      return `(${exprText(e.l)} ${e.op} ${exprText(e.r)})`;
    case 'arr': return `{${e.items.map(exprText).join(', ')}}`;
    case 'fill': return `{${exprText(e.count)}個の${exprText(e.value)}}`;
    case 'fill2': return `{${exprText(e.rows)}行${exprText(e.cols)}列の${exprText(e.value)}}`;
    case 'fn': {
      const suffix = { sqrt: 'の正の平方根', intpart: 'の整数部分', sq: 'の2乗', nchars: 'の文字数', sumall: 'の要素の和', uniqsort: 'に含まれる文字列を重複なく辞書順に格納した配列' }[e.fn];
      return `${exprText(e.e)}${suffix}`;
    }
    case 'charAt': return `${exprText(e.target)}の${exprText(e.index)}文字目の文字`;
    case 'sumline': return `${exprText(e.target)}の${e.axis === 'row' ? '行' : '列'}番号${exprText(e.index)}の要素の和`;
    case 'any': return `${exprText(e.target)}の要素のいずれ${e.neg ? 'にも' : 'かに'}${exprText(e.value)}が格納されて${e.neg ? 'いない' : 'いる'}`;
    case 'without': return `${exprText(e.target)}の複製から値が${exprText(e.value)}である要素を除いた配列`;
  }
}

/** 問題文で定義されることが多い基本的な関数（問題文で定義を示したうえで使う） */
const BUILTINS: Record<string, (args: Value[], line: number) => Value> = {
  // 文字列 s の長さ
  length: (a, line) => {
    if (typeof a[0] !== 'string') throw new PseudoError('length の引数は文字列です', line);
    return [...a[0]].length;
  },
  // 文字列 s の i 文字目から n 文字（1始まり）
  substring: (a, line) => {
    if (typeof a[0] !== 'string') throw new PseudoError('substring の第1引数は文字列です', line);
    const s = [...a[0]];
    return s.slice((a[1] as number) - 1, (a[1] as number) - 1 + (a[2] as number)).join('');
  },
  // 整数部（小数点以下切捨て）
  int: (a) => Math.floor(a[0] as number),
};

export function runProgram(source: string, entry?: string, args: unknown[] = [], opts: RunOptions = {}): RunResult {
  return new Interpreter(source, opts).run(entry, args);
}
