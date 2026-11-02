// Danh sách đề bài (tên, lớp, hạn nộp) + nút tạo đề mới.
import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router';
import { teacherApi } from '../../api.js';
import { DueDate } from '../../components/DueDate.js';
import { Card, Empty, PageHeader, QueryState } from '../../components/ui.js';
import { useNow } from '../../hooks.js';
import { qk } from '../../queryKeys.js';

export function TeacherAssignmentsPage() {
  const now = useNow();
  const { data, isPending, error } = useQuery({ queryKey: qk.teacher.assignments, queryFn: teacherApi.assignments });
  const sorted = [...(data ?? [])].sort((a, b) => b.createdAt - a.createdAt);

  return (
    <>
      <PageHeader
        title="Đề bài"
        subtitle="Đề được giao cho một lớp; học viên nộp bài, AI chấm đề xuất, giảng viên duyệt điểm."
        actions={
          <Link to="/giang-vien/de-bai/moi" className="button">
            + Tạo đề mới
          </Link>
        }
      />
      <Card>
        <QueryState isPending={isPending} error={error} />
        {data && data.length === 0 && <Empty>Chưa có đề nào — bấm "Tạo đề mới".</Empty>}
        {sorted.length > 0 && (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Tên đề</th>
                  <th>Lớp</th>
                  <th>Hạn nộp</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {sorted.map((a) => (
                  <tr key={a.id}>
                    <td>
                      <Link to={`/giang-vien/de-bai/${a.id}`}>{a.title}</Link>
                      <div className="muted small">
                        File chính <code>{a.entryFile}</code>
                      </div>
                    </td>
                    <td>{a.className}</td>
                    <td>
                      <DueDate dueAt={a.dueAt} now={now} />
                    </td>
                    <td className="actions">
                      <Link to={`/giang-vien/de-bai/${a.id}`} className="button secondary small">
                        Bài nộp
                      </Link>
                      <Link to={`/giang-vien/de-bai/${a.id}/sua`} className="button secondary small">
                        Sửa
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </>
  );
}
