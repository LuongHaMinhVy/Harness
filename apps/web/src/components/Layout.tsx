// Khung trang sau đăng nhập: thanh bên (link theo vai trò), thanh trên (họ tên, vai trò, đổi mật khẩu, đăng xuất).
import { useMutation } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { Link, NavLink, Outlet, useLocation, useNavigate } from 'react-router';
import { authApi } from '../api.js';
import { useSetUser, useUser } from '../auth.js';
import { ROLE_LABELS } from '../lib/labels.js';
import { navFor, roleHome } from '../lib/roles.js';

export function Layout() {
  const user = useUser();
  const setUser = useSetUser();
  const navigate = useNavigate();
  const location = useLocation();
  const [menuOpen, setMenuOpen] = useState(false);

  // Đóng menu (màn hình hẹp) khi chuyển trang.
  useEffect(() => setMenuOpen(false), [location.pathname]);

  const logout = useMutation({
    mutationFn: authApi.logout,
    onSettled: () => {
      setUser(null);
      navigate('/dang-nhap', { replace: true });
    },
  });

  return (
    <div className="shell">
      <header className="topbar">
        <button
          type="button"
          className="menu-toggle secondary"
          aria-expanded={menuOpen}
          aria-controls="sidebar"
          onClick={() => setMenuOpen((v) => !v)}
        >
          ☰ Menu
        </button>
        <Link to={roleHome(user.role)} className="brand">
          Lớp học lập trình
        </Link>
        <div className="topbar-user">
          <span className="user-name">{user.fullName}</span>
          <span className="role-tag">{ROLE_LABELS[user.role]}</span>
          <Link to="/doi-mat-khau" className="topbar-link">
            Đổi mật khẩu
          </Link>
          <button type="button" className="secondary small" onClick={() => logout.mutate()} disabled={logout.isPending}>
            Đăng xuất
          </button>
        </div>
      </header>
      <div className="shell-body">
        <nav id="sidebar" className={menuOpen ? 'sidebar open' : 'sidebar'} aria-label="Điều hướng chính">
          {navFor(user.role).map((group) => (
            <div key={group.title} className="nav-group">
              <div className="nav-title">{group.title}</div>
              {group.items.map((item) => (
                <NavLink key={item.to} to={item.to} end={item.end} className={({ isActive }) => (isActive ? 'nav-link active' : 'nav-link')}>
                  {item.label}
                </NavLink>
              ))}
            </div>
          ))}
        </nav>
        <main className="content">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
