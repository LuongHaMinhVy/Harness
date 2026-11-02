// Chi tiết đề cho học viên: mô tả, rubric, file chính, nộp bài, lịch sử phiên bản + xem file, điểm chính thức.
// Học viên chỉ thấy điểm đã được giảng viên duyệt — không bao giờ thấy điểm/nhận xét AI đề xuất.
import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { Link, useParams } from 'react-router';
import { studentApi } from '../../api.js';
import { DueDate } from '../../components/DueDate.js';
import { FileViewer } from '../../components/FileViewer.js';
import { VersionList } from '../../components/SubmissionInfo.js';
import { Card, PageHeader, QueryState } from '../../components/ui.js';
import { useNow } from '../../hooks.js';
import { formatDateTime, formatScore, isOverdue } from '../../lib/dates.js';
import { qk } from '../../queryKeys.js';
import { SubmitPanel } from './SubmitPanel.js';

export function StudentAssignmentDetailPage() {
  const id = Number(useParams().id);
  const now = useNow();
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const { data: a, isPending, error } = useQuery({
    queryKey: qk.student.assignment(id),
    queryFn: () => studentApi.assignment(id),
    enabled: Number.isInteger(id) && id > 0,
  });

  if (!a) return <QueryState isPending={isPending} error={error} />;

  const latest = [...a.submissions].sort((x, y) => y.version - x.version)[0] ?? null;
  const selected = a.submissions.find((s) => s.id === selectedId) ?? latest;
  const gradedVersion = a.grade ? a.submissions.find((s) => s.id === a.grade!.submissionId)?.version : undefined;

  return (
    <>
      <p className="breadcrumb">
        <Link to="/hoc-vien">← Bài tập của tôi</Link>
      </p>
      <PageHeader title={a.title} subtitle={<>Lớp {a.className} · <DueDate dueAt={a.dueAt} now={now} /></>} />

      {a.grade && (
        <Card title="Điểm chính thức" className="grade-card">
          <div className="score-big">{formatScore(a.grade.score)}/10</div>
          {gradedVersion !== undefined && <p className="muted small">Cho phiên bản {gradedVersion} · duyệt lúc {formatDateTime(a.grade.approvedAt)}</p>}
          <div className="text-block">{a.grade.comments}</div>
        </Card>
      )}

      <div className="two-col">
        <Card title="Đề bài">
          <div className="text-block">{a.description}</div>
          <h3>Tiêu chí chấm</h3>
          <div className="text-block">{a.rubric}</div>
          <p>
            Yêu cầu file chính: <code>{a.entryFile}</code>
          </p>
        </Card>
        <SubmitPanel assignmentId={a.id} entryFile={a.entryFile} closed={isOverdue(a.dueAt, now)} />
      </div>

      <Card title="Các lần nộp">
        {a.submissions.length === 0 ? (
          <p className="empty">Bạn chưa nộp bài này.</p>
        ) : (
          <>
            <VersionList submissions={a.submissions} selectedId={selected?.id ?? null} onSelect={(s) => setSelectedId(s.id)} />
            {selected && (
              <FileViewer
                key={selected.id}
                files={selected.files}
                entryFile={a.entryFile}
                queryKey={(path) => qk.student.file(selected.id, path)}
                fetchFile={(path) => studentApi.file(selected.id, path)}
              />
            )}
          </>
        )}
      </Card>
    </>
  );
}
