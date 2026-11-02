import { existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { dirname, isAbsolute, join, relative, resolve } from 'node:path';
import { tool } from 'ai';
import { z } from 'zod';
import type { Approver, GradeRequest } from './approval.js';
import { RUNNER_ID, runSubmission } from './sandbox.js';
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

/** Một bài nộp đã định vị: thư mục chứa bài, file chính, danh sách file (đường dẫn tương đối trong thư mục). */
export type LocatedSubmission = { student: string; dir: string; entry: string; files: string[] };

/** Tìm bài nộp theo (đề, học viên). CLI dùng dữ liệu mẫu một file; web dùng phiên bản mới nhất trong database. */
export interface SubmissionLocator {
  students(assignment: string): string[];
  locate(assignment: string, student: string): LocatedSubmission;
}

export type ToolDeps = {
  dataDir: string;
  cache: TestCache;
  approve: Approver;
  gradesFile: string;
  timeoutMs?: number;
  locator?: SubmissionLocator;
  /** Tiền tố đường dẫn (trong dataDir) mà read_file được phép đọc; mặc định đọc được cả dataDir. */
  readScope?: string[];
  /** Thay cách lưu điểm mặc định (duyệt + ghi file) — web dùng để lưu điểm đề xuất chờ giảng viên duyệt. */
  saveGrade?: (req: GradeRequest) => Promise<{ status: string }>;
};

type GradeRecord = GradeRequest & { savedAt: string };

function readGrades(file: string): GradeRecord[] {
  try {
    const data = JSON.parse(readFileSync(file, 'utf8'));
    return Array.isArray(data) ? data : [];
  } catch {
    return [];
  }
}

// Tên file bài nộp viết thường, không dấu: "Hùng" → "hung", "Đức.js" → "duc".
export function normalizeStudent(name: string): string {
  return name
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .replace(/đ/g, 'd')
    .replace(/\.js$/, '');
}

const SAFE_NAME = /^[a-z0-9_-]+$/;

// Kiểm tra mã đề: chữ thường không dấu, có thư mục đề trong data/assignments.
export function checkAssignment(dataDir: string, assignment: string): string {
  const name = assignment.trim().toLowerCase();
  if (!SAFE_NAME.test(name) || !existsSync(join(resolve(dataDir), 'assignments', name))) {
    throw new ToolError('assignment_not_found', `Không có bài tập "${assignment}".`);
  }
  return name;
}

// Dữ liệu mẫu (CLI, eval): data/submissions/<đề>/<học viên>.js — mỗi bài một file.
export function flatLocator(dataDir: string): SubmissionLocator {
  const root = resolve(dataDir);
  const dirOf = (assignment: string) => {
    const name = checkAssignment(dataDir, assignment);
    const dir = join(root, 'submissions', name);
    if (!existsSync(dir)) throw new ToolError('assignment_not_found', `Không có bài tập "${assignment}".`);
    return dir;
  };
  return {
    students: (assignment) =>
      readdirSync(dirOf(assignment))
        .filter((f) => f.endsWith('.js'))
        .map((f) => f.slice(0, -3))
        .sort(),
    locate(assignment, student) {
      const dir = dirOf(assignment);
      const name = normalizeStudent(student);
      const entry = `${name}.js`;
      if (!SAFE_NAME.test(name) || !existsSync(join(dir, entry))) {
        throw new ToolError('student_not_found', `Không có bài nộp của "${student}" cho bài ${assignment}.`, LIST_HINT);
      }
      return { student: name, dir, entry, files: [entry] };
    },
  };
}

export function createTools(deps: ToolDeps) {
  const root = resolve(deps.dataDir);
  const locator = deps.locator ?? flatLocator(deps.dataDir);
  const relOf = (abs: string) => relative(root, abs).replaceAll('\\', '/');

  return {
    list_submissions: tool({
      description: 'Liệt kê tên các học viên đã nộp bài cho một bài tập.',
      inputSchema: z.object({ assignment: z.string().describe('Mã bài tập, ví dụ "sum-array"') }),
      execute: safeTool(async ({ assignment }: { assignment: string }) => {
        checkAssignment(deps.dataDir, assignment);
        return { students: locator.students(assignment) };
      }),
    }),

    list_files: tool({
      description:
        'Liệt kê các file trong bài nộp của một học viên. Kết quả có "base" (thư mục bài nộp) và "entry" (file chính); ' +
        'đọc từng file bằng read_file("<base>/<file>").',
      inputSchema: z.object({ assignment: z.string(), student: z.string() }),
      execute: safeTool(async ({ assignment, student }: { assignment: string; student: string }) => {
        checkAssignment(deps.dataDir, assignment);
        const s = locator.locate(assignment, student);
        return { student: s.student, entry: s.entry, base: relOf(s.dir), files: s.files };
      }),
    }),

    read_file: tool({
      description:
        'Đọc một file trong thư mục dữ liệu: đề "assignments/<bài>/README.md", rubric "assignments/<bài>/rubric.md", ' +
        'hoặc file bài nộp "<base>/<file>" lấy từ list_files. Quy trình chấm: list_files → đọc bài → run_tests → save_grade.',
      inputSchema: z.object({ path: z.string().describe('Đường dẫn tương đối trong thư mục data') }),
      execute: safeTool(async ({ path }: { path: string }) => {
        const target = resolve(root, path);
        const rel = relative(root, target);
        if (rel.startsWith('..') || isAbsolute(rel)) {
          throw new ToolError('outside_data_dir', `Không được đọc file ngoài thư mục dữ liệu: ${path}`);
        }
        const relPosix = rel.replaceAll('\\', '/');
        if (deps.readScope && !deps.readScope.some((prefix) => relPosix.startsWith(prefix) || `${relPosix}/` === prefix)) {
          throw new ToolError('outside_scope', `Lần chấm này chỉ được đọc đề và bài nộp đang chấm: ${path}`);
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
        const name = checkAssignment(deps.dataDir, assignment);
        const s = locator.locate(assignment, student);
        const entry = join(s.dir, s.entry);
        const testsFile = join(root, 'assignments', name, 'tests.js');
        // Key gồm phiên bản runner + mọi file của bài nộp (theo thứ tự) + bộ test: sửa bất kỳ thứ gì là chạy lại.
        const source = [`runner:${RUNNER_ID}`, ...s.files.map((f) => `${f}\0${readFileSync(join(s.dir, f), 'utf8')}`)].join('\0');
        const key = deps.cache.key(source, readFileSync(testsFile, 'utf8'));
        const hit = deps.cache.get(key);
        if (hit) return { ...hit, cached: true, durationMs: 0, cacheKey: key.slice(0, 4) };

        const started = Date.now();
        const result = await runSubmission(entry, testsFile, deps.timeoutMs, { readRoots: [s.dir] });
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
        const assignment = checkAssignment(deps.dataDir, req.assignment);
        const student = locator.locate(req.assignment, req.student).student;
        if (deps.saveGrade) return deps.saveGrade({ ...req, student, assignment });
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
