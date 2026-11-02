import type { Grading, GradingStatus, GradingUsage, TestSummary } from '@harness/shared/api';
import type { Db } from '../db/database.js';

type Row = {
  id: number;
  submission_id: number;
  status: GradingStatus;
  ai_score: number | null;
  ai_comments: string | null;
  tests: string | null;
  flags: string | null;
  error: string | null;
  steps: string | null;
  usage: string | null;
  created_at: number;
  finished_at: number | null;
};

const toGrading = (r: Row, withSteps: boolean): Grading => ({
  id: r.id,
  submissionId: r.submission_id,
  status: r.status,
  aiScore: r.ai_score,
  aiComments: r.ai_comments,
  tests: r.tests ? (JSON.parse(r.tests) as TestSummary) : null,
  flags: r.flags ? (JSON.parse(r.flags) as string[]) : [],
  error: r.error,
  usage: r.usage ? (JSON.parse(r.usage) as GradingUsage) : null,
  createdAt: r.created_at,
  finishedAt: r.finished_at,
  ...(withSteps ? { steps: r.steps ? (JSON.parse(r.steps) as unknown[]) : [] } : {}),
});

export type GradingResult = {
  aiScore: number | null;
  aiComments: string | null;
  tests: TestSummary | null;
  flags: string[];
  steps: unknown[];
  usage: GradingUsage;
};

// Mỗi lần AI chấm một bài nộp: điểm đề xuất, kết quả test, cờ cảnh báo, log kỹ thuật (steps).
export function createGradingRepo(db: Db, now: () => number = Date.now) {
  const repo = {
    create(submissionId: number, requestedBy: number): Grading {
      const r = db
        .prepare("INSERT INTO gradings (submission_id, status, requested_by, created_at) VALUES (?, 'queued', ?, ?) RETURNING *")
        .get(submissionId, requestedBy, now()) as Row;
      return toGrading(r, false);
    },
    setRunning(id: number): void {
      db.prepare("UPDATE gradings SET status = 'running' WHERE id = ?").run(id);
    },
    finish(id: number, r: GradingResult): void {
      db.prepare(
        "UPDATE gradings SET status = 'done', ai_score = ?, ai_comments = ?, tests = ?, flags = ?, steps = ?, usage = ?, finished_at = ? WHERE id = ?",
      ).run(r.aiScore, r.aiComments, JSON.stringify(r.tests), JSON.stringify(r.flags), JSON.stringify(r.steps), JSON.stringify(r.usage), now(), id);
    },
    fail(id: number, error: string, steps: unknown[] = []): void {
      db.prepare("UPDATE gradings SET status = 'error', error = ?, steps = ?, finished_at = ? WHERE id = ?").run(error, JSON.stringify(steps), now(), id);
    },
    get(id: number, withSteps = false): Grading | null {
      const r = db.prepare('SELECT * FROM gradings WHERE id = ?').get(id) as Row | undefined;
      return r ? toGrading(r, withSteps) : null;
    },
    latestForSubmission(submissionId: number, withSteps = false): Grading | null {
      const r = db.prepare('SELECT * FROM gradings WHERE submission_id = ? ORDER BY id DESC LIMIT 1').get(submissionId) as Row | undefined;
      return r ? toGrading(r, withSteps) : null;
    },
    isActive(submissionId: number): boolean {
      return db.prepare("SELECT 1 FROM gradings WHERE submission_id = ? AND status IN ('queued', 'running')").get(submissionId) !== undefined;
    },
    /** Khởi động lại server giữa lúc đang chấm → đánh dấu lỗi để giảng viên chấm lại. */
    failInterrupted(): number {
      return Number(
        db
          .prepare("UPDATE gradings SET status = 'error', error = 'Server khởi động lại giữa lúc chấm — hãy chấm lại', finished_at = ? WHERE status IN ('queued', 'running')")
          .run(now()).changes,
      );
    },
  };
  return repo;
}

export type GradingRepo = ReturnType<typeof createGradingRepo>;
