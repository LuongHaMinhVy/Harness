import { expect, test } from 'vitest';
import { emptySnapshot, reduce } from '@harness/shared/reduce';
import type { HarnessEvent, StateSnapshot } from '@harness/shared/events';
import type { EvalReport, EvalRow } from '../src/types.js';

const usage = { input: 10, cached: 0, output: 2 };
const step = { index: 1, toolCalls: [], finishReason: 'stop', usage, ms: 5 };
const approval = { id: 'a1', assignment: 'sum-array', student: 'nam', score: 9, comments: 'tốt', expiresAt: 1 };
const row: EvalRow = { student: 'nam', aiScore: 10, answer: '', costUsd: 0, goldScore: 10, diff: 0, mentionsOk: true, missing: [] };

const run = (events: HarnessEvent[], from: StateSnapshot = emptySnapshot('m', 6)) => events.reduce(reduce, from);

test('emptySnapshot có model, maxSteps và không có câu hỏi', () => {
  expect(emptySnapshot('gemini', 6)).toMatchObject({ model: 'gemini', maxSteps: 6, turns: [], busy: false, busyKind: null });
});

test('question thêm turn; step, summary, answer gắn đúng turn n', () => {
  const s = run([
    { type: 'question', n: 1, text: 'Chấm Nam' },
    { type: 'question', n: 2, text: 'So sánh' },
    { type: 'step', n: 1, step },
    { type: 'answer', n: 1, text: 'Nam 10' },
    { type: 'error', n: 2, message: 'lỗi' },
  ]);
  expect(s.turns.map((t) => t.question)).toEqual(['Chấm Nam', 'So sánh']);
  expect(s.turns[0].steps).toHaveLength(1);
  expect(s.turns[0].answer).toBe('Nam 10');
  expect(s.turns[1].error).toBe('lỗi');
});

test('approval thêm thẻ pending; approval-resolved đổi status theo lý do', () => {
  const s = run([
    { type: 'question', n: 1, text: 'q' },
    { type: 'approval', n: 1, approval },
    { type: 'approval', n: 1, approval: { ...approval, id: 'a2' } },
    { type: 'approval', n: 1, approval: { ...approval, id: 'a3' } },
    { type: 'approval-resolved', id: 'a1', approved: true, reason: 'user' },
    { type: 'approval-resolved', id: 'a2', approved: false, reason: 'user' },
    { type: 'approval-resolved', id: 'a3', approved: false, reason: 'timeout' },
  ]);
  expect(s.turns[0].approvals.map((a) => a.status)).toEqual(['approved', 'rejected', 'timeout']);
});

test('busy, settings, session, reset cập nhật trạng thái chung', () => {
  const total = { input: 1, cached: null, output: 1, costUsd: 0.1, questions: 1 };
  const s = run([
    { type: 'question', n: 1, text: 'q' },
    { type: 'busy', busy: true, kind: 'ask' },
    { type: 'settings', maxSteps: 2 },
    { type: 'session', total },
    { type: 'reset' },
  ]);
  expect(s).toMatchObject({ busy: true, busyKind: 'ask', maxSteps: 2, session: total, turns: [] });
});

test('eval-start index 0 làm mới bảng; eval-wait, eval-row, eval-done', () => {
  const report = { rows: [row], mae: 0, within1Pct: 100, mentionPct: 100, noScore: [], totalCostUsd: 0 } satisfies EvalReport;
  const s1 = run([
    { type: 'eval-start', student: 'nam', index: 0, total: 1 },
    { type: 'eval-wait', student: 'nam' },
  ]);
  expect(s1.eval).toMatchObject({ running: true, rows: [], current: 'nam', waiting: 'nam' });
  const s2 = run([{ type: 'eval-row', row, index: 0, total: 1 }, { type: 'eval-done', report }], s1);
  expect(s2.eval).toMatchObject({ running: false, rows: [row], report });
  expect(s2.eval.waiting).toBeUndefined();
  const s3 = run([{ type: 'eval-start', student: 'nam', index: 0, total: 1 }], s2);
  expect(s3.eval).toMatchObject({ running: true, rows: [] });
  expect(s3.eval.report).toBeUndefined();
});

test('sự kiện cho turn không tồn tại không làm crash và không đổi gì', () => {
  const before = emptySnapshot('m', 6);
  const after = run([{ type: 'step', n: 9, step }, { type: 'approval-resolved', id: 'x', approved: true, reason: 'user' }], before);
  expect(after.turns).toEqual([]);
});

test('reduce không sửa trạng thái cũ (bất biến)', () => {
  const before = run([{ type: 'question', n: 1, text: 'q' }]);
  const snapshot = JSON.stringify(before);
  reduce(before, { type: 'step', n: 1, step });
  expect(JSON.stringify(before)).toBe(snapshot);
});

test('eval-row xoá học viên đang chấm (đang giãn nhịp trước bài tiếp theo)', () => {
  const s = run([
    { type: 'eval-start', student: 'nam', index: 0, total: 2 },
    { type: 'eval-row', row, index: 0, total: 2 },
  ]);
  expect(s.eval.current).toBeUndefined();
  expect(s.eval.running).toBe(true);
});

test('eval-error lưu lý do lỗi theo học viên; eval-start index 0 xoá lỗi cũ', () => {
  const s1 = run([
    { type: 'eval-start', student: 'nam', index: 0, total: 1 },
    { type: 'eval-error', student: 'nam', message: 'API key không hợp lệ' },
  ]);
  expect(s1.eval.errors).toEqual([{ student: 'nam', message: 'API key không hợp lệ' }]);
  const s2 = run([{ type: 'eval-start', student: 'nam', index: 0, total: 1 }], s1);
  expect(s2.eval.errors).toEqual([]);
});
