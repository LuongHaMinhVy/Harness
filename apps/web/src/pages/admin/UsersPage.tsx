// Tài khoản: lọc theo vai trò, tạo giảng viên/admin (mật khẩu tạm hiện một lần), khoá/mở khoá, đặt lại mật khẩu.
import type { Role, User } from '@harness/shared/api';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState, type FormEvent } from 'react';
import { adminApi } from '../../api.js';
import { useUser } from '../../auth.js';
import { Badge, Card, Empty, ErrorBox, Field, PageHeader, QueryState, TempPassword } from '../../components/ui.js';
import { formatDateTime } from '../../lib/dates.js';
import { ROLE_LABELS } from '../../lib/labels.js';
import { qk } from '../../queryKeys.js';

const FIELD_LABELS = { username: 'Tên đăng nhập', fullName: 'Họ tên', role: 'Vai trò' };

export function UsersPage() {
  const me = useUser();
  const client = useQueryClient();
  const [role, setRole] = useState<Role | ''>('');
  const [shown, setShown] = useState<{ username: string; password: string } | null>(null);
  const { data, isPending, error } = useQuery({ queryKey: qk.admin.users(role), queryFn: () => adminApi.users(role || undefined) });
  const refresh = () => void client.invalidateQueries({ queryKey: qk.admin.usersAll });

  const disable = useMutation({
    mutationFn: (v: { user: User; disabled: boolean }) => adminApi.setDisabled(v.user.id, v.disabled),
    onSuccess: refresh,
  });
  const reset = useMutation({
    mutationFn: (u: User) => adminApi.resetPassword(u.id).then((r) => ({ username: u.username, password: r.tempPassword })),
    onSuccess: (r) => {
      setShown(r);
      refresh();
    },
  });

  const toggle = (u: User) => {
    const verb = u.disabled ? 'Mở khoá' : 'Khoá';
    if (window.confirm(`${verb} tài khoản ${u.fullName} (${u.username})?${u.disabled ? '' : ' Người này sẽ bị đăng xuất ngay.'}`)) {
      disable.mutate({ user: u, disabled: !u.disabled });
    }
  };
  const confirmReset = (u: User) => {
    if (window.confirm(`Đặt lại mật khẩu cho ${u.fullName} (${u.username})? Người này sẽ bị đăng xuất và phải đổi mật khẩu.`)) reset.mutate(u);
  };

  return (
    <>
      <PageHeader title="Tài khoản" subtitle="Tài khoản học viên do giảng viên tạo trong lớp; ở đây tạo giảng viên và quản trị." />
      {shown && <TempPassword username={shown.username} password={shown.password} onClose={() => setShown(null)} />}
      <CreateUser onCreated={(r) => setShown(r)} />
      <Card
        title="Danh sách tài khoản"
        actions={
          <label className="inline-label">
            Vai trò{' '}
            <select value={role} onChange={(e) => setRole(e.target.value as Role | '')}>
              <option value="">Tất cả</option>
              <option value="student">{ROLE_LABELS.student}</option>
              <option value="teacher">{ROLE_LABELS.teacher}</option>
              <option value="admin">{ROLE_LABELS.admin}</option>
            </select>
          </label>
        }
      >
        <ErrorBox error={disable.error ?? reset.error} />
        <QueryState isPending={isPending} error={error} />
        {data && data.length === 0 && <Empty>Không có tài khoản nào.</Empty>}
        {data && data.length > 0 && (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Tên đăng nhập</th>
                  <th>Họ tên</th>
                  <th>Vai trò</th>
                  <th>Trạng thái</th>
                  <th>Tạo lúc</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {data.map((u) => (
                  <tr key={u.id}>
                    <td>
                      <code>{u.username}</code>
                    </td>
                    <td>{u.fullName}</td>
                    <td>{ROLE_LABELS[u.role]}</td>
                    <td>
                      <div className="badge-row">
                        {u.disabled ? <Badge tone="error">Bị khoá</Badge> : <Badge tone="ok">Hoạt động</Badge>}
                        {u.mustChangePassword && <Badge tone="warn">Phải đổi mật khẩu</Badge>}
                      </div>
                    </td>
                    <td className="nowrap">{formatDateTime(u.createdAt)}</td>
                    <td className="actions">
                      {u.id === me.id ? (
                        <span className="muted small">Tài khoản của bạn</span>
                      ) : (
                        <>
                          <button type="button" className="secondary small" onClick={() => confirmReset(u)} disabled={reset.isPending}>
                            Đặt lại mật khẩu
                          </button>
                          <button type="button" className={u.disabled ? 'secondary small' : 'danger small'} onClick={() => toggle(u)} disabled={disable.isPending}>
                            {u.disabled ? 'Mở khoá' : 'Khoá'}
                          </button>
                        </>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </>
  );
}

function CreateUser({ onCreated }: { onCreated: (r: { username: string; password: string }) => void }) {
  const client = useQueryClient();
  const [username, setUsername] = useState('');
  const [fullName, setFullName] = useState('');
  const [role, setRole] = useState<'teacher' | 'admin'>('teacher');
  const create = useMutation({
    mutationFn: () => adminApi.createUser({ username: username.trim(), fullName: fullName.trim(), role }),
    onSuccess: (r) => {
      setUsername('');
      setFullName('');
      onCreated({ username: r.user.username, password: r.tempPassword });
      void client.invalidateQueries({ queryKey: qk.admin.usersAll });
    },
  });
  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (username.trim() && fullName.trim()) create.mutate();
  };
  return (
    <Card title="Tạo tài khoản giảng viên / quản trị">
      <form className="form-grid" onSubmit={submit}>
        <Field label="Tên đăng nhập" hint="Chữ không dấu, số và . _ -">
          <input value={username} onChange={(e) => setUsername(e.target.value)} maxLength={40} required autoComplete="off" />
        </Field>
        <Field label="Họ tên">
          <input value={fullName} onChange={(e) => setFullName(e.target.value)} maxLength={100} required autoComplete="off" />
        </Field>
        <Field label="Vai trò">
          <select value={role} onChange={(e) => setRole(e.target.value as 'teacher' | 'admin')}>
            <option value="teacher">{ROLE_LABELS.teacher}</option>
            <option value="admin">{ROLE_LABELS.admin}</option>
          </select>
        </Field>
        <div className="form-grid-end">
          <button type="submit" disabled={create.isPending}>
            Tạo tài khoản
          </button>
        </div>
      </form>
      <ErrorBox error={create.error} fieldLabels={FIELD_LABELS} />
    </Card>
  );
}
