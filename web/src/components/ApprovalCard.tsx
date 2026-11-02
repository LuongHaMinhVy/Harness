import { useEffect, useState } from 'react';
import type { ApprovalStatus, ApprovalView } from '../../../src/shared/events.js';

const STATUS_TEXT: Record<Exclude<ApprovalStatus, 'pending'>, string> = {
  approved: '✓ Đã duyệt — điểm đã được lưu',
  rejected: '✗ Đã từ chối — chưa lưu điểm',
  timeout: '⌛ Hết thời gian — đã tự từ chối',
};

function useCountdown(expiresAt: number, active: boolean): string {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    if (!active) return;
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [active]);
  const left = Math.max(0, Math.round((expiresAt - now) / 1000));
  return `${Math.floor(left / 60)}:${String(left % 60).padStart(2, '0')}`;
}

export function ApprovalCard({ approval, onDecide }: { approval: ApprovalView; onDecide: (id: string, ok: boolean) => void }) {
  const { status } = approval;
  const pending = status === 'pending';
  const countdown = useCountdown(approval.expiresAt, pending);
  const [sent, setSent] = useState(false);
  const decide = (ok: boolean) => {
    setSent(true);
    onDecide(approval.id, ok);
  };

  return (
    <div className={`approval ${approval.status}`} aria-live="polite">
      <div className="approval-head">⏸ Duyệt lưu điểm</div>
      <div className="approval-body">
        <strong>
          {approval.student} · {approval.score}/10
        </strong>
        <p>{approval.comments}</p>
      </div>
      {status === 'pending' ? (
        <div className="approval-actions">
          <button onClick={() => decide(true)} disabled={sent}>
            Duyệt
          </button>
          <button className="danger" onClick={() => decide(false)} disabled={sent}>
            Từ chối
          </button>
          <span className="countdown">còn {countdown}</span>
        </div>
      ) : (
        <div className="approval-status">{STATUS_TEXT[status]}</div>
      )}
    </div>
  );
}
