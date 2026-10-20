import { describe, expect, it } from 'vitest';
import { runProgram, toPlain, Interpreter } from '../../src/pseudo/interpreter';
import { parseExpr } from '../../src/pseudo/parser';

describe('式の解析と評価', () => {
  const ev = (s: string) => toPlain(new Interpreter('').eval(parseExpr(s), 1));
  it('演算子の優先順位（IPA の記述形式）', () => {
    expect(ev('1 ＋ 2 × 3')).toBe(7);
    expect(ev('(1 + 2) × 3')).toBe(9);
    expect(ev('10 mod 3 + 1')).toBe(2);
    expect(ev('7 ÷ 2')).toBe(3.5);
    expect(ev('-3 + 5')).toBe(2);
    expect(ev('1 < 2 and 3 > 4')).toBe(false);
    expect(ev('1 < 2 or 3 > 4')).toBe(true);
    expect(ev('not (1 = 2)')).toBe(true);
    expect(() => ev('not 1 = 2')).toThrow(); // not は関係演算子より優先度が高い
    expect(ev('2 ≦ 2 and 3 ≧ 4 or true')).toBe(true);
    expect(ev('5 ≠ 5')).toBe(false);
  });
  it('日本語の比較表現', () => {
    expect(ev('3が2以下')).toBe(false);
    expect(ev('2が2以上')).toBe(true);
    expect(ev('1が2より小さい')).toBe(true);
  });
  it('未定義', () => {
    expect(ev('未定義の値 = 未定義')).toBe(true);
  });
});

describe('IPA 公開問題（令和8年度 基本情報技術者試験 科目B）による検証', () => {
  // 出典：令和8年度 基本情報技術者試験 科目B 公開問題 問1（空欄を各選択肢で埋めて検証）
  const q1 = (fill: string) => `
整数型の配列: data ← {1, 2, 3, 4, 5, 6, 7, 8, 9}
整数型: top, i
整数型: len ← dataの要素数
top ← data[len]
for (i を ${fill})
  data[i] ← data[i － 1]
endfor
data[1] ← top`;
  const choices = ['2 から len － 1 まで 1 ずつ増やす', '2 から len まで 1 ずつ増やす', 'len － 1 から 2 まで 1 ずつ減らす', 'len から 2 まで 1 ずつ減らす'];
  it('問1: 正解エのみが期待結果になる', () => {
    const results = choices.map((c) => toPlain(runProgram(q1(c)).mainVars.data));
    const expected = [9, 1, 2, 3, 4, 5, 6, 7, 8];
    expect(results.map((r) => JSON.stringify(r) === JSON.stringify(expected))).toEqual([false, false, false, true]);
  });

  it('問2: 8ビット型の補数（正解カ）', () => {
    const prog = (fill: string) => `
○8ビット型: complement(8ビット型: x)
  8ビット型: y
  y ← ${fill}
  y ← y ＋ 00000001
  return y`;
    const fills = ['x ∧ 01111111', 'x ∧ 11111111', 'x ∨ 01111111', 'x ∨ 11111111', 'x ▽ 01111111', 'x ▽ 11111111'];
    const ok = fills.map((f) => [0, 1, 5, 77, 128, 200, 255].every((x) => {
      const r = runProgram(prog(f), 'complement', [x], { bitLiterals: true }).returnValue as number;
      return ((r + x) & 0xff) === 0;
    }));
    expect(ok).toEqual([false, false, false, false, false, true]);
  });

  it('問3: 再帰と繰返しの対応（正解ア）', () => {
    const prog = (fill: string) => `
○整数型: func1(整数型: n)
  if (nが2以下)
    return 1
  endif
  return 2 × func1(n － 2) ＋ func1(n － 1)

○整数型: func2(整数型: n)
  整数型の配列: data ← {1, 1, 1}
  整数型: i
  /* nが3より小さいときは繰返し処理を実行しない */
  for (iを3からnまで1ずつ増やす)
    data[1] ← data[2]
    data[2] ← data[3]
    data[3] ← ${fill}
  endfor
  return data[3]`;
    const fills = ['2 × data[1] ＋ data[2]', '2 × data[2] ＋ data[1]', '2 × data[i － 1] ＋ data[i － 2]', '2 × data[i － 2] ＋ data[i － 1]',
      'data[3] ＋ 2 × data[1] ＋ data[2]', 'data[3] ＋ 2 × data[2] ＋ data[1]', 'data[3] ＋ 2 × data[i － 1] ＋ data[i － 2]', 'data[3] ＋ 2 × data[i － 2] ＋ data[i － 1]'];
    const pass = fills.map((f) => {
      try {
        return [1, 2, 3, 4, 5, 6, 7, 8].every((n) => runProgram(prog(f), 'func2', [n]).returnValue === runProgram(prog(f), 'func1', [n]).returnValue);
      } catch {
        return false; // 配列の領域外参照など
      }
    });
    expect(pass).toEqual([true, false, false, false, false, false, false, false]);
  });
});

describe('制御構造とトレース', () => {
  it('while / do-while / elseif / 再帰 / 末尾追加', () => {
    const r = runProgram(`
整数型: i ← 0
整数型: s ← 0
整数型の配列: a ← {}
while (i < 5)
  i ← i + 1
  if (i mod 2 = 0)
    s ← s + i
  elseif (i = 3)
    s ← s + 100
  else
    a の末尾に i を追加する
  endif
endwhile
do
  i ← i - 1
while (i > 2)
`);
    expect(toPlain(r.mainVars.s)).toBe(106);
    expect(toPlain(r.mainVars.a)).toEqual([1, 5]);
    expect(toPlain(r.mainVars.i)).toBe(2);
  });
  it('配列の範囲外参照はエラーになる', () => {
    expect(() => runProgram('整数型の配列: a ← {1, 2}\n整数型: x ← a[3]')).toThrow(/範囲/);
  });
  it('トレースで変数と行番号を追跡できる', () => {
    const r = runProgram('整数型: x ← 1\nx ← x × 2\nx ← x + 3', undefined, [], { trace: true });
    expect(r.trace.map((t) => t.line)).toEqual([1, 2, 3, 3]);
    expect(r.trace[2].frames[0].vars.x).toBe(5);
  });
  it('クラスとメンバアクセス（単方向リスト）', () => {
    const r = runProgram(`
大域: ListElement: head ← 未定義の値
○append(整数型: v)
  ListElement: p
  if (head = 未定義)
    head ← ListElement(v)
  else
    p ← head
    while (p.next ≠ 未定義)
      p ← p.next
    endwhile
    p.next ← ListElement(v)
  endif
○整数型: total()
  整数型: s ← 0
  ListElement: p ← head
  while (p ≠ 未定義)
    s ← s + p.val
    p ← p.next
  endwhile
  return s
`, undefined, [], { classes: { ListElement: { fields: ['val', 'next'], ctor: ['val'] } } });
    expect(r.globals.head).toBeDefined();
  });
  it('二次元配列と n 個の値による初期化', () => {
    const r = runProgram(`
整数型の二次元配列: m ← {{1, 2, 3}, {4, 5, 6}}
整数型の配列: z ← {3個の0}
整数型: t ← m[2, 3] + mの行数 × 10 + mの列数 × 100
z[2] ← 7`);
    expect(toPlain(r.mainVars.t)).toBe(6 + 20 + 300);
    expect(toPlain(r.mainVars.z)).toEqual([0, 7, 0]);
  });
});
