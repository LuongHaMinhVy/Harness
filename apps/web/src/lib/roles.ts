// Trang chủ theo vai trò và các link ở thanh bên.
import type { Role } from '@harness/shared/api';

export function roleHome(role: Role): string {
  return role === 'student' ? '/hoc-vien' : role === 'teacher' ? '/giang-vien' : '/admin';
}

export type NavItem = { to: string; label: string; end?: boolean };
export type NavGroup = { title: string; items: NavItem[] };

const STUDENT: NavGroup = { title: 'Học viên', items: [{ to: '/hoc-vien', label: 'Bài tập của tôi', end: true }] };
const TEACHER: NavGroup = {
  title: 'Giảng dạy',
  items: [
    { to: '/giang-vien/lop-hoc', label: 'Lớp học' },
    { to: '/giang-vien/de-bai', label: 'Đề bài' },
  ],
};
const ADMIN: NavGroup = {
  title: 'Quản trị',
  items: [
    { to: '/admin/tai-khoan', label: 'Tài khoản' },
    { to: '/admin/nhat-ky', label: 'Nhật ký' },
    { to: '/admin/harness', label: 'Harness' },
  ],
};

/** Admin thấy cả link của giảng viên. */
export function navFor(role: Role): NavGroup[] {
  return role === 'student' ? [STUDENT] : role === 'teacher' ? [TEACHER] : [TEACHER, ADMIN];
}
