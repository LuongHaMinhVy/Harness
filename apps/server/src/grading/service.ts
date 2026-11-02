import { join, relative } from 'node:path';
import { readFileSync } from 'node:fs';
import { runQuestion } from '@harness/core/agent';
import { autoApprove, type GradeRequest } from '@harness/core/approval';
import { costUsd } from '@harness/core/pricing';
import { buildSystemPrompt } from '@harness/core/prompt';
import { describeApiError } from '@harness/core/session';
import type { TestCache } from '@harness/core/toolCache';
import { createTools, normalizeStudent, ToolError, type SubmissionLocator } from '@harness/core/tools';
import type { GradingEvent, TestSummary } from '@harness/shared/api';
import type { StepLog } from '@harness/shared/types';
import type { LanguageModel } from 'ai';
import type { AssignmentRepo } from '../repos/assignments.js';
import type { GradingRepo } from '../repos/gradings.js';
import type { SubmissionRepo } from '../repos/submissions.js';
import type { UserRepo } from '../repos/users.js';
import { submissionDir } from '../uploads/store.js';
import { gradingFlags } from './flags.js';
import { createQueue } from './queue.js';

export type GradingDeps = {
  dataDir: string;
  model: LanguageModel;
  maxSteps: number;
  cache: TestCache;
  users: UserRepo;
  assignments: AssignmentRepo;
  submissions: SubmissionRepo;
  gradings: GradingRepo;
  emit: (e: GradingEvent) => void;
  concurrency?: number;
};

function lastTests(steps: StepLog[]): TestSummary | null {
  for (const step of [...steps].reverse()) {
    const call = [...step.toolCalls].reverse().find((c) => c.name === 'run_tests');
    const out = call?.output as Record<string, unknown> | undefined;
    if (!out || 'error' in out) continue;
    if (out.status === 'ok') {
      const results = (out.results ?? []) as { name: string; ok: boolean }[];
      return { status: 'ok', passed: Number(out.passed), total: Number(out.total), failed: results.filter((r) => !r.ok).map((r) => r.name) };
    }
    return { status: out.status as 'timeout' | 'load_error', message: typeof out.message === 'string' ? out.message : undefined };
  }
  return null;
}

// Chấm bài nộp qua hàng đợi: mỗi lần chấm có bộ tool riêng chỉ đọc được đề + đúng bài đang chấm,
// save_grade chỉ ghi điểm ĐỀ XUẤT (giảng viên duyệt mới thành điểm chính thức).
export function createGradingService(d: GradingDeps) {
  const queue = createQueue(d.concurrency ?? 2);
  const root = d.dataDir;

  async function grade(gradingId: number, submissionId: number): Promise<void> {
    const sub = d.submissions.get(submissionId)!;
    const a = d.assignments.get(sub.assignmentId)!;
    const student = d.users.findById(sub.studentId)!;
    const emit = (status: GradingEvent['status']) => d.emit({ type: 'grading', assignmentId: a.id, submissionId, gradingId, status });

    d.gradings.setRunning(gradingId);
    emit('running');

    const dir = submissionDir(root, a.slug, student.username, sub.version);
    const files = sub.files.map((f) => f.path);
    const locator: SubmissionLocator = {
      students: () => [student.username],
      locate(assignment, who) {
        if (assignment.trim().toLowerCase() !== a.slug || normalizeStudent(who) !== student.username.toLowerCase()) {
          throw new ToolError('student_not_found', `Lần chấm này chỉ dành cho bài của "${student.username}" (đề "${a.slug}").`);
        }
        return { student: student.username, dir, entry: a.entryFile, files };
      },
    };
    let proposal: GradeRequest | null = null;
    const tools = createTools({
      dataDir: root,
      cache: d.cache,
      approve: autoApprove,
      gradesFile: join(root, 'grades-unused.json'),
      locator,
      readScope: [`assignments/${a.slug}/`, `${relative(root, dir).replaceAll('\\', '/')}/`],
      saveGrade: async (req) => {
        proposal = req;
        return { status: 'proposed', message: 'Đã lưu điểm đề xuất — giảng viên sẽ duyệt' };
      },
    });

    const steps: StepLog[] = [];
    const question =
      `Chấm bài nộp của học viên "${student.username}" (${student.fullName}) cho bài "${a.slug}", phiên bản ${sub.version}. ` +
      `File chính: ${a.entryFile}. Gọi list_files và run_tests trong cùng một lượt, đọc file cần thiết, rồi gọi save_grade.`;
    try {
      const out = await runQuestion({
        model: d.model,
        system: buildSystemPrompt(root, a.slug),
        history: [{ role: 'user', content: question }],
        tools,
        maxSteps: d.maxSteps,
        onStep: (s) => steps.push(s),
      });
      const p = proposal as GradeRequest | null;
      const tests = lastTests(steps);
      const totals = steps.reduce(
        (acc, s) => ({ input: acc.input + s.usage.input, cached: acc.cached + (s.usage.cached ?? 0), output: acc.output + s.usage.output }),
        { input: 0, cached: 0, output: 0 },
      );
      const sources = files.map((f) => {
        try {
          return readFileSync(join(dir, f), 'utf8');
        } catch {
          return '';
        }
      });
      d.gradings.finish(gradingId, {
        aiScore: p?.score ?? null,
        aiComments: p?.comments ?? (out.text || null),
        tests,
        flags: gradingFlags({ aiScore: p?.score ?? null, tests, sources, hitLimit: out.hitLimit }),
        steps,
        usage: { ...totals, costUsd: costUsd(totals), totalMs: out.totalMs, steps: steps.length, hitLimit: out.hitLimit },
      });
      emit('done');
    } catch (err) {
      d.gradings.fail(gradingId, describeApiError(err), steps);
      emit('error');
    }
  }

  return {
    /** Xếp hàng chấm một bài nộp; đang chấm/đang chờ thì không xếp trùng (trả null). */
    request(submissionId: number, requestedBy: number) {
      if (d.gradings.isActive(submissionId)) return null;
      const g = d.gradings.create(submissionId, requestedBy);
      const sub = d.submissions.get(submissionId)!;
      d.emit({ type: 'grading', assignmentId: sub.assignmentId, submissionId, gradingId: g.id, status: 'queued' });
      queue.push(() => grade(g.id, submissionId));
      return g;
    },
    idle: () => queue.idle(),
  };
}

export type GradingService = ReturnType<typeof createGradingService>;
