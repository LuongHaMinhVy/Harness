// Danh sách lớp + tạo lớp mới.
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router';
import { teacherApi } from '../../api.js';
import { useUser } from '../../auth.js';
import { Card, Empty, ErrorBox, PageHeader, QueryState } from '../../components/ui.js';
import { formatDateTime } from '../../lib/dates.js';
import { qk } from '../../queryKeys.js';

export function ClassesPage() {
  const user = useUser();
  const client = useQueryClient();
  const navigate = useNavigate();
  const [name, setName] = useState('');
  const { data, isPending, error } = useQuery({ queryKey: qk.teacher.classes, queryFn: teacherApi.classes });

  const create = useMutation({
    mutationFn: () => teacherApi.createClass(name.trim()),
    onSuccess: (cls) => {
      setName('');
      void client.invalidateQueries({ queryKey: qk.teacher.classes });
      navigate(`/giang-vien/lop-hoc/${cls.id}`);
    },
  });
  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (name.trim()) create.mutate();
  };

  return (
    <>
      <PageHeader title="Lớp học" subtitle="Tạo lớp, thêm học viên và cấp mật khẩu tạm." />
      <Card title="Tạo lớp mới">
        <form className="inline-form" onSubmit={submit}>
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Tên lớp, ví dụ: JS cơ bản K12" maxLength={100} aria-label="Tên lớp" required />
          <button type="submit" disabled={!name.trim() || create.isPending}>
            Tạo lớp
          </button>
        </form>
        <ErrorBox error={create.error} />
      </Card>
      <Card title="Các lớp">
        <QueryState isPending={isPending} error={error} />
        {data && data.length === 0 && <Empty>Chưa có lớp nào.</Empty>}
        {data && data.length > 0 && (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Tên lớp</th>
                  {user.role === 'admin' && <th>Giảng viên</th>}
                  <th>Số học viên</th>
                  <th>Tạo lúc</th>
                </tr>
              </thead>
              <tbody>
                {data.map((c) => (
                  <tr key={c.id}>
                    <td>
                      <Link to={`/giang-vien/lop-hoc/${c.id}`}>{c.name}</Link>
                    </td>
                    {user.role === 'admin' && <td>{c.teacherName}</td>}
                    <td>{c.studentCount}</td>
                    <td className="nowrap">{formatDateTime(c.createdAt)}</td>
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
