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
export const UsernameSchema = z
  .string()
  .trim()
  .min(2)
  .max(40)
  .regex(/^[a-zA-Z0-9._-]+$/, 'Tên đăng nhập chỉ gồm chữ không dấu, số và . _ -');

export const LoginBody = z.object({ username: z.string().trim().min(1).max(40), password: z.string().min(1).max(PASSWORD_MAX) });
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
export type Submission = { id: number; assignmentId: number; studentId: number; version: number; files: SubmittedFile[]; submittedAt: number };
/** Điểm chính thức — chỉ có sau khi giảng viên duyệt; học viên chỉ thấy loại điểm này. */
export type Grade = { submissionId: number; score: number; comments: string; edited: boolean; approvedAt: number; approvedBy: string };
export type StudentAssignment = Assignment & { latest: Submission | null; grade: Grade | null };
export type StudentAssignmentDetail = StudentAssignment & { submissions: Submission[] };
export type FileContent = { path: string; content: string };

export const AssignmentBody = z.object({
  title: z.string().trim().min(1, 'Tên đề không được để trống').max(120),
  description: z.string().trim().min(1, 'Mô tả không được để trống').max(20_000),
  rubric: z.string().trim().min(1, 'Rubric không được để trống').max(20_000),
  entryFile: EntryFileSchema,
  classId: z.number().int().positive(),
  dueAt: z.number().int().positive().nullable(),
  tests: z.string().min(1, 'Cần nội dung tests.js').max(64_000),
});
