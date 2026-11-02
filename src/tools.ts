import { existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { dirname, isAbsolute, join, relative, resolve } from 'node:path';
import { tool } from 'ai';
import { z } from 'zod';
import type { Approver, GradeRequest } from './approval.js';
import { runSubmission } from './sandbox.js';
import type { TestCache } from './toolCache.js';

const MAX_FILE_CHARS = 20_000;
const LIST_HINT = 'dùng list_submissions để xem tên hợp lệ';

export class ToolError extends Error {
  constructor(
    public code: string,
    message: string,
    public hint?: string,
  ) {
    super(message);
  }
}

export type ToolFailure = { error: string; message: string; hint?: string };

// Mọi lỗi trong tool được trả về cho model dưới dạng dữ liệu, không bao giờ ném ra ngoài agent loop.
export function safeTool<A, R>(fn: (args: A) => Promise<R>): (args: A) => Promise<R | ToolFailure> {
  return async (args) => {
    try {
      return await fn(args);
    } catch (err) {
      if (err instanceof ToolError) {
        return { error: err.code, message: err.message, ...(err.hint ? { hint: err.hint } : {}) };
      }
      return { error: 'internal', message: err instanceof Error ? err.message : String(err) };
    }
  };
}

export type ToolDeps = { dataDir: string; cache: TestCache; approve: Approver; gradesFile: string; timeoutMs?: number };

type GradeRecord = GradeRequest & { savedAt: string };

function readGrades(file: string): GradeRecord[] {
  try {
    const data = JSON.parse(readFileSync(file, 'utf8'));
    return Array.isArray(data) ? data : [];
  } catch {
    return [];
  }
}

export function normalizeStudent(name: string): string {
  return name.trim().toLowerCase().replace(/\.js$/, '');
}

const SAFE_NAME = /^[a-z0-9_-]+$/;

export function createTools(deps: ToolDeps) {
  const root = resolve(deps.dataDir);

  function submissionsDir(assignment: string): string {
    const name = assignment.trim().toLowerCase();
    const dir = join(root, 'submissions', name);
    if (!SAFE_NAME.test(name) || !existsSync(join(root, 'assignments', name)) || !existsSync(dir)) {
      throw new ToolError('assignment_not_found', `Không có bài tập "${assignment}".`);
    }
    return dir;
  }

  function submissionFile(assignment: string, student: string): string {
    const dir = submissionsDir(assignment);
    const name = normalizeStudent(student);
    const file = join(dir, `${name}.js`);
    if (!SAFE_NAME.test(name) || !existsSync(file)) {
      throw new ToolError('student_not_found', `Không có bài nộp của "${student}" cho bài ${assignment}.`, LIST_HINT);
    }
    return file;
  }

  return {
    list_submissions: tool({
      description: 'Liệt kê tên các học viên đã nộp bài cho một bài tập.',
      inputSchema: z.object({ assignment: z.string().describe('Mã bài tập, ví dụ "sum-array"') }),
      execute: safeTool(async ({ assignment }: { assignment: string }) => {
        const students = readdirSync(submissionsDir(assignment))
          .filter((f) => f.endsWith('.js'))
          .map((f) => f.slice(0, -3))
          .sort();
        return { students };
      }),
    }),

    read_file: tool({
      description:
        'Đọc một file trong thư mục dữ liệu: đề "assignments/<bài>/README.md", rubric "assignments/<bài>/rubric.md", ' +
        'hoặc bài nộp "submissions/<bài>/<học viên>.js". Quy trình chấm: đọc rubric → đọc bài → run_tests → save_grade.',
      inputSchema: z.object({ path: z.string().describe('Đường dẫn tương đối trong thư mục data') }),
      execute: safeTool(async ({ path }: { path: string }) => {
        const target = resolve(root, path);
        const rel = relative(root, target);
        if (rel.startsWith('..') || isAbsolute(rel)) {
          throw new ToolError('outside_data_dir', `Không được đọc file ngoài thư mục dữ liệu: ${path}`);
        }
        if (!existsSync(target) || !statSync(target).isFile()) {
          throw new ToolError('not_found', `Không tìm thấy file: ${path}`, LIST_HINT);
        }
        const content = readFileSync(target, 'utf8');
        return {
          path: rel.replaceAll('\\', '/'),
          content: content.length > MAX_FILE_CHARS ? `${content.slice(0, MAX_FILE_CHARS)}\n…(đã cắt)` : content,
        };
      }),
    }),

    run_tests: tool({
      description:
        'Chạy bộ test của bài tập với bài nộp của một học viên. Trả về số test đạt, test nào trượt và lỗi; ' +
        'status "timeout" nghĩa là bài chạy quá lâu (thường do vòng lặp vô hạn), "load_error" là bài không nạp được (lỗi cú pháp).',
      inputSchema: z.object({ assignment: z.string(), student: z.string() }),
      execute: safeTool(async ({ assignment, student }: { assignment: string; student: string }) => {
        const file = submissionFile(assignment, student);
        const testsFile = join(root, 'assignments', assignment.trim().toLowerCase(), 'tests.js');
        const key = deps.cache.key(readFileSync(file, 'utf8'), readFileSync(testsFile, 'utf8'));
        const hit = deps.cache.get(key);
        if (hit) return { ...hit, cached: true, durationMs: 0, cacheKey: key.slice(0, 4) };

        const started = Date.now();
        const result = await runSubmission(file, testsFile, deps.timeoutMs);
        deps.cache.set(key, result);
        return { ...result, cached: false, durationMs: Date.now() - started };
      }),
    }),

    save_grade: tool({
      description:
        'Lưu điểm cuối cùng (0–10) và nhận xét cho một bài nộp. Giáo viên phải duyệt trước khi ghi; ' +
        'nếu trả về "rejected_by_user" thì chưa lưu gì, hãy hỏi giáo viên muốn sửa thế nào.',
      inputSchema: z.object({
        assignment: z.string(),
        student: z.string(),
        score: z.number().min(0).max(10),
        comments: z.string().min(1),
      }),
      execute: safeTool(async (req: GradeRequest) => {
        submissionFile(req.assignment, req.student);
        const student = normalizeStudent(req.student);
        const assignment = req.assignment.trim().toLowerCase();
        if (!(await deps.approve({ ...req, student, assignment }))) return { status: 'rejected_by_user' as const };

        const grades = readGrades(deps.gradesFile).filter((g) => !(g.assignment === assignment && g.student === student));
        grades.push({ assignment, student, score: req.score, comments: req.comments, savedAt: new Date().toISOString() });
        mkdirSync(dirname(deps.gradesFile), { recursive: true });
        writeFileSync(deps.gradesFile, JSON.stringify(grades, null, 2));
        return { status: 'saved' as const };
      }),
    }),
  };
}
