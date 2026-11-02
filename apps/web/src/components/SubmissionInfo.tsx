// Nguồn bài nộp: "Tải lên" hoặc "GitHub" + link commit đã ghim (mở tab mới, không gửi referrer).
import type { Submission } from '@harness/shared/api';
import { formatDateTime } from '../lib/dates.js';
import { commitUrl, shortSha } from '../lib/github.js';

export function SourceLabel({ submission }: { submission: Submission }) {
  if (submission.source !== 'github') return <span>Tải lên</span>;
  const url = commitUrl(submission.githubUrl, submission.commit);
  return (
    <span>
      GitHub
      {submission.commit && (
        <>
          {' · '}
          {url ? (
            <a href={url} target="_blank" rel="noopener noreferrer" title={submission.githubUrl ?? undefined}>
              <code>{shortSha(submission.commit)}</code>
            </a>
          ) : (
            <code>{shortSha(submission.commit)}</code>
          )}
        </>
      )}
    </span>
  );
}

/** "Phiên bản 3 · 05/11/2026 09:07 · GitHub · abc1234" */
export function SubmissionSummary({ submission }: { submission: Submission }) {
  return (
    <span className="submission-summary">
      <strong>Phiên bản {submission.version}</strong> · {formatDateTime(submission.submittedAt)} · <SourceLabel submission={submission} />
    </span>
  );
}

/** Danh sách phiên bản đã nộp (mới nhất trước); bấm để xem file của phiên bản đó. */
export function VersionList({
  submissions,
  selectedId,
  onSelect,
}: {
  submissions: Submission[];
  selectedId: number | null;
  onSelect: (s: Submission) => void;
}) {
  const sorted = [...submissions].sort((a, b) => b.version - a.version);
  return (
    <ul className="version-list">
      {sorted.map((s) => (
        <li key={s.id} className={s.id === selectedId ? 'version-item active' : 'version-item'}>
          <div>
            <SubmissionSummary submission={s} />
            <div className="muted small">{s.files.length} file</div>
          </div>
          {s.id === selectedId ? (
            <span className="muted small">Đang xem</span>
          ) : (
            <button type="button" className="secondary small" onClick={() => onSelect(s)}>
              Xem
            </button>
          )}
        </li>
      ))}
    </ul>
  );
}
