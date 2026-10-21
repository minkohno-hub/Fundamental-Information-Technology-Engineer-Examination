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
  it('末尾に空行があっても終了ステップは表示される最後の行を指す', () => {
    const r = runProgram('整数型: x ← 1\nx ← x × 2\n\n\n', undefined, [], { trace: true });
    expect(r.trace[r.trace.length - 1].line).toBe(2);
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

describe('IPA 公開問題で使われる記法（拡張）', () => {
  const ev = (s: string) => toPlain(new Interpreter('').eval(parseExpr(s), 1));
  const vars = (src: string) => Object.fromEntries(Object.entries(runProgram(src).mainVars).map(([k, v]) => [k, toPlain(v)]));

  it('÷ の商・÷ の余り（非負整数）', () => {
    expect(ev('7 ÷ 2 の商')).toBe(3);
    expect(ev('7 ÷ 2 の余り')).toBe(1);
    expect(ev('(3 ＋ 4) ÷ 2 の商 ＋ 1')).toBe(4);
    expect(ev('7 ÷ 2')).toBe(3.5); // 通常の ÷ は実数除算のまま
    expect(() => ev('-7 ÷ 2 の商')).toThrow(/非負|0 以上/);
    expect(() => ev('7 ÷ 0 の商')).toThrow();
  });
  it('正の平方根・整数部分・2乗・∞', () => {
    expect(ev('9の正の平方根')).toBe(3);
    expect(ev('10の正の平方根の整数部分')).toBe(3);
    expect(ev('(3 × 3)の2乗')).toBe(81);
    expect(ev('1 ＋ 2の2乗 × 3')).toBe(13);
    expect(ev('－∞ ＜ 0')).toBe(true);
  });
  it('文字列の文字数・i 文字目の文字', () => {
    const v = vars(`
文字列型: s ← "10010"
整数型: n ← sの文字数
文字列型: c ← s の (n － 4)文字目の文字
文字列型: d ← s の 2文字目の文字`);
    expect(v.n).toBe(5);
    expect(v.c).toBe('1');
    expect(v.d).toBe('0');
    expect(() => vars('文字列型: s ← "ab"\n文字列型: c ← s の 3文字目の文字')).toThrow(/範囲/);
  });
  it('二次元配列の初期化と要素の和', () => {
    const v = vars(`
整数型の二次元配列: m ← {2行3列の 0}
m[1, 2] ← 5
m[2, 1] ← 7
m[2, 3] ← 1
整数型: all ← mの要素の和
整数型: r2 ← mの行番号2の要素の和
整数型: c1 ← mの列番号1の要素の和
整数型の二次元配列: u ← {2行2列の 未定義の値}`);
    expect(v.m).toEqual([[0, 5, 0], [7, 0, 1]]);
    expect([v.all, v.r2, v.c1]).toEqual([13, 8, 7]);
    expect(v.u).toEqual([[null, null], [null, null]]);
  });
  it('行を共有しない 2 次元配列（行ごとに別の配列）', () => {
    const v = vars('整数型の二次元配列: m ← {2行2列の 0}\nm[1, 1] ← 9');
    expect(v.m).toEqual([[9, 0], [0, 0]]);
  });
  it('繰返し処理を終了する（最も内側の繰返し）', () => {
    const v = vars(`
整数型: i, j, c ← 0
for (i を 1 から 3 まで 1 ずつ増やす)
  for (j を 1 から 5 まで 1 ずつ増やす)
    if (j ＞ i)
      繰返し処理を終了する
    endif
    c ← c ＋ 1
  endfor
endfor
整数型: k ← 0
while (true)
  k ← k ＋ 1
  if (k ≧ 4)
    繰返し処理を終了する
  endif
endwhile`);
    expect(v.c).toBe(6);
    expect(v.k).toBe(4);
  });
  it('αの行から始まる繰返し処理を終了する（外側の繰返しを抜ける）', () => {
    const v = vars(`
整数型: i, j, c ← 0
for (i を 1 から 3 まで 1 ずつ増やす) // α
  for (j を 1 から 3 まで 1 ずつ増やす)
    c ← c ＋ 1
    if (c ＝ 4)
      αの行から始まる繰返し処理を終了する
    endif
  endfor
endfor`);
    expect(v.c).toBe(4);
    expect(v.i).toBe(2);
    expect(() => runProgram('整数型: i\nfor (i を 1 から 2 まで 1 ずつ増やす)\n  βの行から始まる繰返し処理を終了する\nendfor')).toThrow(/β/);
    expect(() => runProgram('繰返し処理を終了する')).toThrow(/外/);
  });
  it('do-while 内の終了と、関数内の終了は呼出し元の繰返しに影響しない', () => {
    const r = runProgram(`
○整数型: f(整数型: n)
  整数型: s ← 0
  while (true)
    s ← s ＋ 1
    if (s ≧ n)
      繰返し処理を終了する
    endif
  endwhile
  return s

○整数型: g()
  整数型: i, t ← 0
  for (i を 1 から 3 まで 1 ずつ増やす)
    t ← t ＋ f(i)
  endfor
  return t`, 'g');
    expect(r.returnValue).toBe(6);
  });
  it('値の入れ替え', () => {
    const v = vars(`
整数型の配列: d ← {1, 2, 3}
整数型: i ← 1
整数型: j ← 3
d[i]とd[j]の値を入れ替える`);
    expect(v.d).toEqual([3, 2, 1]);
  });
  it('配列全体の空白区切り出力・コンマ区切り出力', () => {
    const r = runProgram(`
整数型の配列: d ← {2, 1, 3}
文字列型: a ← "B"
実数型: b ← 1.5
dの全要素の値を要素番号の順に空白区切りで出力する
aの値とbの値をこの順にコンマ区切りで出力する`);
    expect(r.output).toEqual(['2 1 3', 'B,1.5']);
  });
  it('配列要素の値を n 増やす・減らす', () => {
    const v = vars('整数型の配列: d ← {1, 2}\n整数型: c ← 0\ncの値を1増やす\nd[2]の値を5増やす\nd[1]の値を3減らす');
    expect([v.c, v.d]).toEqual([1, [-2, 7]]);
  });
  it('orderにordersの要素を順に代入する', () => {
    const v = vars(`
整数型の配列の配列: orders ← {{1, 2}, {3}, {4, 5, 6}}
整数型の配列: order
整数型: n ← 0
for (orderにordersの要素を順に代入する)
  n ← n ＋ orderの要素数
endfor`);
    expect(v.n).toBe(6);
    expect(v.order).toEqual([4, 5, 6]);
  });
  it('いずれかの要素の値が…と等しい／格納されている／格納されていない', () => {
    const v = vars(`
整数型の配列: a ← {1, 2, 3}
整数型: x ← 2
整数型: y ← 9
論理型: p ← false
論理型: q ← false
論理型: r ← false
論理型: s ← false
if (aのいずれかの要素の値がxの値と等しい)
  p ← true
endif
if (aの要素のいずれかにyの値が格納されている)
  q ← true
endif
if (a の要素のいずれにも y の値 が格納されていない)
  r ← true
endif
if (aの要素のいずれかに a[3] の値 が格納されている)
  s ← true
endif`);
    expect([v.p, v.q, v.r, v.s]).toEqual([true, false, true, true]);
  });
  it('配列の複製から値が x である要素を除いた配列／重複なく辞書順に格納した配列', () => {
    const v = vars(`
文字列型配列の配列: o ← {{"B", "A"}, {"A", "C"}, {"B"}}
文字列型の配列: all ← oに含まれる文字列を重複なく辞書順に格納した配列
文字列型: k ← "B"
文字列型の配列: rest ← allの複製から値がkである要素を除いた配列`);
    expect(v.all).toEqual(['A', 'B', 'C']);
    expect(v.rest).toEqual(['A', 'C']);
  });
  it('日本語の比較表現: 括弧付きの左辺・複雑な左辺・未定義・and/or との組合せ', () => {
    expect(ev('(7 mod 4)が3と等しい')).toBe(true);
    expect(ev('(7 mod 4)が3と等しくない')).toBe(false);
    expect(ev('7 ÷ 2 の余り が 1 と等しい')).toBe(true);
    expect(ev('1 ＋ 2が3以下 and 5が4より大きい')).toBe(true);
    expect(ev('3が3より小さい or 3が3以上')).toBe(true);
    expect(ev('未定義の値が未定義')).toBe(true);
    expect(ev('1が未定義でない')).toBe(true);
    expect(ev('1が未定義')).toBe(false);
    expect(() => ev('1が')).toThrow();
  });
  it('for の別の制御記述（…から始めて…を超えない範囲で…ずつ増やす）', () => {
    const v = vars(`
整数型: j, c ← 0
for (j を 3 から始めて 15 を超えない範囲で 4 ずつ増やす)
  c ← c ＋ j
endfor
整数型: k, d ← 0
for (k を 10 から始めて 1 を下回らない範囲で 3 ずつ減らす)
  d ← d ＋ 1
endfor`);
    expect(v.c).toBe(3 + 7 + 11 + 15);
    expect(v.d).toBe(4);
  });
  it('複数行にまたがる文（括弧・演算子・コンマで続く行）', () => {
    const r = runProgram(`
○整数型: add3(整数型: a,
              整数型: b,
              整数型: c)
  整数型: s ←
    a ＋ b ×
    c
  return s`, 'add3', [1, 2, 3]);
    expect(r.returnValue).toBe(7);
  });
  it('トレースで break の行が記録される', () => {
    const r = runProgram('整数型: i\nfor (i を 1 から 3 まで 1 ずつ増やす)\n  繰返し処理を終了する\nendfor', undefined, [], { trace: true });
    expect(r.trace.some((t) => t.line === 3 && t.note.includes('終了'))).toBe(true);
  });
  it('「を」「である」で終わる行は次の行と連結される（自然言語の記述）', () => {
    const v = vars(`
文字列型配列の配列: o ← {{"b", "a"}, {"a"}}
文字列型の配列: all ← oに含まれる文字列を
                      重複なく辞書順に格納した配列
                      // コメントだけの行
文字列型: k ← "a"
文字列型の配列: rest ← allの複製から値がkである
                      要素を除いた配列`);
    expect(v.all).toEqual(['a', 'b']);
    expect(v.rest).toEqual(['b']);
  });
});
