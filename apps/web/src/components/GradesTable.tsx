import { useQuery } from '@tanstack/react-query';
import { api } from '../api.js';

// version tăng mỗi khi có điểm mới được lưu (sự kiện grade-saved) hoặc snapshot mới → TanStack Query tải lại bảng.
export function GradesTable({ version }: { version: number }) {
  const { data: grades, error, isPending } = useQuery({ queryKey: ['grades', version], queryFn: api.grades });

  return (
    <section className="panel page" aria-label="Bảng điểm">
      <div className="page-head">
        <div>
          <h2>Bảng điểm đã lưu</h2>
          <p className="muted">Chỉ gồm các điểm giáo viên đã duyệt (data/grades.json).</p>
        </div>
      </div>
      {isPending && <p className="muted">Đang tải…</p>}
      {error && <p className="warn">{error.message}</p>}
      {grades && grades.length === 0 && (
        <p className="empty">Chưa có điểm nào được lưu — hãy chấm và duyệt một bài ở tab Chấm bài.</p>
      )}
      {grades && grades.length > 0 && (
        <table>
          <thead>
            <tr>
              <th>Học viên</th>
              <th>Bài tập</th>
              <th>Điểm</th>
              <th>Nhận xét</th>
              <th>Lưu lúc</th>
            </tr>
          </thead>
          <tbody>
            {grades.map((g) => (
              <tr key={`${g.assignment}/${g.student}`}>
                <td>{g.student}</td>
                <td>{g.assignment}</td>
                <td>{g.score}/10</td>
                <td className="comments">{g.comments}</td>
                <td>{new Date(g.savedAt).toLocaleString('vi-VN')}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </section>
  );
}
