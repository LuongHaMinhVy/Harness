import { afterEach, expect, test, vi } from 'vitest';
import type { HarnessEvent } from '@harness/shared/events';
import { createWebApprover } from '../src/webApprover.js';

const req = { assignment: 'sum-array', student: 'nam', score: 9, comments: 'tốt' };

function setup(timeoutMs = 300_000) {
  const events: HarnessEvent[] = [];
  let i = 0;
  const approver = createWebApprover({ emit: (e) => events.push(e), timeoutMs, newId: () => `id-${++i}`, turn: () => 1 });
  return { approver, events };
}

afterEach(() => vi.useRealTimers());

test('phát sự kiện approval có expiresAt, resolve(id, true) → Promise true', async () => {
  const { approver, events } = setup();
  const p = approver.approve(req);
  expect(events[0]).toMatchObject({ type: 'approval', n: 1, approval: { id: 'id-1', student: 'nam', score: 9 } });
  expect(approver.pending()).toHaveLength(1);
  expect(approver.resolve('id-1', true)).toBe(true);
  expect(await p).toBe(true);
  expect(events.at(-1)).toEqual({ type: 'approval-resolved', id: 'id-1', approved: true, reason: 'user' });
  expect(approver.pending()).toHaveLength(0);
});

test('id lạ → false; resolve lần 2 cùng id → false', async () => {
  const { approver } = setup();
  const p = approver.approve(req);
  expect(approver.resolve('khong-co', true)).toBe(false);
  expect(approver.resolve('id-1', false)).toBe(true);
  expect(await p).toBe(false);
  expect(approver.resolve('id-1', true)).toBe(false);
});

test('hai yêu cầu cùng chờ, resolve từng cái độc lập', async () => {
  const { approver } = setup();
  const a = approver.approve(req);
  const b = approver.approve({ ...req, student: 'lan' });
  expect(approver.pending().map((x) => x.student)).toEqual(['nam', 'lan']);
  approver.resolve('id-2', true);
  approver.resolve('id-1', false);
  expect(await Promise.all([a, b])).toEqual([false, true]);
});

test('quá thời gian chờ → tự từ chối với reason timeout', async () => {
  vi.useFakeTimers();
  const { approver, events } = setup(1000);
  const p = approver.approve(req);
  vi.advanceTimersByTime(1001);
  expect(await p).toBe(false);
  expect(events.at(-1)).toEqual({ type: 'approval-resolved', id: 'id-1', approved: false, reason: 'timeout' });
  expect(approver.resolve('id-1', true)).toBe(false);
});

test('rejectAll từ chối mọi yêu cầu đang chờ', async () => {
  const { approver } = setup();
  const a = approver.approve(req);
  approver.rejectAll();
  expect(await a).toBe(false);
  expect(approver.pending()).toHaveLength(0);
});
