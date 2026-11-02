// Reducer thuần dùng chung: server dùng để giữ snapshot (F5, kết nối lại), giao diện dùng để vẽ trang.
// Một chỗ duy nhất quy định mỗi sự kiện làm thay đổi trạng thái thế nào. Không sửa trạng thái cũ.
import type { ApprovalStatus, HarnessEvent, StateSnapshot, Turn } from './events.js';

export function emptySnapshot(model: string, maxSteps: number): StateSnapshot {
  return {
    seq: 0,
    turns: [],
    busy: false,
    busyKind: null,
    maxSteps,
    model,
    session: { input: 0, cached: null, output: 0, costUsd: 0, questions: 0 },
    eval: { running: false, rows: [] },
  };
}

function updateTurn(s: StateSnapshot, n: number, change: (t: Turn) => Turn): StateSnapshot {
  if (!s.turns.some((t) => t.n === n)) return s;
  return { ...s, turns: s.turns.map((t) => (t.n === n ? change(t) : t)) };
}

function statusOf(approved: boolean, reason: 'user' | 'timeout'): ApprovalStatus {
  if (approved) return 'approved';
  return reason === 'timeout' ? 'timeout' : 'rejected';
}

export function reduce(s: StateSnapshot, e: HarnessEvent): StateSnapshot {
  switch (e.type) {
    case 'question':
      return { ...s, turns: [...s.turns, { n: e.n, question: e.text, steps: [], approvals: [] }] };
    case 'step':
      return updateTurn(s, e.n, (t) => ({ ...t, steps: [...t.steps, e.step] }));
    case 'summary':
      return updateTurn(s, e.n, (t) => ({ ...t, summary: e.summary }));
    case 'answer':
      return updateTurn(s, e.n, (t) => ({ ...t, answer: e.text }));
    case 'error':
      return updateTurn(s, e.n, (t) => ({ ...t, error: e.message }));
    case 'approval':
      return updateTurn(s, e.n, (t) => ({ ...t, approvals: [...t.approvals, { ...e.approval, status: 'pending' }] }));
    case 'approval-resolved': {
      const owner = s.turns.find((t) => t.approvals.some((a) => a.id === e.id));
      if (!owner) return s;
      const status = statusOf(e.approved, e.reason);
      return updateTurn(s, owner.n, (t) => ({
        ...t,
        approvals: t.approvals.map((a) => (a.id === e.id ? { ...a, status } : a)),
      }));
    }
    case 'busy':
      return { ...s, busy: e.busy, busyKind: e.kind };
    case 'settings':
      return { ...s, maxSteps: e.maxSteps };
    case 'reset':
      return { ...s, turns: [] };
    case 'session':
      return { ...s, session: e.total };
    case 'eval-start':
      return e.index === 0
        ? { ...s, eval: { running: true, rows: [], current: e.student } }
        : { ...s, eval: { ...s.eval, current: e.student, waiting: undefined } };
    case 'eval-wait':
      return { ...s, eval: { ...s.eval, waiting: e.student } };
    case 'eval-row':
      return { ...s, eval: { ...s.eval, rows: [...s.eval.rows, e.row], waiting: undefined, current: undefined } };
    case 'eval-done':
      return { ...s, eval: { running: false, rows: s.eval.rows, report: e.report } };
    case 'grade-saved':
      return s;
  }
}
