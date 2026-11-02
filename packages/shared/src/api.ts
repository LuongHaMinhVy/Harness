// Kiểu dữ liệu và schema của API lớp học, dùng chung server ↔ giao diện. Không phụ thuộc Node hay DOM.
import { z } from 'zod';

// Thông báo lỗi kiểm tra input bằng tiếng Việt cho cả server và giao diện.
z.config(z.locales.vi());

export const ROLES = ['admin', 'teacher', 'student'] as const;
export type Role = (typeof ROLES)[number];

export type User = {
  id: number;
  username: string;
  fullName: string;
  role: Role;
  mustChangePassword: boolean;
  disabled: boolean;
  createdAt: number;
};

export const PASSWORD_MIN = 8;
export const PASSWORD_MAX = 128;

export const PasswordSchema = z.string().min(PASSWORD_MIN, `Mật khẩu tối thiểu ${PASSWORD_MIN} ký tự`).max(PASSWORD_MAX);
export const USERNAME_MAX = 100;
// Tên đăng nhập dùng làm tên thư mục bài nộp: bắt đầu và kết thúc bằng chữ/số (không ".", "..", không dấu chấm cuối).
const PLAIN_USERNAME = /^[a-zA-Z0-9](?:[a-zA-Z0-9._-]*[a-zA-Z0-9])?$/;
// Hoặc là email (vd. admin tạo từ ADMIN_EMAIL) — cũng bắt đầu/kết thúc bằng chữ/số nên vẫn an toàn làm tên thư mục.
const ALNUM_EDGES = '[a-zA-Z0-9](?:[a-zA-Z0-9._+-]*[a-zA-Z0-9])?';
const DOMAIN_LABEL = '[a-zA-Z0-9](?:[a-zA-Z0-9-]*[a-zA-Z0-9])?';
export const EMAIL_USERNAME = new RegExp(`^${ALNUM_EDGES}@${DOMAIN_LABEL}(?:\\.${DOMAIN_LABEL})*\\.[a-zA-Z]{2,}$`);
export const UsernameSchema = z
  .string()
  .trim()
  .min(2)
  .max(USERNAME_MAX)
  .refine(
    (v) => PLAIN_USERNAME.test(v) || EMAIL_USERNAME.test(v),
    'Tên đăng nhập là email, hoặc chỉ gồm chữ không dấu, số và . _ -, bắt đầu và kết thúc bằng chữ hoặc số',
  );

export const LoginBody = z.object({ username: z.string().trim().min(1).max(USERNAME_MAX), password: z.string().min(1).max(PASSWORD_MAX) });
export const ChangePasswordBody = z.object({ currentPassword: z.string().min(1).max(PASSWORD_MAX), newPassword: PasswordSchema });

const FullName = z.string().trim().min(1, 'Họ tên không được để trống').max(100);

// --- Admin: tài khoản giảng viên/admin ---

export const CreateStaffBody = z.object({ username: UsernameSchema, fullName: FullName, role: z.enum(['teacher', 'admin']) });
export const DisableBody = z.object({ disabled: z.boolean() });

// --- Lớp và học viên ---

export type ClassSummary = { id: number; name: string; teacherId: number; teacherName: string; studentCount: number; createdAt: number };
export type ClassDetail = ClassSummary & { students: User[] };

export const ClassBody = z.object({ name: z.string().trim().min(1, 'Tên lớp không được để trống').max(100) });
export const AddStudentsBody = z.object({
  students: z.array(z.object({ username: UsernameSchema, fullName: FullName })).min(1).max(200),
});
export type AddStudentResult = {
  username: string;
  fullName: string;
  status: 'created' | 'added' | 'exists' | 'error';
  tempPassword?: string;
  message?: string;
};

// --- Đề bài ---

export type Assignment = {
  id: number;
  slug: string;
  title: string;
  description: string;
  rubric: string;
  entryFile: string;
  classId: number;
  className: string;
  dueAt: number | null;
  createdAt: number;
  updatedAt: number;
};
export type AssignmentDetail = Assignment & { tests: string };

