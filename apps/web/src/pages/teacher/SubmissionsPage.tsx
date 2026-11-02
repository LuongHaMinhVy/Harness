// Bài nộp của một đề: mỗi học viên một dòng (bài mới nhất), trạng thái chấm, điểm AI đề xuất, cờ, điểm chính thức.
// Cập nhật trực tiếp qua SSE (TeacherSection); thêm hỏi lại định kỳ khi còn bài đang chấm, phòng khi SSE rớt.
import type { SubmissionRow } from '@harness/shared/api';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { Link, useParams } from 'react-router';
import { teacherApi } from '../../api.js';
import { DueDate } from '../../components/DueDate.js';
import { SubmissionSummary } from '../../components/SubmissionInfo.js';
import { Badge, Card, Empty, ErrorBox, PageHeader, QueryState } from '../../components/ui.js';
import { useNow } from '../../hooks.js';
import { formatScore } from '../../lib/dates.js';
import { gradingStatusLabel } from '../../lib/labels.js';
import { qk } from '../../queryKeys.js';

const isActive = (r: SubmissionRow) => r.grading?.status === 'queued' || r.grading?.status === 'running';

export function SubmissionsPage() {
  const id = Number(useParams().id);
  const now = useNow();
  const client = useQueryClient();
  const [regrade, setRegrade] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const valid = Number.isInteger(id) && id > 0;

  const assignment = useQuery({ queryKey: qk.teacher.assignment(id), queryFn: () => teacherApi.assignment(id), enabled: valid });
  const rows = useQuery({
    queryKey: qk.teacher.submissions(id),
    queryFn: () => teacherApi.submissions(id),
    enabled: valid,
    refetchInterval: (q) => (q.state.data?.some(isActive) ? 10_000 : false),
  });

  const refresh = () => void client.invalidateQueries({ queryKey: qk.teacher.submissions(id) });
  const gradeAll = useMutation({
    mutationFn: () => teacherApi.gradeAll(id, regrade),
    onSuccess: (r) => {
      setMessage(r.queued ? `Đã đưa ${r.queued} bài vào hàng đợi chấm.` : 'Không có bài nào cần chấm.');
      refresh();
    },
  });
  const gradeOne = useMutation({
    mutationFn: (submissionId: number) => teacherApi.grade(submissionId),
    onSuccess: refresh,
  });

  if (!assignment.data) return <QueryState isPending={assignment.isPending} error={assignment.error} />;
  const a = assignment.data;
  const data = rows.data ?? [];
  const submitted = data.filter((r) => r.submission).length;
  const approved = data.filter((r) => r.grade).length;

  return (
    <>
      <p className="breadcrumb">
        <Link to="/giang-vien/de-bai">← Đề bài</Link>
      </p>
      <PageHeader
        title={a.title}
        subtitle={
          <>
            Lớp {a.className} · <DueDate dueAt={a.dueAt} now={now} />
          </>
        }
        actions={
          <Link to={`/giang-vien/de-bai/${a.id}/sua`} className="button secondary">
            Sửa đề
          </Link>
        }
      />

      <Card
        title="Bài nộp"
        actions={
          <div className="grade-all">
            <label className="checkbox">
              <input type="checkbox" checked={regrade} onChange={(e) => setRegrade(e.target.checked)} /> chấm lại cả bài đã duyệt
            </label>
            <button type="button" onClick={() => gradeAll.mutate()} disabled={gradeAll.isPending || submitted === 0}>
              Chấm tất cả
            </button>
          </div>
        }
      >
        {rows.data && (
          <p className="muted">
            Đã nộp {submitted}/{data.length} học viên · đã duyệt điểm {approved}
          </p>
        )}
        {message && (
          <div className="callout ok" role="status">
            {message}
          </div>
        )}
        <ErrorBox error={gradeAll.error ?? gradeOne.error} />
        <QueryState isPending={rows.isPending} error={rows.error} />
        {rows.data && data.length === 0 && <Empty>Lớp chưa có học viên.</Empty>}
        {data.length > 0 && (
          <div className="table-wrap">
            <table className="submissions-table">
              <thead>
                <tr>
                  <th>Học viên</th>
                  <th>Bài nộp</th>
                  <th>Trạng thái chấm</th>
                  <th>Điểm AI</th>
                  <th>Cờ</th>
                  <th>Điểm chính thức</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {data.map((r) => (
                  <Row key={r.student.id} row={r} onGrade={(sid) => gradeOne.mutate(sid)} grading={gradeOne.isPending && gradeOne.variables === r.submission?.id} />
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </>
  );
}

function Row({ row, onGrade, grading }: { row: SubmissionRow; onGrade: (submissionId: number) => void; grading: boolean }) {
  const { student, submission, grading: g, grade } = row;
  const status = gradingStatusLabel(g?.status ?? null);
  const flags = g?.status === 'done' ? g.flags.length : 0;
  return (
    <tr>
      <td>
        <div>{student.fullName}</div>
        <div className="muted small">{student.username}</div>
      </td>
      <td>{submission ? <SubmissionSummary submission={submission} /> : <span className="muted">Chưa nộp</span>}</td>
      <td>{submission && <Badge tone={status.tone} title={g?.error ?? undefined}>{status.label}</Badge>}</td>
      <td>{g?.status === 'done' ? formatScore(g.aiScore) : '—'}</td>
      <td>{flags > 0 ? <Badge tone="warn" title="Số cờ cảnh báo">⚠ {flags}</Badge> : <span className="muted">—</span>}</td>
      <td>
        {grade ? (
          <strong>
            {formatScore(grade.score)}/10{grade.edited && <span className="muted small"> (đã sửa)</span>}
          </strong>
        ) : (
          <span className="muted">—</span>
        )}
      </td>
      <td className="actions">
        {submission && (
          <>
            <button
              type="button"
              className="secondary small"
              onClick={() => onGrade(submission.id)}
              disabled={grading || g?.status === 'queued' || g?.status === 'running'}
            >
              Chấm
            </button>
            <Link to={`/giang-vien/bai-nop/${submission.id}`} className="button small">
              Xem
            </Link>
          </>
        )}
      </td>
    </tr>
  );
}
