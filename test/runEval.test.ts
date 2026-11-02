import { APICallError } from 'ai';
import { expect, test, vi } from 'vitest';
import { runEval, type Golden } from '../src/eval.js';
import type { StepLog } from '../src/logger.js';

const golden: Golden = {
  a: { score: 10, mustMention: [] },
  b: { score: 8, mustMention: ['rỗng'] },
  c: { score: 5, mustMention: [] },
};
const usage = { input: 0, cached: null, output: 0 };
const graded = (score: number): StepLog[] => [
  { index: 1, finishReason: 'tool-calls', usage, ms: 0, toolCalls: [{ name: 'save_grade', input: { score, comments: 'mảng rỗng' }, output: { status: 'saved' } }] },
];
const rateLimit = () =>
  new APICallError({ message: 'Resource exhausted', url: 'x', requestBodyValues: {}, statusCode: 429, isRetryable: true });

test('runEval chấm theo thứ tự golden, gọi onRow cho từng học viên và trả báo cáo', async () => {
  const ask = vi.fn(async (student: string) => ({ steps: graded(student === 'c' ? 2 : 9), text: 'xong', costUsd: 0.001 }));
  const rows: string[] = [];
  const report = await runEval({ golden, ask, sleep: async () => {} }, { onRow: (r, i, total) => rows.push(`${r.student}:${i}/${total}`) });
  expect(ask.mock.calls.map((c) => c[0])).toEqual(['a', 'b', 'c']);
  expect(rows).toEqual(['a:0/3', 'b:1/3', 'c:2/3']);
  expect(report.rows.map((r) => r.aiScore)).toEqual([9, 9, 2]);
  expect(report.rows[1].mentionsOk).toBe(true);
});

test('runEval: 429 → onWait rồi thử lại; lỗi khác → onError và không có điểm', async () => {
  let bCalls = 0;
  const ask = vi.fn(async (student: string) => {
    if (student === 'b' && bCalls++ === 0) throw rateLimit();
    if (student === 'c') throw new Error('hỏng');
    return { steps: graded(10), text: '', costUsd: 0 };
  });
  const waits: string[] = [];
  const errors: string[] = [];
  const report = await runEval(
    { golden, ask, sleep: async () => {} },
    { onWait: (s) => waits.push(s), onError: (s, m) => errors.push(`${s}:${m}`) },
  );
  expect(waits).toEqual(['b']);
  expect(errors).toEqual(['c:Lỗi khi gọi model: hỏng']);
  expect(report.noScore).toEqual(['c']);
});
