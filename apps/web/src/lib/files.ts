// Gom file học viên chọn / kéo thả để nộp bài thành danh sách { file, path } (đường dẫn tương đối, dùng "/").
// Chỉ là gợi ý phía trình duyệt — server luôn kiểm tra lại. Thuần, không đụng DOM, để test bằng vitest.

/** Một file sẽ được gửi lên, kèm đường dẫn tương đối (có thể gồm thư mục con). */
export type PickedFile<F extends { size: number } = File> = { file: F; path: string };
export type SkippedFile = { path: string; reason: string };

// Khớp với giới hạn của server (apps/server/src/uploads/collect.ts) — chỉ để cảnh báo sớm.
export const ALLOWED_EXTENSIONS = ['.js', '.cjs', '.mjs', '.json', '.md', '.txt'];
export const UPLOAD_LIMITS = { files: 50, fileBytes: 512 * 1024, requestBytes: 2 * 1024 * 1024 };

export const ARCHIVE_MESSAGE = 'Không nhận file nén — chọn cả thư mục hoặc nộp bằng link GitHub';

const ARCHIVE = /\.(zip|rar|7z|tar|gz|tgz)$/i;
const JUNK_NAMES = new Set(['.DS_Store', 'Thumbs.db', 'desktop.ini']);

/** Chuẩn hoá đường dẫn: "\" → "/", bỏ "/" và "./" ở đầu. */
export function normalizePath(raw: string): string {
  return raw.replace(/\\/g, '/').replace(/^\/+/, '').replace(/^(\.\/)+/, '');
}

export const isArchive = (path: string) => ARCHIVE.test(path);

/** Thư mục không nên duyệt khi kéo thả cả thư mục (rất nhiều file, server cũng không nhận). */
export const isSkippedDir = (name: string) => name === 'node_modules' || name.startsWith('.') || name === '__MACOSX';

/** Lý do bỏ qua một file khi nộp (null = giữ lại). */
export function skipReason(path: string): string | null {
  const parts = path.split('/');
  const name = parts[parts.length - 1] ?? '';
  if (parts[0] === '__MACOSX' || JUNK_NAMES.has(name)) return 'file rác của hệ điều hành';
  if (parts.includes('node_modules')) return 'thuộc node_modules';
  if (parts.some((p) => p.startsWith('.'))) return 'file/thư mục ẩn';
  const dot = name.lastIndexOf('.');
  const ext = dot > 0 ? name.slice(dot).toLowerCase() : '';
  if (!ALLOWED_EXTENSIONS.includes(ext)) return `chỉ nhận ${ALLOWED_EXTENSIONS.join(' ')}`;
  return null;
}

export type AddResult<F extends { size: number }> = { files: PickedFile<F>[]; skipped: SkippedFile[]; archiveError: string | null };

/**
 * Thêm file mới vào danh sách đang chọn: chuẩn hoá đường dẫn, bỏ file ẩn / node_modules / đuôi lạ,
 * từ chối file nén, trùng đường dẫn (không phân biệt hoa thường) thì file mới thay file cũ. Kết quả sắp theo đường dẫn.
 */
export function addFiles<F extends { size: number }>(current: PickedFile<F>[], incoming: PickedFile<F>[]): AddResult<F> {
  const byKey = new Map(current.map((f) => [f.path.toLowerCase(), f] as const));
  const skipped: SkippedFile[] = [];
  let archive = false;
  for (const item of incoming) {
    const path = normalizePath(item.path);
    if (!path) continue;
    if (isArchive(path)) {
      archive = true;
      continue;
    }
    const reason = skipReason(path);
    if (reason) {
      skipped.push({ path, reason });
      continue;
    }
    byKey.set(path.toLowerCase(), { file: item.file, path });
  }
  const files = [...byKey.values()].sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0));
  return { files, skipped, archiveError: archive ? ARCHIVE_MESSAGE : null };
}

/** Thư mục gốc chung duy nhất (mọi file nằm trong cùng một thư mục ở cấp đầu), không có thì null. */
export function commonRoot(paths: string[]): string | null {
  const first = paths[0]?.split('/')[0];
  if (!first || !paths.every((p) => p.includes('/') && p.split('/')[0] === first)) return null;
  return first;
}

