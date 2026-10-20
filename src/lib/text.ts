// 文字列の正規化（検索・重複検出・入力式の採点で共通に使う）

/** 全角/半角・大文字/小文字・空白の違いを吸収した比較用文字列 */
export function normalizeForCompare(s: string): string {
  return s
    .normalize('NFKC')
    .toLowerCase()
    .replace(/[ァ-ヶ]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0x60)) // カタカナ→ひらがな
    .replace(/[ー－―‐-]/g, '-')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * 入力式の解答の正規化。表記揺れ（全角/半角、空白、大文字小文字、長音記号の有無）は吸収するが、
 * 記号や演算子の違い（例: ≦ と <、× と +）は区別したまま残す。
 */
export function normalizeAnswerInput(s: string): string {
  return s
    .normalize('NFKC')
    .replace(/[−－]/g, '-')
    .replace(/<=/g, '≦')
    .replace(/>=/g, '≧')
    .replace(/!=/g, '≠')
    .replace(/\*/g, '×')
    .replace(/\//g, '÷')
    .replace(/<-/g, '←')
    .replace(/ー$/g, '')
    .replace(/\s+/g, '')
    .toLowerCase();
}

export function isAcceptedInput(input: string, accepted: string[]): boolean {
  const n = normalizeAnswerInput(input);
  if (!n) return false;
  return accepted.some((a) => normalizeAnswerInput(a) === n);
}

/** 検索用：ひらがな化・小文字化した上で空白区切りの全語を含むか */
export function matchesQuery(haystack: string, query: string): boolean {
  const h = normalizeForCompare(haystack);
  return normalizeForCompare(query)
    .split(' ')
    .filter(Boolean)
    .every((w) => h.includes(w));
}
