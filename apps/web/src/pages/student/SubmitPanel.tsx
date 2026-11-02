// Nộp bài: tab "Tải file / thư mục" (kéo thả hoặc chọn) và tab "Link GitHub". Kiểm tra phía trình duyệt chỉ là gợi ý,
// server luôn kiểm tra lại và lỗi của server được hiện nguyên văn.
import type { Submission } from '@harness/shared/api';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useEffect, useRef, useState, type DragEvent, type FormEvent } from 'react';
import { studentApi } from '../../api.js';
import { Card, ErrorBox, Field } from '../../components/ui.js';
import { addFiles, formatBytes, submissionWarnings, totalSize, walkEntries, type EntryLike, type PickedFile, type SkippedFile } from '../../lib/files.js';
import { qk } from '../../queryKeys.js';

type Tab = 'upload' | 'github';

export function SubmitPanel({ assignmentId, entryFile, closed }: { assignmentId: number; entryFile: string; closed: boolean }) {
  const [tab, setTab] = useState<Tab>('upload');
  const [done, setDone] = useState<Submission | null>(null);
  const client = useQueryClient();
  const onSubmitted = (s: Submission) => {
    setDone(s);
    void client.invalidateQueries({ queryKey: qk.student.assignment(assignmentId) });
    void client.invalidateQueries({ queryKey: qk.student.assignments });
  };

  return (
    <Card title="Nộp bài">
      {closed ? (
        <div className="callout error">Đã quá hạn nộp bài — không thể nộp thêm phiên bản mới.</div>
      ) : (
        <>
          <div className="tabs" role="tablist">
            <button type="button" role="tab" aria-selected={tab === 'upload'} className={tab === 'upload' ? 'tab active' : 'tab'} onClick={() => setTab('upload')}>
              Tải file / thư mục
            </button>
            <button type="button" role="tab" aria-selected={tab === 'github'} className={tab === 'github' ? 'tab active' : 'tab'} onClick={() => setTab('github')}>
              Link GitHub
            </button>
          </div>
          {done && (
            <div className="callout ok" role="status">
              ✓ Đã nộp phiên bản {done.version} ({done.files.length} file). Giảng viên sẽ chấm và duyệt điểm.
            </div>
          )}
          {tab === 'upload' ? (
            <UploadTab assignmentId={assignmentId} entryFile={entryFile} onSubmitted={onSubmitted} onChange={() => setDone(null)} />
          ) : (
            <GithubTab assignmentId={assignmentId} onSubmitted={onSubmitted} onChange={() => setDone(null)} />
          )}
        </>
      )}
    </Card>
  );
}

type TabProps = { assignmentId: number; onSubmitted: (s: Submission) => void; onChange: () => void };

