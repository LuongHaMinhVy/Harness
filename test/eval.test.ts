import { expect, test } from 'vitest';
import { extractScore, scoreEval, type Golden, type Outcome } from '../src/eval.js';
import type { StepLog } from '../src/logger.js';

const golden: Golden = {
  a: { score: 10, mustMention: [] },
  b: { score: 8, mustMention: [] },
  c: { score: 5, mustMention: [] },
};
const out = (student: string, aiScore: number | null, answer = '', costUsd = 0.001): Outcome => ({ student, aiScore, answer, costUsd });

test('scoreEval: lệch [0,1,3] → mae 1.33, within1Pct 66.7', () => {
  const r = scoreEval(golden, [out('a', 10), out('b', 9), out('c', 2)]);
  expect(r.rows.map((x) => x.diff)).toEqual([0, 1, 3]);
  expect(r.mae).toBeCloseTo(1.333, 2);
  expect(r.within1Pct).toBeCloseTo(66.7, 1);
  expect(r.totalCostUsd).toBeCloseTo(0.003);
});

test('scoreEval: aiScore null → vào noScore, không tính vào mae', () => {
  const r = scoreEval(golden, [out('a', 9), out('b', null), out('c', 5)]);
  expect(r.noScore).toEqual(['b']);
  expect(r.mae).toBeCloseTo(0.5);
  expect(r.within1Pct).toBeCloseTo(66.7, 1);
});

test('scoreEval: mustMention "rỗng|empty" khớp "Empty array" → mentionsOk', () => {
  const g: Golden = { lan: { score: 9, mustMention: ['rỗng|empty', 'TypeError'] } };
  const ok = scoreEval(g, [out('lan', 9, 'Fails on Empty array; TypeError ok')]);
  expect(ok.rows[0]).toMatchObject({ mentionsOk: true, missing: [] });
  const bad = scoreEval(g, [out('lan', 9, 'Fails on empty array')]);
  expect(bad.rows[0]).toMatchObject({ mentionsOk: false, missing: ['TypeError'] });
  expect(bad.mentionPct).toBe(0);
});

test('extractScore lấy save_grade saved cuối, bỏ qua rejected', () => {
  const usage = { input: 0, cached: null, output: 0 };
  const steps: StepLog[] = [
    { index: 1, finishReason: 'tool-calls', usage, ms: 0, toolCalls: [{ name: 'save_grade', input: { score: 6 }, output: { status: 'saved' } }] },
    { index: 2, finishReason: 'tool-calls', usage, ms: 0, toolCalls: [{ name: 'save_grade', input: { score: 8 }, output: { status: 'saved' } }] },
    { index: 3, finishReason: 'tool-calls', usage, ms: 0, toolCalls: [{ name: 'save_grade', input: { score: 2 }, output: { status: 'rejected_by_user' } }] },
  ];
  expect(extractScore(steps)).toBe(8);
  expect(extractScore([])).toBeNull();
});
