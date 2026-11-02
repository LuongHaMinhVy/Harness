// Chi tiết một bài nộp: file + xem code, kết quả AI chấm, duyệt điểm, lịch sử phiên bản.
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, useNavigate, useParams } from 'react-router';
import { teacherApi } from '../../api.js';
import { FileViewer } from '../../components/FileViewer.js';
import { SubmissionSummary, VersionList } from '../../components/SubmissionInfo.js';
import { Card, ErrorBox, PageHeader, QueryState } from '../../components/ui.js';
import { qk } from '../../queryKeys.js';
import { ApproveCard, GradingCard } from './GradingPanel.js';

export function SubmissionDetailPage() {
  const id = Number(useParams().id);
  const navigate = useNavigate();
  const client = useQueryClient();
  const { data, isPending, error } = useQuery({
    queryKey: qk.teacher.submission(id),
    queryFn: () => teacherApi.submission(id),
    enabled: Number.isInteger(id) && id > 0,
    refetchInterval: (q) => {
      const s = q.state.data?.grading?.status;
      return s === 'queued' || s === 'running' ? 10_000 : false;
    },
  });
  const regrade = useMutation({
    mutationFn: () => teacherApi.grade(id),
    onSuccess: () => {
      void client.invalidateQueries({ queryKey: qk.teacher.submission(id) });
      if (data) void client.invalidateQueries({ queryKey: qk.teacher.submissions(data.assignment.id) });
    },
  });

  if (!data) return <QueryState isPending={isPending} error={error} />;
  const { assignment, student, submission, grading, grade, history } = data;
  const formKey = `${grading?.id ?? 0}:${grading?.status ?? ''}:${grade?.approvedAt ?? 0}`;

  return (
    <>
      <p className="breadcrumb">
        <Link to={`/giang-vien/de-bai/${assignment.id}`}>← {assignment.title}</Link>
      </p>
      <PageHeader title={`${student.fullName} (${student.username})`} subtitle={<SubmissionSummary submission={submission} />} />

      <div className="detail-layout">
        <div className="detail-main">
          <Card title="Code đã nộp">
            <FileViewer
              key={submission.id}
              files={submission.files}
              entryFile={assignment.entryFile}
              queryKey={(path) => qk.teacher.file(submission.id, path)}
              fetchFile={(path) => teacherApi.file(submission.id, path)}
            />
          </Card>
          {history.length > 1 && (
            <Card title="Lịch sử phiên bản">
              <VersionList submissions={history} selectedId={submission.id} onSelect={(s) => navigate(`/giang-vien/bai-nop/${s.id}`)} />
            </Card>
          )}
        </div>
        <div className="detail-side">
          <ErrorBox error={regrade.error} />
          <GradingCard grading={grading} onRegrade={() => regrade.mutate()} regrading={regrade.isPending} />
          <ApproveCard key={formKey} submissionId={submission.id} grading={grading} grade={grade} />
        </div>
      </div>
    </>
  );
}
