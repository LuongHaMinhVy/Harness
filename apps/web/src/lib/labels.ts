// Nhãn tiếng Việt cho vai trò, trạng thái chấm, hành động trong nhật ký.
import type { AddStudentResult, GradingStatus, Role } from '@harness/shared/api';

export const ROLE_LABELS: Record<Role, string> = { admin: 'Quản trị', teacher: 'Giảng viên', student: 'Học viên' };

export type Tone = 'neutral' | 'info' | 'ok' | 'warn' | 'error';

/** Trạng thái chấm của một bài nộp: chưa có lần chấm nào → "Chưa chấm". */
export function gradingStatusLabel(status: GradingStatus | null): { label: string; tone: Tone } {
  switch (status) {
    case 'queued':
      return { label: 'Đang chờ', tone: 'info' };
    case 'running':
      return { label: 'Đang chấm', tone: 'info' };
    case 'done':
      return { label: 'Đã chấm', tone: 'ok' };
    case 'error':
      return { label: 'Lỗi', tone: 'error' };
    default:
      return { label: 'Chưa chấm', tone: 'neutral' };
  }
}

export const ADD_STUDENT_STATUS: Record<AddStudentResult['status'], { label: string; tone: Tone }> = {
  created: { label: 'Tạo mới', tone: 'ok' },
  added: { label: 'Đã thêm vào lớp', tone: 'info' },
  exists: { label: 'Đã có trong lớp', tone: 'neutral' },
  error: { label: 'Lỗi', tone: 'error' },
};

export const AUDIT_ACTIONS: Record<string, string> = {
  login: 'Đăng nhập',
  login_failed: 'Đăng nhập thất bại',
  password_changed: 'Đổi mật khẩu',
  password_reset: 'Đặt lại mật khẩu',
  user_created: 'Tạo tài khoản',
  user_disabled: 'Khoá tài khoản',
  user_enabled: 'Mở khoá tài khoản',
  class_created: 'Tạo lớp',
  students_added: 'Thêm học viên',
  student_removed: 'Xoá học viên khỏi lớp',
  assignment_created: 'Tạo đề bài',
  assignment_updated: 'Sửa đề bài',
  submitted: 'Nộp bài',
  grade_requested: 'Yêu cầu chấm',
  grade_all: 'Chấm tất cả',
  grade_approved: 'Duyệt điểm',
};

export const auditLabel = (action: string) => AUDIT_ACTIONS[action] ?? action;

// Cờ cảnh báo của lần chấm: cờ nghiêm trọng (điểm AI đáng ngờ, bài nhắm vào AI) tô đỏ, còn lại tô vàng.
const SERIOUS_FLAG = /nhắm vào AI|cao hơn nhiều|không chạy được|chấm tay/i;
export const flagTone = (flag: string): 'warn' | 'error' => (SERIOUS_FLAG.test(flag) ? 'error' : 'warn');
