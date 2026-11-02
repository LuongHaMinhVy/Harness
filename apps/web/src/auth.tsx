// Người dùng hiện tại (GET /api/auth/me khi khởi động) và các "cổng" route theo đăng nhập / vai trò.
import { useQuery, useQueryClient } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import type { Role, User } from '@harness/shared/api';
import { Navigate, Outlet, useLocation } from 'react-router';
import { authApi } from './api.js';
import { roleHome } from './lib/roles.js';
import { qk } from './queryKeys.js';

export function useMe() {
  return useQuery({ queryKey: qk.me, queryFn: authApi.me, staleTime: Infinity, retry: 1 });
}

/** Người dùng chắc chắn đã đăng nhập (chỉ dùng bên trong RequireAuth). */
export function useUser(): User {
  const { data } = useMe();
  if (!data) throw new Error('useUser() dùng ngoài RequireAuth');
  return data;
}

/** Sau đăng nhập / đổi mật khẩu: xoá cache của phiên trước, ghi người dùng mới. */
export function useSetUser() {
  const client = useQueryClient();
  return (user: User | null) => {
    client.removeQueries({ predicate: (q) => q.queryKey[0] !== 'me' });
    client.setQueryData(qk.me, user);
  };
}

export function FullPageMessage({ children }: { children: ReactNode }) {
  return <div className="full-page-message">{children}</div>;
}

/** Chưa đăng nhập → /dang-nhap; phải đổi mật khẩu → /doi-mat-khau. */
export function RequireAuth() {
  const { data: user, isPending, error, refetch } = useMe();
  const location = useLocation();
  if (isPending) return <FullPageMessage>Đang tải…</FullPageMessage>;
  if (error)
    return (
      <FullPageMessage>
        <p>Không tải được thông tin đăng nhập: {error.message}</p>
        <button onClick={() => void refetch()}>Thử lại</button>
      </FullPageMessage>
    );
  if (!user) return <Navigate to="/dang-nhap" replace state={{ from: location.pathname }} />;
  if (user.mustChangePassword && location.pathname !== '/doi-mat-khau') return <Navigate to="/doi-mat-khau" replace />;
  return <Outlet />;
}

/** Sai vai trò → về trang chủ của vai trò mình. */
export function RequireRole({ roles }: { roles: Role[] }) {
  const user = useUser();
  if (!roles.includes(user.role)) return <Navigate to={roleHome(user.role)} replace />;
  return <Outlet />;
}

/** "/" → trang chủ theo vai trò. */
export function HomeRedirect() {
  const user = useUser();
  return <Navigate to={roleHome(user.role)} replace />;
}
