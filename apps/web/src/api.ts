// Client duy nhất gọi API server. Mọi POST/PUT/DELETE gửi JSON (trình duyệt tự gắn Origin — server dùng để chống CSRF),
// trừ route nộp bài dạng multipart. Lỗi trả về dạng { error, issues? } được chuyển thành ApiError.
// 401 → báo cho App biết phiên đã hết (về trang đăng nhập); 403 must_change_password → về trang đổi mật khẩu.
import type {
  AddStudentResult,
  AssignmentDetail,
  Assignment,
  ClassDetail,
  ClassSummary,
  FileContent,
  Grade,
  Grading,
  GradingEvent,
  Role,
  StudentAssignment,
  StudentAssignmentDetail,
  Submission,
  SubmissionRow,
  TeacherSubmissionDetail,
  User,
} from '@harness/shared/api';
import type { EventEnvelope, GradeRecord, StateSnapshot } from '@harness/shared/events';

export type Issue = { path: string; message: string };

export class ApiError extends Error {
  readonly status: number;
  readonly issues: Issue[];
  constructor(status: number, message: string, issues: Issue[] = []) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.issues = issues;
  }
}

export const MUST_CHANGE_PASSWORD = 'must_change_password';

type Hooks = { onUnauthorized?: () => void; onMustChangePassword?: () => void };
let hooks: Hooks = {};

/** App đăng ký cách xử lý khi phiên hết hạn / phải đổi mật khẩu (cập nhật cache người dùng → điều hướng). */
export function configureApi(h: Hooks): void {
  hooks = h;
}

type Options = { json?: unknown; form?: FormData; authRedirect?: boolean };

async function request<T>(method: 'GET' | 'POST' | 'PUT' | 'DELETE', path: string, opts: Options = {}): Promise<T> {
  const init: RequestInit = { method, credentials: 'same-origin' };
  if (opts.form) init.body = opts.form; // trình duyệt tự đặt Content-Type multipart kèm boundary
  else if (method !== 'GET') {
    init.headers = { 'Content-Type': 'application/json' };
    init.body = JSON.stringify(opts.json ?? {});
  }
  let res: Response;
  try {
    res = await fetch(path, init);
  } catch {
    throw new ApiError(0, 'Không kết nối được tới server — kiểm tra mạng rồi thử lại');
  }
  const body: unknown = await res.json().catch(() => null);
  if (!res.ok) {
    const b = (body ?? {}) as { error?: unknown; issues?: unknown };
    const error = typeof b.error === 'string' ? b.error : `Lỗi HTTP ${res.status}`;
    const issues = Array.isArray(b.issues) ? (b.issues as Issue[]).filter((i) => i && typeof i.message === 'string') : [];
    if (res.status === 401 && opts.authRedirect !== false) hooks.onUnauthorized?.();
    if (res.status === 403 && error === MUST_CHANGE_PASSWORD) {
      hooks.onMustChangePassword?.();
      throw new ApiError(403, 'Bạn cần đổi mật khẩu trước khi tiếp tục');
    }
    throw new ApiError(res.status, error, issues);
  }
  return body as T;
}

const get = <T>(path: string) => request<T>('GET', path);
const post = <T>(path: string, json: unknown = {}) => request<T>('POST', path, { json });
const put = <T>(path: string, json: unknown) => request<T>('PUT', path, { json });
const del = <T>(path: string) => request<T>('DELETE', path);
const q = (path: string) => encodeURIComponent(path);

export type AssignmentInput = {
  title: string;
  description: string;
  rubric: string;
  entryFile: string;
  classId: number;
  dueAt: number | null;
  tests: string;
};

export type AuditEntry = { id: number; at: number; actorId: number | null; actor: string | null; action: string; target: string | null; detail: unknown };

export const authApi = {
  /** null khi chưa đăng nhập (401) — không coi là lỗi. */
  async me(): Promise<User | null> {
    try {
      return (await request<{ user: User }>('GET', '/api/auth/me', { authRedirect: false })).user;
    } catch (e) {
      if (e instanceof ApiError && e.status === 401) return null;
      throw e;
    }
  },
  login: (username: string, password: string) =>
    request<{ user: User }>('POST', '/api/auth/login', { json: { username, password }, authRedirect: false }).then((r) => r.user),
  logout: () => request<{ ok: true }>('POST', '/api/auth/logout', { authRedirect: false }),
  changePassword: (currentPassword: string, newPassword: string) =>
    post<{ user: User }>('/api/auth/change-password', { currentPassword, newPassword }).then((r) => r.user),
};

export const studentApi = {
  assignments: () => get<StudentAssignment[]>('/api/student/assignments'),
  assignment: (id: number) => get<StudentAssignmentDetail>(`/api/student/assignments/${id}`),
  submitFiles: (id: number, files: { file: File; path: string }[]) => {
    const form = new FormData();
    for (const f of files) form.append('files', f.file, f.path);
    return request<Submission>('POST', `/api/student/assignments/${id}/submissions`, { form });
  },
  submitGithub: (id: number, url: string) => post<Submission>(`/api/student/assignments/${id}/submissions/github`, { url }),
  file: (submissionId: number, path: string) => get<FileContent>(`/api/student/submissions/${submissionId}/file?path=${q(path)}`),
};

