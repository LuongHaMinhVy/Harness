import { randomUUID } from 'node:crypto';
import type { Approver } from '@harness/core/approval';
import type { HarnessEvent, PendingApproval } from '@harness/shared/events';

type Waiting = { approval: PendingApproval; settle: (approved: boolean) => void; timer: NodeJS.Timeout };

// Approver cho web: save_grade dừng ở Promise này tới khi người dùng bấm Duyệt/Từ chối (POST /api/approve).
// Mỗi yêu cầu có id ngẫu nhiên dùng một lần; quá timeout thì tự từ chối để agent không treo khi trình duyệt đóng.
export function createWebApprover(opts: {
  emit: (e: HarnessEvent) => void;
  turn: () => number;
  timeoutMs?: number;
  newId?: () => string;
}) {
  const timeoutMs = opts.timeoutMs ?? 300_000;
  const newId = opts.newId ?? randomUUID;
  const waiting = new Map<string, Waiting>();

  function finish(id: string, approved: boolean, reason: 'user' | 'timeout'): boolean {
    const w = waiting.get(id);
    if (!w) return false;
    waiting.delete(id);
    clearTimeout(w.timer);
    opts.emit({ type: 'approval-resolved', id, approved, reason });
    w.settle(approved);
    return true;
  }

  const approve: Approver = (req) =>
    new Promise<boolean>((settle) => {
      const id = newId();
      const approval: PendingApproval = { id, ...req, expiresAt: Date.now() + timeoutMs };
      const timer = setTimeout(() => finish(id, false, 'timeout'), timeoutMs);
      waiting.set(id, { approval, settle, timer });
      opts.emit({ type: 'approval', n: opts.turn(), approval });
    });

  return {
    approve,
    resolve: (id: string, approved: boolean) => finish(id, approved, 'user'),
    pending: () => [...waiting.values()].map((w) => w.approval),
    rejectAll: () => [...waiting.keys()].forEach((id) => finish(id, false, 'user')),
  };
}
