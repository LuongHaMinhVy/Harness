// Danh sách file đã nộp (dạng cây) + xem nội dung một file. Nội dung luôn hiển thị dạng chữ trong <pre>.
import type { FileContent, SubmittedFile } from '@harness/shared/api';
import { useQuery } from '@tanstack/react-query';
import { useMemo, useState } from 'react';
import { buildFileTree } from '../lib/fileTree.js';
import { commonRoot, formatBytes } from '../lib/files.js';
import { ErrorBox, Loading } from './ui.js';

type Props = {
  files: SubmittedFile[];
  entryFile?: string;
  queryKey: (path: string) => readonly unknown[];
  fetchFile: (path: string) => Promise<FileContent>;
};

function pickInitial(files: SubmittedFile[], entryFile?: string): string | null {
  const paths = files.map((f) => f.path);
  if (entryFile) {
    if (paths.includes(entryFile)) return entryFile;
    const root = commonRoot(paths);
    if (root && paths.includes(`${root}/${entryFile}`)) return `${root}/${entryFile}`;
  }
  return paths[0] ?? null;
}

export function FileViewer({ files, entryFile, queryKey, fetchFile }: Props) {
  const [selected, setSelected] = useState<string | null>(() => pickInitial(files, entryFile));
  const rows = useMemo(() => buildFileTree(files.map((f) => f.path)), [files]);
  const sizes = useMemo(() => new Map(files.map((f) => [f.path, f.size])), [files]);
  const current = selected && sizes.has(selected) ? selected : pickInitial(files, entryFile);

  const content = useQuery({
    queryKey: queryKey(current ?? ''),
    queryFn: () => fetchFile(current!),
    enabled: current !== null,
    staleTime: Infinity, // bài nộp không đổi sau khi nộp
  });

  if (!files.length) return <p className="empty">Bài nộp không có file nào.</p>;
  const lines = content.data?.content.split('\n') ?? [];

  return (
    <div className="file-viewer">
      <ul className="file-tree" aria-label="Danh sách file">
        {rows.map((r) => (
          <li key={`${r.kind}:${r.path}`} className={`tree-row depth-${Math.min(r.depth, 6)}`}>
            {r.kind === 'dir' ? (
              <span className="tree-dir">📁 {r.name}/</span>
            ) : (
              <button
                type="button"
                className={r.path === current ? 'tree-file active' : 'tree-file'}
                onClick={() => setSelected(r.path)}
                aria-current={r.path === current ? 'true' : undefined}
              >
                <span className="tree-name">📄 {r.name}</span>
                <span className="tree-size">{formatBytes(sizes.get(r.path) ?? 0)}</span>
              </button>
            )}
          </li>
        ))}
      </ul>
      <div className="code-pane">
        <div className="code-title">{current}</div>
        {content.isPending && <Loading />}
        <ErrorBox error={content.error} />
        {content.data && (
          <pre className="code" aria-label={`Nội dung ${current}`}>
            {lines.map((line, i) => (
              <span key={i} className="code-line">
                {line}
                {'\n'}
              </span>
            ))}
          </pre>
        )}
      </div>
    </div>
  );
}
