import { expect, test } from 'vitest';
import { emptySnapshot } from '../../src/shared/reduce.js';
import { applyEnvelope, applySnapshot, initialUi } from '../../web/src/uiState.js';

const snap = { ...emptySnapshot('m', 6), seq: 5 };

test('chưa có snapshot thì bỏ qua sự kiện', () => {
  const ui = applyEnvelope(initialUi, { seq: 1, event: { type: 'question', n: 1, text: 'q' } });
  expect(ui.snap).toBeNull();
});

test('sự kiện có seq ≤ snapshot.seq bị bỏ qua (đã nằm trong snapshot)', () => {
  const ui = applySnapshot(initialUi, snap);
  const after = applyEnvelope(ui, { seq: 5, event: { type: 'question', n: 1, text: 'q' } });
  expect(after.snap?.turns).toEqual([]);
});

test('sự kiện mới hơn được áp dụng và cập nhật seq', () => {
  const ui = applySnapshot(initialUi, snap);
  const after = applyEnvelope(ui, { seq: 6, event: { type: 'question', n: 1, text: 'q' } });
  expect(after.snap?.turns).toHaveLength(1);
  expect(after.snap?.seq).toBe(6);
});

test('grade-saved tăng gradesVersion để bảng điểm tự tải lại', () => {
  const ui = applySnapshot(initialUi, snap);
  const after = applyEnvelope(ui, { seq: 6, event: { type: 'grade-saved', student: 'nam' } });
  expect(after.gradesVersion).toBe(ui.gradesVersion + 1);
});
