import type { EvalState } from '@harness/shared/events';
import { money } from '../format.js';

type Props = { evalState: EvalState; busy: boolean; onRun: () => void };

export function EvalPanel({ evalState, busy, onRun }: Props) {
  const { rows, report, running, current, waiting, errors } = evalState;
  return (
    <section className="panel page" aria-label="Bộ đánh giá">
      <div className="page-head">
        <div>
          <h2>Bộ đánh giá</h2>
          <p className="muted">Chấm cả 5 bài mẫu (lịch sử trống, tự duyệt, ghi vào grades-eval.json) và so với điểm giáo viên.</p>
        </div>
        <button onClick={onRun} disabled={busy}>
          {running ? 'Đang chạy…' : 'Chạy bộ đánh giá'}
        </button>
      </div>

      {running && (
        <p className="muted">
          {waiting
            ? `Bị giới hạn tốc độ — chờ 30s rồi chấm lại ${waiting}…`
            : current
              ? `Đang chấm ${current}…`
              : rows.length
                ? 'Giãn nhịp vài giây trước bài tiếp theo (tránh giới hạn tốc độ)…'
                : 'Đang bắt đầu…'}
        </p>
      )}

      {report && (
        <div className="metrics">
          <div className="metric">
            <span>MAE</span>
            <strong>{report.mae === null ? 'n/a' : report.mae.toFixed(2)}</strong>
          </div>
          <div className="metric">
            <span>Lệch ≤ 1 điểm</span>
            <strong>{report.within1Pct}%</strong>
          </div>
          <div className="metric">
            <span>Nêu đủ lỗi</span>
            <strong>{report.mentionPct}%</strong>
          </div>
          <div className="metric">
            <span>Tổng chi phí (quy đổi)</span>
            <strong>{money(report.totalCostUsd)}</strong>
          </div>
        </div>
      )}

      {rows.length > 0 ? (
        <table>
          <thead>
            <tr>
              <th>Học viên</th>
              <th>Điểm GV</th>
              <th>Điểm AI</th>
              <th>Lệch</th>
              <th>Nêu đủ lỗi</th>
              <th>Chi phí</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.student}>
                <td>{r.student}</td>
                <td>{r.goldScore}</td>
                <td>{r.aiScore ?? '—'}</td>
                <td className={r.diff !== null && r.diff > 1 ? 'bad' : ''}>{r.diff ?? '—'}</td>
                <td className={r.mentionsOk ? '' : 'bad'}>{r.mentionsOk ? '✓' : `✗ thiếu: ${r.missing.join(', ')}`}</td>
                <td>{money(r.costUsd)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : (
        !running && <p className="empty">Chưa chạy lần nào.</p>
      )}
      {report && report.noScore.length > 0 && <p className="warn">Không có điểm: {report.noScore.join(', ')}</p>}
      {errors.length > 0 && (
        <ul className="errors" role="alert">
          {errors.map((e, i) => (
            <li key={i}>
              ✖ {e.student ? `${e.student}: ` : ''}
              {e.message}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