function UploadTab({ assignmentId, entryFile, onSubmitted, onChange }: TabProps & { entryFile: string }) {
  const [files, setFiles] = useState<PickedFile[]>([]);
  const [skipped, setSkipped] = useState<SkippedFile[]>([]);
  const [notice, setNotice] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);
  const [reading, setReading] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);
  const dirInput = useRef<HTMLInputElement>(null);

  // React không có thuộc tính webkitdirectory — gắn trực tiếp vào phần tử.
  useEffect(() => {
    dirInput.current?.setAttribute('webkitdirectory', '');
  }, []);

  const submit = useMutation({
    mutationFn: () => studentApi.submitFiles(assignmentId, files),
    onSuccess: (s) => {
      setFiles([]);
      setSkipped([]);
      setNotice(null);
      onSubmitted(s);
    },
  });

  const add = (incoming: PickedFile[], skippedDirs: SkippedFile[] = []) => {
    const r = addFiles(files, incoming);
    setFiles(r.files);
    setSkipped([...skippedDirs, ...r.skipped]);
    setNotice(r.archiveError);
    submit.reset();
    onChange();
  };

  const fromInput = (input: HTMLInputElement) => {
    const list = Array.from(input.files ?? []).map((file) => ({ file, path: file.webkitRelativePath || file.name }));
    input.value = ''; // cho phép chọn lại đúng thư mục/file đó
    if (list.length) add(list);
  };

  const onDrop = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setDragging(false);
    // Phải lấy entry ngay trong sự kiện — sau await, DataTransfer không còn dùng được.
    const items = Array.from(e.dataTransfer.items ?? []);
    const entries = items
      .filter((i) => i.kind === 'file')
      .map((i) => (typeof i.webkitGetAsEntry === 'function' ? i.webkitGetAsEntry() : null))
      .filter((x): x is FileSystemEntry => x !== null);
    if (!entries.length) {
      add(Array.from(e.dataTransfer.files).map((file) => ({ file, path: file.name })));
      return;
    }
    setReading(true);
    walkEntries<File>(entries as EntryLike[])
      .then((r) => add(r.files, r.skipped))
      .catch(() => setNotice('Không đọc được file/thư mục vừa thả — hãy dùng nút "Chọn thư mục"'))
      .finally(() => setReading(false));
  };

  const remove = (path: string) => setFiles((fs) => fs.filter((f) => f.path !== path));
  const clear = () => {
    setFiles([]);
    setSkipped([]);
    setNotice(null);
    submit.reset();
  };
  const warnings = submissionWarnings(files, entryFile);

  return (
    <div className="upload-tab">
      <div
        className={dragging ? 'dropzone dragging' : 'dropzone'}
        onDragOver={(e) => {
          e.preventDefault();
          e.dataTransfer.dropEffect = 'copy';
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={onDrop}
      >
        <p>
          <strong>Kéo thả file hoặc cả thư mục bài làm vào đây</strong>
        </p>
        <p className="muted small">
          Chỉ nhận .js .cjs .mjs .json .md .txt; tự bỏ qua node_modules và file ẩn. File chính: <code>{entryFile}</code>
        </p>
        <div className="button-row">
          <button type="button" className="secondary" onClick={() => fileInput.current?.click()}>
            Chọn file
          </button>
          <button type="button" className="secondary" onClick={() => dirInput.current?.click()}>
            Chọn thư mục
          </button>
        </div>
        <input ref={fileInput} type="file" multiple hidden onChange={(e) => fromInput(e.currentTarget)} />
        <input ref={dirInput} type="file" multiple hidden onChange={(e) => fromInput(e.currentTarget)} />
        {reading && <p className="muted">Đang đọc thư mục…</p>}
      </div>

      {notice && (
        <div className="callout error" role="alert">
          {notice}
        </div>
      )}

      {files.length > 0 && (
        <div className="picked">
          <div className="picked-head">
            <strong>
              {files.length} file · {formatBytes(totalSize(files))}
            </strong>
            <button type="button" className="link" onClick={clear}>
              Xoá hết
            </button>
          </div>
          <div className="table-wrap">
            <table className="compact">
              <thead>
                <tr>
                  <th>Đường dẫn</th>
                  <th>Dung lượng</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {files.map((f) => (
                  <tr key={f.path}>
                    <td className="path">{f.path}</td>
                    <td className="nowrap">{formatBytes(f.file.size)}</td>
                    <td>
                      <button type="button" className="link" onClick={() => remove(f.path)} aria-label={`Bỏ ${f.path}`}>
                        Bỏ
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {skipped.length > 0 && (
        <details className="skipped">
          <summary>Đã bỏ qua {skipped.length} file/thư mục</summary>
          <ul>
            {skipped.slice(0, 50).map((s) => (
              <li key={s.path}>
                <code>{s.path}</code> — {s.reason}
              </li>
            ))}
            {skipped.length > 50 && <li>… và {skipped.length - 50} mục khác</li>}
          </ul>
        </details>
      )}

      {warnings.length > 0 && (
        <div className="callout warn">
          <ul>
            {warnings.map((w) => (
              <li key={w}>{w}</li>
            ))}
          </ul>
        </div>
      )}

      <ErrorBox error={submit.error} />
      <div className="button-row">
        <button type="button" onClick={() => submit.mutate()} disabled={!files.length || submit.isPending || reading}>
          {submit.isPending ? 'Đang nộp…' : 'Nộp bài'}
        </button>
      </div>
    </div>
  );
}

function GithubTab({ assignmentId, onSubmitted, onChange }: TabProps) {
  const [url, setUrl] = useState('');
  const submit = useMutation({
    mutationFn: () => studentApi.submitGithub(assignmentId, url.trim()),
    onSuccess: (s) => {
      setUrl('');
      onSubmitted(s);
    },
  });
  const send = (e: FormEvent) => {
    e.preventDefault();
    if (url.trim()) submit.mutate();
  };
  return (
    <form className="github-tab" onSubmit={send}>
      <Field
        label="Link repo GitHub"
        hint={
          <>
            Repo phải để public; có thể dán link thư mục dạng <code>https://github.com/&lt;tài-khoản&gt;/&lt;repo&gt;/tree/&lt;nhánh&gt;/&lt;thư-mục&gt;</code>; hệ
            thống ghi lại đúng commit lúc nộp.
          </>
        }
      >
        <input
          type="url"
          value={url}
          onChange={(e) => {
            setUrl(e.target.value);
            submit.reset();
            onChange();
          }}
          placeholder="https://github.com/tai-khoan/repo"
          maxLength={300}
          required
        />
      </Field>
      <ErrorBox error={submit.error} />
      <div className="button-row">
        <button type="submit" disabled={!url.trim() || submit.isPending}>
          {submit.isPending ? 'Đang tải từ GitHub…' : 'Nộp bằng link GitHub'}
        </button>
      </div>
    </form>
  );
}
