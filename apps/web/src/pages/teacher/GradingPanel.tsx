// Kết quả AI chấm (đề xuất, chưa chính thức) + form duyệt điểm + chi tiết kỹ thuật (ẩn mặc định). Chỉ dành cho giảng viên/admin.
import type { Grade, Grading, TestSummary } from '@harness/shared/api';
import type { StepLog } from '@harness/shared/types';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useState, type FormEvent } from 'react';
import { teacherApi } from '../../api.js';
import { Step } from '../../components/LogPanel.js';
import { Badge, Card, ErrorBox, Field } from '../../components/ui.js';
import { money, tokens } from '../../format.js';
import { formatDateTime, formatDuration, formatScore } from '../../lib/dates.js';
import { flagTone, gradingStatusLabel } from '../../lib/labels.js';
import { qk } from '../../queryKeys.js';

function TestResult({ tests }: { tests: TestSummary | null }) {
  if (!tests) return <p className="muted">AI chưa chạy test.</p>;
  if (tests.status === 'timeout')
    return (
      <div className="test-result bad">
        ⏱ Chạy test quá thời gian
        {tests.message && <pre className="plain">{tests.message}</pre>}
      </div>
    );
  if (tests.status === 'load_error')
    return (
      <div className="test-result bad">
        ✗ Không nạp được bài (lỗi khi require file chính)
        {tests.message && <pre className="plain">{tests.message}</pre>}
      </div>
    );
  const failed = tests.failed ?? [];
  return (
    <div className={failed.length ? 'test-result warn' : 'test-result good'}>
      <strong>
        {failed.length ? '✗' : '✓'} {tests.passed ?? 0}/{tests.total ?? 0} test đạt
      </strong>
      {failed.length > 0 && (
        <ul className="failed-tests">
          {failed.map((name) => (
            <li key={name}>✗ {name}</li>
          ))}
        </ul>
      )}
    </div>
  );
}

export function GradingCard({ grading, onRegrade, regrading }: { grading: Grading | null; onRegrade: () => void; regrading: boolean }) {
  const status = gradingStatusLabel(grading?.status ?? null);
  const active = grading?.status === 'queued' || grading?.status === 'running';
  return (
    <Card
      title="Kết quả AI chấm (đề xuất)"
      actions={
        <>
          <Badge tone={status.tone}>{status.label}</Badge>
          <button type="button" className="secondary small" onClick={onRegrade} disabled={active || regrading}>
            {grading ? 'Chấm lại' : 'Chấm'}
          </button>
        </>
      }
    >
      {!grading && <p className="muted">Bài này chưa được chấm. Bấm "Chấm" để AI chạy test và đề xuất điểm.</p>}
      {active && <p className="muted">AI đang chấm bài này… trang sẽ tự cập nhật khi xong.</p>}
      {grading?.status === 'error' && <div className="callout error">Lỗi khi chấm: {grading.error ?? 'không rõ'}</div>}
      {grading?.status === 'done' && (
        <>
          {grading.flags.map((f) => (
            <div key={f} className={`callout ${flagTone(f)}`}>
              ⚠ {f}
            </div>
          ))}
          <h3>Kết quả test</h3>
          <TestResult tests={grading.tests} />
          <h3>Điểm đề xuất: {grading.aiScore === null ? '—' : `${formatScore(grading.aiScore)}/10`}</h3>
          {grading.aiComments ? <div className="text-block">{grading.aiComments}</div> : <p className="muted">AI không đưa nhận xét.</p>}
          {grading.finishedAt && <p className="muted small">Chấm xong lúc {formatDateTime(grading.finishedAt)}</p>}
        </>
      )}
      {grading && (grading.steps?.length || grading.usage) ? <TechnicalDetails grading={grading} /> : null}
    </Card>
  );
}

function TechnicalDetails({ grading }: { grading: Grading }) {
  const steps = (grading.steps ?? []) as StepLog[];
  const u = grading.usage;
  return (
    <details className="technical">
      <summary>Chi tiết kỹ thuật</summary>
      {u && (
        <p className="tokens">
          {u.steps} lượt · {tokens(u)} · ≈ {money(u.costUsd)} (chi phí quy đổi) · {formatDuration(u.totalMs)}
          {u.hitLimit && ' · ⚠ hết lượt'}
        </p>
      )}
      <div className="log">
        {steps.map((s) => (
          <Step key={s.index} step={s} />
        ))}
      </div>
    </details>
  );
}

type ApproveProps = { submissionId: number; grading: Grading | null; grade: Grade | null };

export function ApproveCard({ submissionId, grading, grade }: ApproveProps) {
  const client = useQueryClient();
  const fromAi = grading?.status === 'done' ? grading : null;
  const [score, setScore] = useState(() => String(grade?.score ?? fromAi?.aiScore ?? ''));
  const [comments, setComments] = useState(() => grade?.comments ?? fromAi?.aiComments ?? '');
  const [localError, setLocalError] = useState<string | null>(null);

  const approve = useMutation({
    mutationFn: (v: { score: number; comments: string }) => teacherApi.approve(submissionId, v.score, v.comments),
    onSuccess: (g) => {
      void client.invalidateQueries({ queryKey: qk.teacher.submission(submissionId) });
      void client.invalidateQueries({ queryKey: ['teacher', 'submissions'] });
      setScore(String(g.score));
      setComments(g.comments);
    },
  });

  const submit = (e: FormEvent) => {
    e.preventDefault();
    const n = Number(score.replace(',', '.'));
    if (score.trim() === '' || !Number.isFinite(n) || n < 0 || n > 10) return setLocalError('Điểm phải từ 0 đến 10');
    if (!comments.trim()) return setLocalError('Nhận xét không được để trống');
    setLocalError(null);
    approve.mutate({ score: n, comments: comments.trim() });
  };

  return (
    <Card title="Điểm chính thức" className="approve-card">
      {grade ? (
        <div className="official">
          <div className="score-big">
            {formatScore(grade.score)}/10 {grade.edited && <Badge tone="warn">đã sửa so với AI</Badge>}
          </div>
          <p className="muted small">
            Duyệt bởi {grade.approvedBy} lúc {formatDateTime(grade.approvedAt)} — học viên đã thấy điểm này.
          </p>
        </div>
      ) : (
        <p className="muted">Chưa duyệt — học viên chưa thấy điểm. {fromAi ? 'Đã điền sẵn đề xuất của AI, hãy xem lại trước khi duyệt.' : ''}</p>
      )}
      <form className="stack-form" onSubmit={submit}>
        <Field label="Điểm (0–10)">
          <input type="number" min={0} max={10} step={0.25} value={score} onChange={(e) => setScore(e.target.value)} required className="score-input" />
        </Field>
        <Field label="Nhận xét gửi học viên">
          <textarea value={comments} onChange={(e) => setComments(e.target.value)} rows={8} maxLength={5000} required />
        </Field>
        {localError && (
          <div className="callout error" role="alert">
            {localError}
          </div>
        )}
        <ErrorBox error={approve.error} />
        {approve.isSuccess && (
          <div className="callout ok" role="status">
            ✓ Đã lưu điểm chính thức.
          </div>
        )}
        <div className="button-row">
          <button type="submit" disabled={approve.isPending}>
            {grade ? 'Cập nhật điểm' : 'Duyệt điểm'}
          </button>
        </div>
      </form>
    </Card>
  );
}
