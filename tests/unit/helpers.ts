// テスト用の問題データを作る補助関数
import type { Question } from '../../src/types';

export function makeQuestion(id: string, over: Partial<Question> = {}): Question {
  return {
    id,
    syllabusVersion: '9.2',
    subject: 'A',
    depth: 'quick',
    category: '1',
    subcategory: '1-1',
    topicIds: ['1-1-1'],
    questionType: 'choice',
    difficulty: 2,
    questionText: `問題 ${id}`,
    choices: ['a', 'b', 'c', 'd'],
    correctAnswer: 0,
    explanation: '解説',
    choiceExplanations: ['正解です。', 'x', 'y', 'z'],
    relatedConcepts: [],
    relatedQuestionIds: [],
    source: { kind: 'original', title: 'テスト', terms: 'MIT', termsCheckedAt: '2026-10-21', modified: false },
    licenseStatus: 'original',
    verificationStatus: 'verified',
    contentVersion: 1,
    ...over,
  } as Question;
}

/** 分野ごとに n 問ずつ作る */
export function makePool(categories: string[], n: number, over: Partial<Question> = {}): Question[] {
  return categories.flatMap((c) => Array.from({ length: n }, (_, i) => makeQuestion(`Q${c.replace(/\W/g, '')}-${String(i + 1).padStart(3, '0')}`, { category: c, ...over })));
}
