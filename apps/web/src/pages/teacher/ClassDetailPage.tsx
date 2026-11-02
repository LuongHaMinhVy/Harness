// Chi tiết lớp: danh sách học viên, thêm học viên (dán CSV có xem trước, hoặc thêm từng người), mật khẩu tạm,
// đặt lại mật khẩu, xoá khỏi lớp. Trang này được tải riêng (lazy) vì parseStudentCsv kéo theo zod.
import type { AddStudentResult, User } from '@harness/shared/api';
import { parseStudentCsv } from '@harness/shared/csv';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useMemo, useState, type FormEvent } from 'react';
import { Link, useParams } from 'react-router';
import { teacherApi } from '../../api.js';
import { Badge, Card, CopyButton, Empty, ErrorBox, Field, PageHeader, QueryState, TempPassword } from '../../components/ui.js';
import { buildCredentialsCsv } from '../../lib/credentialsCsv.js';
import { ADD_STUDENT_STATUS } from '../../lib/labels.js';
import { qk } from '../../queryKeys.js';

const MAX_PER_REQUEST = 200;

export function ClassDetailPage() {
  const id = Number(useParams().id);
  const client = useQueryClient();
  const [results, setResults] = useState<AddStudentResult[] | null>(null);
  const [reset, setReset] = useState<{ username: string; password: string } | null>(null);
  const { data: cls, isPending, error } = useQuery({
    queryKey: qk.teacher.class(id),
    queryFn: () => teacherApi.classDetail(id),
    enabled: Number.isInteger(id) && id > 0,
  });

  const refresh = () => {
    void client.invalidateQueries({ queryKey: qk.teacher.class(id) });
    void client.invalidateQueries({ queryKey: qk.teacher.classes });
  };

  const add = useMutation({
    mutationFn: (students: { username: string; fullName: string }[]) => teacherApi.addStudents(id, students),
    onSuccess: (r) => {
      setResults(r);
      refresh();
    },
  });
  const resetPassword = useMutation({
    mutationFn: (s: User) => teacherApi.resetStudentPassword(id, s.id).then((r) => ({ username: s.username, password: r.tempPassword })),
    onSuccess: (r) => {
      setReset(r);
      refresh();
    },
  });
  const remove = useMutation({
    mutationFn: (s: User) => teacherApi.removeStudent(id, s.id),
    onSuccess: refresh,
  });

  if (!cls) return <QueryState isPending={isPending} error={error} />;

  const confirmReset = (s: User) => {
    if (window.confirm(`Đặt lại mật khẩu cho ${s.fullName} (${s.username})? Mật khẩu cũ sẽ không dùng được nữa.`)) resetPassword.mutate(s);
  };
  const confirmRemove = (s: User) => {
    if (window.confirm(`Xoá ${s.fullName} (${s.username}) khỏi lớp ${cls.name}? Tài khoản và bài đã nộp vẫn được giữ.`)) remove.mutate(s);
  };

  return (
    <>
      <p className="breadcrumb">
        <Link to="/giang-vien/lop-hoc">← Lớp học</Link>
      </p>
      <PageHeader title={`Lớp ${cls.name}`} subtitle={`Giảng viên: ${cls.teacherName} · ${cls.students.length} học viên`} />

      {reset && <TempPassword username={reset.username} password={reset.password} onClose={() => setReset(null)} />}
      <ErrorBox error={resetPassword.error ?? remove.error} />

      <Card title="Học viên">
        {cls.students.length === 0 ? (
          <Empty>Lớp chưa có học viên — thêm ở bên dưới.</Empty>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Tên đăng nhập</th>
                  <th>Họ tên</th>
                  <th>Trạng thái</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {cls.students.map((s) => (
                  <tr key={s.id}>
                    <td>
                      <code>{s.username}</code>
                    </td>
                    <td>{s.fullName}</td>
                    <td>
                      <div className="badge-row">
                        {s.disabled && <Badge tone="error">Bị khoá</Badge>}
                        {s.mustChangePassword && <Badge tone="warn">Phải đổi mật khẩu</Badge>}
                        {!s.disabled && !s.mustChangePassword && <Badge tone="ok">Hoạt động</Badge>}
                      </div>
                    </td>
                    <td className="actions">
                      <button type="button" className="secondary small" onClick={() => confirmReset(s)} disabled={resetPassword.isPending}>
                        Đặt lại mật khẩu
                      </button>
                      <button type="button" className="danger small" onClick={() => confirmRemove(s)} disabled={remove.isPending}>
                        Xoá khỏi lớp
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {results && <AddResults results={results} className={cls.name} onClose={() => setResults(null)} />}

      <div className="two-col">
        <BulkAdd onAdd={(rows, done) => add.mutate(rows, { onSuccess: done })} pending={add.isPending} />
        <SingleAdd onAdd={(row, done) => add.mutate([row], { onSuccess: done })} pending={add.isPending} />
      </div>
      <ErrorBox error={add.error} />
    </>
  );
}

type Row = { username: string; fullName: string };

function BulkAdd({ onAdd, pending }: { onAdd: (rows: Row[], done: () => void) => void; pending: boolean }) {
  const [text, setText] = useState('');
  const parsed = useMemo(() => parseStudentCsv(text), [text]);
  const tooMany = parsed.rows.length > MAX_PER_REQUEST;

  return (
    <Card title="Thêm nhiều học viên">
      <Field
        label="Dán danh sách (mỗi dòng: tên đăng nhập, họ tên)"
        hint="Phân cách bằng dấu phẩy, chấm phẩy hoặc tab — dán thẳng từ Excel được. Dòng tiêu đề (username, …) tự bỏ qua."
      >
        <textarea value={text} onChange={(e) => setText(e.target.value)} rows={8} placeholder={'nam.nv,Nguyễn Văn Nam\nlan.tt,Trần Thị Lan'} spellCheck={false} />
      </Field>
      {text.trim() && (
        <div className="csv-preview">
          {parsed.errors.length > 0 && (
            <div className="callout error">
              <strong>{parsed.errors.length} dòng lỗi (sẽ không được thêm):</strong>
              <ul>
                {parsed.errors.map((e) => (
                  <li key={e.line}>
                    Dòng {e.line}: {e.message}
                  </li>
                ))}
              </ul>
            </div>
          )}
          {parsed.rows.length > 0 && (
            <div className="table-wrap preview-table">
              <table className="compact">
                <thead>
                  <tr>
                    <th>Tên đăng nhập</th>
                    <th>Họ tên</th>
                  </tr>
                </thead>
                <tbody>
                  {parsed.rows.map((r) => (
                    <tr key={r.username}>
                      <td>
                        <code>{r.username}</code>
                      </td>
                      <td>{r.fullName}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          {tooMany && <div className="callout error">Tối đa {MAX_PER_REQUEST} học viên mỗi lần — hãy chia nhỏ danh sách.</div>}
        </div>
      )}
      <div className="button-row">
        <button
          type="button"
          disabled={!parsed.rows.length || tooMany || pending}
          onClick={() => {
            onAdd(parsed.rows, () => setText(''));
          }}
        >
          Thêm {parsed.rows.length || ''} học viên
        </button>
      </div>
    </Card>
  );
}

function SingleAdd({ onAdd, pending }: { onAdd: (row: Row, done: () => void) => void; pending: boolean }) {
  const [username, setUsername] = useState('');
  const [fullName, setFullName] = useState('');
  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (!username.trim() || !fullName.trim()) return;
    onAdd({ username: username.trim(), fullName: fullName.trim() }, () => {
      setUsername('');
      setFullName('');
    });
  };
  return (
    <Card title="Thêm một học viên">
      <form className="stack-form" onSubmit={submit}>
        <Field label="Tên đăng nhập" hint="Email, hoặc chữ không dấu, số và . _ -">
          <input value={username} onChange={(e) => setUsername(e.target.value)} maxLength={100} required />
        </Field>
        <Field label="Họ tên">
          <input value={fullName} onChange={(e) => setFullName(e.target.value)} maxLength={100} required />
        </Field>
        <div className="button-row">
          <button type="submit" disabled={pending}>
            Thêm học viên
          </button>
        </div>
      </form>
    </Card>
  );
}

function AddResults({ results, className, onClose }: { results: AddStudentResult[]; className: string; onClose: () => void }) {
  const created = results.filter((r): r is AddStudentResult & { tempPassword: string } => r.status === 'created' && !!r.tempPassword);
  const download = () => {
    const csv = buildCredentialsCsv(created.map((r) => ({ username: r.username, fullName: r.fullName, tempPassword: r.tempPassword })));
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = `tai-khoan-${className.replace(/[^\p{L}\p{N}_-]+/gu, '-')}.csv`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  return (
    <Card
      title="Kết quả thêm học viên"
      className="results-card"
      actions={
        <>
          {created.length > 0 && (
            <button type="button" onClick={download}>
              Tải danh sách (CSV)
            </button>
          )}
          <button type="button" className="secondary" onClick={onClose}>
            Đóng
          </button>
        </>
      }
    >
      {created.length > 0 && (
        <div className="callout warn">Mật khẩu tạm chỉ hiện một lần — hãy tải danh sách hoặc sao chép ngay trước khi đóng.</div>
      )}
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Tên đăng nhập</th>
              <th>Họ tên</th>
              <th>Kết quả</th>
              <th>Mật khẩu tạm / ghi chú</th>
            </tr>
          </thead>
          <tbody>
            {results.map((r) => {
              const s = ADD_STUDENT_STATUS[r.status];
              return (
                <tr key={r.username}>
                  <td>
                    <code>{r.username}</code>
                  </td>
                  <td>{r.fullName}</td>
                  <td>
                    <Badge tone={s.tone}>{s.label}</Badge>
                  </td>
                  <td>
                    {r.tempPassword ? (
                      <span className="nowrap">
                        <code className="password">{r.tempPassword}</code> <CopyButton text={r.tempPassword} />
                      </span>
                    ) : (
                      <span className="muted">{r.message ?? (r.status === 'error' ? 'Lỗi' : 'Dùng mật khẩu hiện có')}</span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </Card>
  );
}