export const teacherApi = {
  classes: () => get<ClassSummary[]>('/api/teacher/classes'),
  createClass: (name: string) => post<ClassSummary>('/api/teacher/classes', { name }),
  classDetail: (id: number) => get<ClassDetail>(`/api/teacher/classes/${id}`),
  addStudents: (id: number, students: { username: string; fullName: string }[]) =>
    post<AddStudentResult[]>(`/api/teacher/classes/${id}/students`, { students }),
  resetStudentPassword: (classId: number, studentId: number) =>
    post<{ tempPassword: string }>(`/api/teacher/classes/${classId}/students/${studentId}/reset-password`),
  removeStudent: (classId: number, studentId: number) => del<{ ok: true }>(`/api/teacher/classes/${classId}/students/${studentId}`),

  assignments: () => get<Assignment[]>('/api/teacher/assignments'),
  assignment: (id: number) => get<AssignmentDetail>(`/api/teacher/assignments/${id}`),
  createAssignment: (body: AssignmentInput) => post<AssignmentDetail>('/api/teacher/assignments', body),
  updateAssignment: (id: number, body: AssignmentInput) => put<AssignmentDetail>(`/api/teacher/assignments/${id}`, body),

  submissions: (assignmentId: number) => get<SubmissionRow[]>(`/api/teacher/assignments/${assignmentId}/submissions`),
  gradeAll: (assignmentId: number, regrade: boolean) => post<{ queued: number }>(`/api/teacher/assignments/${assignmentId}/grade-all`, { regrade }),
  submission: (id: number) => get<TeacherSubmissionDetail>(`/api/teacher/submissions/${id}`),
  file: (submissionId: number, path: string) => get<FileContent>(`/api/teacher/submissions/${submissionId}/file?path=${q(path)}`),
  grade: (submissionId: number) => post<Grading>(`/api/teacher/submissions/${submissionId}/grade`),
  approve: (submissionId: number, score: number, comments: string) => post<Grade>(`/api/teacher/submissions/${submissionId}/approve`, { score, comments }),
};

export const adminApi = {
  users: (role?: Role) => get<User[]>(`/api/admin/users${role ? `?role=${role}` : ''}`),
  createUser: (body: { username: string; fullName: string; role: 'teacher' | 'admin' }) =>
    post<{ user: User; tempPassword: string }>('/api/admin/users', body),
  setDisabled: (id: number, disabled: boolean) => post<{ user: User }>(`/api/admin/users/${id}/disable`, { disabled }),
  resetPassword: (id: number) => post<{ tempPassword: string }>(`/api/admin/users/${id}/reset-password`),
  audit: () => get<AuditEntry[]>('/api/admin/audit'),
};

// Trang Harness (giao diện trợ lý cũ, chỉ admin).
const HARNESS = '/api/admin/harness';
export const harnessApi = {
  grades: () => get<GradeRecord[]>(`${HARNESS}/grades`),
  ask: (question: string) => post<{ ok: true }>(`${HARNESS}/ask`, { question }),
  approve: (id: string, approved: boolean) => post<{ ok: true }>(`${HARNESS}/approve`, { id, approved }),
  settings: (maxSteps: number) => post<{ ok: true }>(`${HARNESS}/settings`, { maxSteps }),
  reset: () => post<{ ok: true }>(`${HARNESS}/reset`),
  runEval: () => post<{ ok: true }>(`${HARNESS}/eval`),
};

// EventSource tự kết nối lại khi mất kết nối. Mỗi kết nối (kể cả kết nối lại) nhận snapshot làm khung đầu tiên,
// rồi mới đến các sự kiện mới hơn — cùng một luồng nên không thể lệch thứ tự hay mất sự kiện.
export function connectHarnessEvents(h: {
  onOpen: () => void;
  onError: () => void;
  onSnapshot: (snap: StateSnapshot) => void;
  onEnvelope: (env: EventEnvelope) => void;
}): () => void {
  const source = new EventSource(`${HARNESS}/events`);
  source.onopen = h.onOpen;
  source.onerror = h.onError;
  source.addEventListener('snapshot', (m) => h.onSnapshot(JSON.parse(m.data) as StateSnapshot));
  source.onmessage = (m) => h.onEnvelope(JSON.parse(m.data) as EventEnvelope);
  return () => source.close();
}

/** Sự kiện trạng thái chấm cho giảng viên/admin (bỏ qua khung "ping" giữ kết nối). */
export function connectGradingEvents(h: { onEvent: (e: GradingEvent) => void; onOpen?: () => void; onError?: () => void }): () => void {
  const source = new EventSource('/api/teacher/events');
  source.onopen = () => h.onOpen?.();
  source.onerror = () => h.onError?.();
  source.onmessage = (m) => {
    try {
      const e = JSON.parse(m.data) as GradingEvent;
      if (e && e.type === 'grading') h.onEvent(e);
    } catch {
      // bỏ qua khung không phải JSON
    }
  };
  return () => source.close();
}
