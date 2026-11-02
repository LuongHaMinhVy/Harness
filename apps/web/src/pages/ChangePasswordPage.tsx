import { useMutation } from '@tanstack/react-query';
import { useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router';
import { authApi } from '../api.js';
import { useSetUser, useUser } from '../auth.js';
import { ErrorBox, Field } from '../components/ui.js';
import { roleHome } from '../lib/roles.js';

// Khớp PASSWORD_MIN trong @harness/shared/api (không import giá trị để zod không vào bundle chính).
const PASSWORD_MIN = 8;

export function ChangePasswordPage() {
  const user = useUser();
  const setUser = useSetUser();
  const navigate = useNavigate();
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [confirm, setConfirm] = useState('');
  const [localError, setLocalError] = useState<string | null>(null);

  const change = useMutation({
    mutationFn: () => authApi.changePassword(current, next),
    onSuccess: (updated) => {
      setUser(updated);
      navigate(roleHome(updated.role), { replace: true });
    },
  });
  const logout = useMutation({
    mutationFn: authApi.logout,
    onSettled: () => {
      setUser(null);
      navigate('/dang-nhap', { replace: true });
    },
  });

  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (next.length < PASSWORD_MIN) return setLocalError(`Mật khẩu mới tối thiểu ${PASSWORD_MIN} ký tự`);
    if (next !== confirm) return setLocalError('Nhập lại mật khẩu mới không khớp');
    if (next === current) return setLocalError('Mật khẩu mới phải khác mật khẩu hiện tại');
    setLocalError(null);
    change.mutate();
  };

  return (
    <div className="auth-page">
      <form className="auth-card" onSubmit={submit}>
        <h1>Đổi mật khẩu</h1>
        <p className="muted">
          {user.fullName} ({user.username})
        </p>
        {user.mustChangePassword && (
          <div className="callout warn">Bạn đang dùng mật khẩu tạm — hãy đặt mật khẩu mới để tiếp tục.</div>
        )}
        <Field label={user.mustChangePassword ? 'Mật khẩu tạm (hiện tại)' : 'Mật khẩu hiện tại'}>
          <input type="password" value={current} onChange={(e) => setCurrent(e.target.value)} autoComplete="current-password" maxLength={128} required />
        </Field>
        <Field label="Mật khẩu mới" hint={`Tối thiểu ${PASSWORD_MIN} ký tự.`}>
          <input type="password" value={next} onChange={(e) => setNext(e.target.value)} autoComplete="new-password" maxLength={128} required />
        </Field>
        <Field label="Nhập lại mật khẩu mới">
          <input type="password" value={confirm} onChange={(e) => setConfirm(e.target.value)} autoComplete="new-password" maxLength={128} required />
        </Field>
        {localError && (
          <div className="callout error" role="alert">
            {localError}
          </div>
        )}
        <ErrorBox error={change.error} />
        <button type="submit" disabled={change.isPending}>
          {change.isPending ? 'Đang lưu…' : 'Đổi mật khẩu'}
        </button>
        <div className="auth-links">
          {!user.mustChangePassword && <Link to={roleHome(user.role)}>← Quay lại</Link>}
          <button type="button" className="link" onClick={() => logout.mutate()}>
            Đăng xuất
          </button>
        </div>
      </form>
    </div>
  );
}
