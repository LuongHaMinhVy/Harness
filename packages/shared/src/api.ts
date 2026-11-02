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
