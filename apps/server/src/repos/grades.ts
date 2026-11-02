import type { Grade } from '@harness/shared/api';
import type { Db } from '../db/database.js';

type Row = { submission_id: number; score: number; comments: string; edited: number; approved_at: number; approved_by_name: string };

const toGrade = (r: Row): Grade => ({
  submissionId: r.submission_id,
  score: r.score,
  comments: r.comments,
  edited: r.edited === 1,
  approvedAt: r.approved_at,
  approvedBy: r.approved_by_name,
});

const SELECT = 'SELECT g.*, u.full_name AS approved_by_name FROM grades g JOIN users u ON u.id = g.approved_by';

// Điểm chính thức: chỉ ghi khi giảng viên duyệt (điểm AI đề xuất nằm ở bảng gradings).
export function createGradeRepo(db: Db, now: () => number = Date.now) {
  return {
    approve(submissionId: number, g: { score: number; comments: string; gradingId: number | null; edited: boolean; approvedBy: number }): void {
      db.prepare(
        'INSERT INTO grades (submission_id, score, comments, grading_id, edited, approved_by, approved_at) VALUES (?, ?, ?, ?, ?, ?, ?) ' +
          'ON CONFLICT (submission_id) DO UPDATE SET score = excluded.score, comments = excluded.comments, grading_id = excluded.grading_id, ' +
          'edited = excluded.edited, approved_by = excluded.approved_by, approved_at = excluded.approved_at',
      ).run(submissionId, g.score, g.comments, g.gradingId, g.edited ? 1 : 0, g.approvedBy, now());
    },
    forSubmission(submissionId: number): Grade | null {
      const r = db.prepare(`${SELECT} WHERE g.submission_id = ?`).get(submissionId) as Row | undefined;
      return r ? toGrade(r) : null;
    },
    /** Điểm đã duyệt mới nhất (theo phiên bản bài nộp) của một học viên cho một đề. */
    latestForStudent(assignmentId: number, studentId: number): Grade | null {
      const r = db
        .prepare(`${SELECT} JOIN submissions s ON s.id = g.submission_id WHERE s.assignment_id = ? AND s.student_id = ? ORDER BY s.version DESC LIMIT 1`)
        .get(assignmentId, studentId) as Row | undefined;
      return r ? toGrade(r) : null;
    },
  };
}

export type GradeRepo = ReturnType<typeof createGradeRepo>;
