import { formatDateTime, isOverdue, relativeDue } from '../lib/dates.js';

/** Hạn nộp: đỏ nếu đã quá hạn. */
export function DueDate({ dueAt, now }: { dueAt: number | null; now: number }) {
  if (dueAt === null) return <span className="muted">Không có hạn nộp</span>;
  const overdue = isOverdue(dueAt, now);
  return (
    <span className={overdue ? 'due overdue' : 'due'}>
      Hạn nộp: {formatDateTime(dueAt)} ({relativeDue(dueAt, now)})
    </span>
  );
}