// File chính: đường dẫn tương đối gồm chữ không dấu, số, . _ - và /, đuôi .js/.cjs/.mjs, không có "..".
export const EntryFileSchema = z
  .string()
  .trim()
  .max(120)
  .regex(/^[A-Za-z0-9_-][A-Za-z0-9._-]*(\/[A-Za-z0-9_-][A-Za-z0-9._-]*)*\.(js|cjs|mjs)$/, 'File chính phải là đường dẫn tương đối tới file .js/.cjs/.mjs')
  .refine((p) => !p.split('/').includes('..'), 'File chính không được chứa ".."');

// --- Bài nộp và điểm ---

export type SubmittedFile = { path: string; size: number };
export type SubmissionSource = 'upload' | 'github';
export type Submission = {
  id: number;
  assignmentId: number;
  studentId: number;
  version: number;
  files: SubmittedFile[];
  submittedAt: number;
  source: SubmissionSource;
  githubUrl: string | null;
  commit: string | null;
};
/** Điểm chính thức — chỉ có sau khi giảng viên duyệt; học viên chỉ thấy loại điểm này. */
export type Grade = { submissionId: number; score: number; comments: string; edited: boolean; approvedAt: number; approvedBy: string };
export type StudentAssignment = Assignment & { latest: Submission | null; grade: Grade | null };
export type StudentAssignmentDetail = StudentAssignment & { submissions: Submission[] };
export type FileContent = { path: string; content: string };

// --- Chấm bài ---

export type GradingStatus = 'queued' | 'running' | 'done' | 'error';
/** Tóm tắt kết quả run_tests mà AI đã chạy. */
export type TestSummary = { status: 'ok' | 'timeout' | 'load_error'; passed?: number; total?: number; failed?: string[]; message?: string };
export type GradingUsage = { input: number; cached: number | null; output: number; costUsd: number; totalMs: number; steps: number; hitLimit: boolean };
/** Một lần AI chấm: điểm đề xuất (chưa chính thức) + cờ cảnh báo; `steps` chỉ có trong chi tiết. */
export type Grading = {
  id: number;
  submissionId: number;
  status: GradingStatus;
  aiScore: number | null;
  aiComments: string | null;
  tests: TestSummary | null;
  flags: string[];
  error: string | null;
  usage: GradingUsage | null;
  createdAt: number;
  finishedAt: number | null;
  steps?: unknown[];
};
export type StudentRef = { id: number; username: string; fullName: string };
export type SubmissionRow = { student: StudentRef; submission: Submission | null; grading: Grading | null; grade: Grade | null };
export type TeacherSubmissionDetail = {
  assignment: Assignment;
  student: StudentRef;
  submission: Submission;
  grading: Grading | null;
  grade: Grade | null;
  history: Submission[];
};
export type GradingEvent = { type: 'grading'; assignmentId: number; submissionId: number; gradingId: number; status: GradingStatus };

export const GradeApproveBody = z.object({
  score: z.number().min(0).max(10),
  comments: z.string().trim().min(1, 'Nhận xét không được để trống').max(5000),
});
export const GradeAllBody = z.object({ regrade: z.boolean().optional() });

export const GithubSubmitBody = z.object({ url: z.string().trim().min(1, 'Hãy dán link repo GitHub').max(300) });

export const AssignmentBody = z.object({
  title: z.string().trim().min(1, 'Tên đề không được để trống').max(120),
  description: z.string().trim().min(1, 'Mô tả không được để trống').max(20_000),
  rubric: z.string().trim().min(1, 'Rubric không được để trống').max(20_000),
  entryFile: EntryFileSchema,
  classId: z.number().int().positive(),
  dueAt: z.number().int().positive().nullable(),
  tests: z.string().min(1, 'Cần nội dung tests.js').max(64_000),
});