/** Giống server: file chính phải có đúng tên, hoặc có sau khi bỏ một thư mục gốc chung. */
export function hasEntryFile(paths: string[], entryFile: string): boolean {
  if (paths.includes(entryFile)) return true;
  const root = commonRoot(paths);
  return root !== null && paths.some((p) => p.slice(root.length + 1) === entryFile);
}

export function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  const fmt = (v: number) => v.toFixed(1).replace('.', ',');
  if (n < 1024 * 1024) return `${fmt(n / 1024)} KB`;
  return `${fmt(n / 1024 / 1024)} MB`;
}

export const totalSize = (files: PickedFile<{ size: number }>[]) => files.reduce((s, f) => s + f.file.size, 0);

/** Cảnh báo trước khi gửi (không chặn — server quyết định). */
export function submissionWarnings(files: PickedFile<{ size: number }>[], entryFile: string): string[] {
  if (!files.length) return [];
  const warnings: string[] = [];
  if (!hasEntryFile(files.map((f) => f.path), entryFile)) {
    warnings.push(`Không thấy file chính "${entryFile}" (đúng tên, ở thư mục gốc của bài làm) — server sẽ từ chối bài nộp.`);
  }
  if (files.length > UPLOAD_LIMITS.files) warnings.push(`Có ${files.length} file, tối đa ${UPLOAD_LIMITS.files} file.`);
  for (const f of files) {
    if (f.file.size > UPLOAD_LIMITS.fileBytes) warnings.push(`File "${f.path}" quá lớn (${formatBytes(f.file.size)}, tối đa ${formatBytes(UPLOAD_LIMITS.fileBytes)}).`);
  }
  const total = totalSize(files);
  if (total > UPLOAD_LIMITS.requestBytes) warnings.push(`Tổng dung lượng ${formatBytes(total)} vượt ${formatBytes(UPLOAD_LIMITS.requestBytes)}.`);
  return warnings;
}

// --- Duyệt thư mục được kéo thả (File System Entry API: DataTransferItem.webkitGetAsEntry()) ---

/** Phần của FileSystemEntry mà ta dùng — viết thành interface để test bằng đối tượng giả. */
export interface EntryLike {
  readonly isFile: boolean;
  readonly isDirectory: boolean;
  readonly name: string;
  readonly fullPath: string;
}
export interface FileEntryLike<F> extends EntryLike {
  file(success: (file: F) => void, error?: (err: unknown) => void): void;
}
export interface DirEntryLike extends EntryLike {
  createReader(): { readEntries(success: (entries: EntryLike[]) => void, error?: (err: unknown) => void): void };
}

/**
 * Duyệt đệ quy các mục được thả vào: file → { file, path }, thư mục → đọc hết (readEntries trả từng đợt,
 * phải gọi lại tới khi rỗng). Bỏ qua node_modules và thư mục ẩn (ghi vào skipped) để không duyệt hàng nghìn file.
 */
export async function walkEntries<F extends { size: number }>(entries: EntryLike[]): Promise<{ files: PickedFile<F>[]; skipped: SkippedFile[] }> {
  const files: PickedFile<F>[] = [];
  const skipped: SkippedFile[] = [];
  const visit = async (entry: EntryLike): Promise<void> => {
    const path = normalizePath(entry.fullPath || entry.name);
    if (entry.isFile) {
      const file = await new Promise<F>((resolve, reject) => (entry as FileEntryLike<F>).file(resolve, reject));
      files.push({ file, path });
    } else if (entry.isDirectory) {
      if (isSkippedDir(entry.name)) {
        skipped.push({ path: `${path}/`, reason: entry.name === 'node_modules' ? 'thư mục node_modules' : 'thư mục ẩn' });
        return;
      }
      const reader = (entry as DirEntryLike).createReader();
      for (;;) {
        const batch = await new Promise<EntryLike[]>((resolve, reject) => reader.readEntries(resolve, reject));
        if (!batch.length) break;
        for (const child of batch) await visit(child);
      }
    }
  };
  for (const entry of entries) await visit(entry);
  return { files, skipped };
}
