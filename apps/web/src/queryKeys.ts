// Khoá cache TanStack Query dùng chung — đổi dữ liệu ở đâu thì invalidate đúng khoá ở đó.
import type { Role } from '@harness/shared/api';

export const qk = {
  me: ['me'] as const,
  student: {
    all: ['student'] as const,
    assignments: ['student', 'assignments'] as const,
    assignment: (id: number) => ['student', 'assignment', id] as const,
    file: (submissionId: number, path: string) => ['student', 'file', submissionId, path] as const,
  },
  teacher: {
    classes: ['teacher', 'classes'] as const,
    class: (id: number) => ['teacher', 'class', id] as const,
    assignments: ['teacher', 'assignments'] as const,
    assignment: (id: number) => ['teacher', 'assignment', id] as const,
    submissions: (assignmentId: number) => ['teacher', 'submissions', assignmentId] as const,
    submission: (id: number) => ['teacher', 'submission', id] as const,
    file: (submissionId: number, path: string) => ['teacher', 'file', submissionId, path] as const,
  },
  admin: {
    users: (role: Role | '') => ['admin', 'users', role] as const,
    usersAll: ['admin', 'users'] as const,
    audit: ['admin', 'audit'] as const,
  },
  harnessGrades: (version: number) => ['harness', 'grades', version] as const,
};
