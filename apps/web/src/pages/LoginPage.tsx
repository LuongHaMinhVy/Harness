import { useMutation } from '@tanstack/react-query';
import { useState, type FormEvent } from 'react';
import { Navigate, useNavigate } from 'react-router';
import { authApi } from '../api.js';
import { useMe, useSetUser } from '../auth.js';
import { ErrorBox, Field } from '../components/ui.js';
import { roleHome } from '../lib/roles.js';

const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '[::1]']);

export function LoginPage() {
  const { data: me } = useMe();
  const setUser = useSetUser();
  const navigate = useNavigate();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const insecure = location.protocol === 'http:' && !LOCAL_HOSTS.has(location.hostname);

  const login = useMutation({
    mutationFn: () => authApi.login(username.trim(), password),
    onSuccess: (user) => {
      setUser(user);
      navigate(user.mustChangePassword ? '/doi-mat-khau' : roleHome(user.role), { replace: true });
    },
  });

  if (me) return <Navigate to={me.mustChangePassword ? '/doi-mat-khau' : roleHome(me.role)} replace />;

  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (!username.trim() || !password) return;
    login.mutate();
  };

  return (
    <div className="auth-page">
      <form className="auth-card" onSubmit={submit}>
        <h1>Đăng nhập</h1>
        <p className="muted">Lớp học lập trình — nộp bài và xem điểm.</p>
        {insecure && (
          <div className="callout error" role="alert">
            Kết nối chưa được mã hoá — mật khẩu có thể bị đọc trên mạng.
          </div>
        )}
        <Field label="Tên đăng nhập">
          <input value={username} onChange={(e) => setUsername(e.target.value)} autoComplete="username" autoFocus maxLength={40} required />
        </Field>
        <Field label="Mật khẩu">
          <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" maxLength={128} required />
        </Field>
        <ErrorBox error={login.error} />
        <button type="submit" disabled={login.isPending}>
          {login.isPending ? 'Đang đăng nhập…' : 'Đăng nhập'}
        </button>
        <p className="small muted">Lưu ý: code bài nộp được gửi tới Gemini (Google) để chấm.</p>
      </form>
    </div>
  );
}
