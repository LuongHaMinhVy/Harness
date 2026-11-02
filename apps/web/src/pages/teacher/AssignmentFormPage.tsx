// Tạo / sửa đề bài: tên, lớp, hạn nộp (tuỳ chọn), file chính, mô tả, rubric, tests.js. Lỗi kiểm tra của server hiện theo trường.
import type { AssignmentDetail, ClassSummary } from '@harness/shared/api';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState, type FormEvent } from 'react';
import { Link, useNavigate, useParams } from 'react-router';
import { teacherApi, type AssignmentInput } from '../../api.js';
import { Card, ErrorBox, Field, PageHeader, QueryState } from '../../components/ui.js';
import { fromDatetimeLocal, toDatetimeLocal } from '../../lib/dates.js';
import { TESTS_TEMPLATE } from '../../lib/testsTemplate.js';
import { qk } from '../../queryKeys.js';

const FIELD_LABELS: Record<string, string> = {
  title: 'Tên đề',
  classId: 'Lớp',
  dueAt: 'Hạn nộp',
  entryFile: 'File chính',
  description: 'Mô tả',
  rubric: 'Rubric',
  tests: 'tests.js',
};

export function AssignmentFormPage() {
  const params = useParams();
  const editId = params.id ? Number(params.id) : null;
  const classes = useQuery({ queryKey: qk.teacher.classes, queryFn: teacherApi.classes });
  const existing = useQuery({
    queryKey: qk.teacher.assignment(editId ?? 0),
    queryFn: () => teacherApi.assignment(editId!),
    enabled: editId !== null,
  });

  if (classes.isPending || (editId !== null && existing.isPending))
    return <QueryState isPending error={classes.error ?? existing.error} />;
  if (classes.error || existing.error) return <QueryState isPending={false} error={classes.error ?? existing.error} />;

  // key: khi dữ liệu đề đã tải xong thì form khởi tạo lại từ đó.
  return <AssignmentForm key={existing.data?.id ?? 'new'} classes={classes.data ?? []} initial={existing.data ?? null} />;
}

function AssignmentForm({ classes, initial }: { classes: ClassSummary[]; initial: AssignmentDetail | null }) {
  const client = useQueryClient();
  const navigate = useNavigate();
  const [title, setTitle] = useState(initial?.title ?? '');
  const [classId, setClassId] = useState<number | ''>(initial?.classId ?? (classes.length === 1 ? classes[0]!.id : ''));
  const [due, setDue] = useState(toDatetimeLocal(initial?.dueAt ?? null));
  const [entryFile, setEntryFile] = useState(initial?.entryFile ?? 'index.js');
  const [description, setDescription] = useState(initial?.description ?? '');
  const [rubric, setRubric] = useState(initial?.rubric ?? '');
  const [tests, setTests] = useState(initial?.tests ?? TESTS_TEMPLATE);
  const [localError, setLocalError] = useState<string | null>(null);

  const save = useMutation({
    mutationFn: (body: AssignmentInput) => (initial ? teacherApi.updateAssignment(initial.id, body) : teacherApi.createAssignment(body)),
    onSuccess: (a) => {
      void client.invalidateQueries({ queryKey: qk.teacher.assignments });
      void client.invalidateQueries({ queryKey: qk.teacher.assignment(a.id) });
      navigate(`/giang-vien/de-bai/${a.id}`);
    },
  });

  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (classId === '') return setLocalError('Hãy chọn lớp');
    const dueAt = due ? fromDatetimeLocal(due) : null;
    if (due && dueAt === null) return setLocalError('Hạn nộp không hợp lệ');
    setLocalError(null);
    save.mutate({ title, classId, dueAt, entryFile: entryFile.trim(), description, rubric, tests });
  };

  return (
    <>
      <p className="breadcrumb">
        <Link to={initial ? `/giang-vien/de-bai/${initial.id}` : '/giang-vien/de-bai'}>← {initial ? initial.title : 'Đề bài'}</Link>
      </p>
      <PageHeader title={initial ? 'Sửa đề bài' : 'Tạo đề mới'} />
      <form className="assignment-form" onSubmit={submit}>
        <Card title="Thông tin chung">
          <div className="form-grid">
            <Field label="Tên đề">
              <input value={title} onChange={(e) => setTitle(e.target.value)} maxLength={120} required />
            </Field>
            <Field label="Lớp" hint={classes.length === 0 ? 'Chưa có lớp nào — hãy tạo lớp trước.' : undefined}>
              <select value={classId} onChange={(e) => setClassId(e.target.value ? Number(e.target.value) : '')} required>
                <option value="">— Chọn lớp —</option>
                {classes.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Hạn nộp (tuỳ chọn)" hint="Để trống nếu không giới hạn. Sau hạn, học viên không nộp thêm được.">
              <input type="datetime-local" value={due} onChange={(e) => setDue(e.target.value)} />
            </Field>
            <Field label="File chính" hint="Đường dẫn tương đối tới file .js/.cjs/.mjs mà bộ test sẽ require().">
              <input value={entryFile} onChange={(e) => setEntryFile(e.target.value)} maxLength={120} required spellCheck={false} />
            </Field>
          </div>
        </Card>
        <Card title="Mô tả đề (học viên thấy)">
          <textarea className="tall" value={description} onChange={(e) => setDescription(e.target.value)} rows={8} required aria-label="Mô tả" />
        </Card>
        <Card title="Rubric / tiêu chí chấm (học viên thấy)">
          <textarea className="tall" value={rubric} onChange={(e) => setRubric(e.target.value)} rows={8} required aria-label="Rubric" />
        </Card>
        <Card title="tests.js (học viên không thấy)">
          <textarea className="code-input" value={tests} onChange={(e) => setTests(e.target.value)} rows={16} spellCheck={false} required aria-label="tests.js" />
        </Card>
        {localError && (
          <div className="callout error" role="alert">
            {localError}
          </div>
        )}
        <ErrorBox error={save.error} fieldLabels={FIELD_LABELS} />
        <div className="button-row">
          <button type="submit" disabled={save.isPending}>
            {save.isPending ? 'Đang lưu…' : initial ? 'Lưu thay đổi' : 'Tạo đề'}
          </button>
          <Link to={initial ? `/giang-vien/de-bai/${initial.id}` : '/giang-vien/de-bai'} className="button secondary">
            Huỷ
          </Link>
        </div>
      </form>
    </>
  );
}
