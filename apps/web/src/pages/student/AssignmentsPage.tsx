// Bài tập của tôi: mỗi đề một thẻ — tên, lớp, hạn nộp, trạng thái nộp / điểm chính thức.
import type { StudentAssignment } from '@harness/shared/api';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router';
import { studentApi } from '../../api.js';
import { DueDate } from '../../components/DueDate.js';
import { Badge, Empty, PageHeader, QueryState } from '../../components/ui.js';
import { useNow } from '../../hooks.js';
import { formatDateTime, formatScore } from '../../lib/dates.js';
import { qk } from '../../queryKeys.js';

function Status({ a }: { a: StudentAssignment }) {
  if (a.grade && a.latest && a.grade.submissionId !== a.latest.id)
    return (
      <div className="badge-row">
        <Badge tone="ok">Đã có điểm {formatScore(a.grade.score)}/10 (bản trước)</Badge>
        <Badge tone="info">Đã nộp lại phiên bản {a.latest.version}</Badge>
      </div>
    );
  if (a.grade) return <Badge tone="ok">Đã có điểm {formatScore(a.grade.score)}/10</Badge>;
  if (a.latest)
    return (
      <Badge tone="info">
        Đã nộp phiên bản {a.latest.version} lúc {formatDateTime(a.latest.submittedAt)}
      </Badge>
    );
  return <Badge tone="neutral">Chưa nộp</Badge>;
}

export function StudentAssignmentsPage() {
  const now = useNow();
  const { data, isPending, error } = useQuery({ queryKey: qk.student.assignments, queryFn: studentApi.assignments });
  const sorted = [...(data ?? [])].sort((a, b) => (a.dueAt ?? Infinity) - (b.dueAt ?? Infinity) || b.createdAt - a.createdAt);

  return (
    <>
      <PageHeader title="Bài tập của tôi" subtitle="Các đề được giao cho lớp của bạn." />
      <QueryState isPending={isPending} error={error} />
      {data && data.length === 0 && <Empty>Chưa có đề bài nào được giao.</Empty>}
      <div className="card-grid">
        {sorted.map((a) => (
          <Link key={a.id} to={`/hoc-vien/bai-tap/${a.id}`} className="card assignment-card">
            <h2>{a.title}</h2>
            <div className="muted">Lớp {a.className}</div>
            <DueDate dueAt={a.dueAt} now={now} />
            <Status a={a} />
          </Link>
        ))}
      </div>
    </>
  );
}
