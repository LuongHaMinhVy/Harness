import type { Submission, SubmittedFile } from '@harness/shared/api';
import { transaction, type Db } from '../db/database.js';

type Row = {
  id: number;
  assignment_id: number;
  student_id: number;
  version: number;
  files: string;
  submitted_at: number;
  source: 'upload' | 'github';
  repo_url: string | null;
  commit_sha: string | null;
};

const toSubmission = (r: Row): Submission => ({
  id: r.id,
  assignmentId: r.assignment_id,
  studentId: r.student_id,
  version: r.version,
  files: JSON.parse(r.files) as SubmittedFile[],
  submittedAt: r.submitted_at,
  source: r.source,
  githubUrl: r.repo_url,
  commit: r.commit_sha,
});

export function createSubmissionRepo(db: Db, now: () => number = Date.now) {
  return {
    nextVersion(assignmentId: number, studentId: number): number {
      const r = db.prepare('SELECT MAX(version) AS v FROM submissions WHERE assignment_id = ? AND student_id = ?').get(assignmentId, studentId) as {
        v: number | null;
      };
      return (r.v ?? 0) + 1;
    },
    create(
      assignmentId: number,
      studentId: number,
      version: number,
      files: SubmittedFile[],
      origin: { source: 'upload' } | { source: 'github'; url: string; commit: string } = { source: 'upload' },
    ): Submission {
      return transaction(db, () => {
        const r = db
          .prepare(
            'INSERT INTO submissions (assignment_id, student_id, version, files, submitted_at, source, repo_url, commit_sha) VALUES (?, ?, ?, ?, ?, ?, ?, ?) RETURNING *',
          )
          .get(
            assignmentId,
            studentId,
            version,
            JSON.stringify(files),
            now(),
            origin.source,
            origin.source === 'github' ? origin.url : null,
            origin.source === 'github' ? origin.commit : null,
          ) as Row;
        return toSubmission(r);
      });
    },
    get(id: number): Submission | null {
      const r = db.prepare('SELECT * FROM submissions WHERE id = ?').get(id) as Row | undefined;
      return r ? toSubmission(r) : null;
    },
    /** Bài nộp chỉ trả về cho đúng học viên đã nộp. */
    getForStudent(id: number, studentId: number): Submission | null {
      const r = db.prepare('SELECT * FROM submissions WHERE id = ? AND student_id = ?').get(id, studentId) as Row | undefined;
      return r ? toSubmission(r) : null;
    },
    listForStudent(assignmentId: number, studentId: number): Submission[] {
      const rows = db.prepare('SELECT * FROM submissions WHERE assignment_id = ? AND student_id = ? ORDER BY version DESC').all(assignmentId, studentId) as Row[];
      return rows.map(toSubmission);
    },
    latest(assignmentId: number, studentId: number): Submission | null {
      const r = db
        .prepare('SELECT * FROM submissions WHERE assignment_id = ? AND student_id = ? ORDER BY version DESC LIMIT 1')
        .get(assignmentId, studentId) as Row | undefined;
      return r ? toSubmission(r) : null;
    },
    /** Bài nộp mới nhất của mỗi học viên cho một đề. */
    latestForAssignment(assignmentId: number): Submission[] {
      const rows = db
        .prepare(
          `SELECT s.* FROM submissions s
           WHERE s.assignment_id = ? AND s.version = (SELECT MAX(version) FROM submissions WHERE assignment_id = s.assignment_id AND student_id = s.student_id)
           ORDER BY s.student_id`,
        )
        .all(assignmentId) as Row[];
      return rows.map(toSubmission);
    },
  };
}

export type SubmissionRepo = ReturnType<typeof createSubmissionRepo>;
