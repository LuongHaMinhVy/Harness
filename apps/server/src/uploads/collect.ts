import { Unzip, UnzipInflate, UnzipPassThrough } from 'fflate';

// Giới hạn upload bài nộp (xem spec mục 5.6).
export const LIMITS = {
  requestBytes: 2 * 1024 * 1024,
  fileBytes: 512 * 1024,
  files: 50,
  zipTotalBytes: 5 * 1024 * 1024,
  zipEntries: 200,
  pathLength: 200,
};

export const ALLOWED_EXTENSIONS = ['.js', '.cjs', '.mjs', '.json', '.md', '.txt'];

export class UploadError extends Error {}

export type UploadedFile = { path: string; data: Uint8Array };

// Rác do hệ điều hành tạo khi nén — bỏ qua im lặng thay vì báo lỗi.
const isJunk = (path: string) => path.startsWith('__MACOSX/') || path.split('/').pop() === '.DS_Store' || path.split('/').pop() === 'Thumbs.db';

// Chuẩn hoá và kiểm tra đường dẫn do người nộp gửi: chỉ cho đường dẫn tương đối, không "..", không file ẩn,
// không ổ đĩa, chỉ các đuôi cho phép. Trả về đường dẫn dùng "/".
export function checkPath(raw: string): string {
  const path = raw.replace(/\\/g, '/').replace(/^(\.\/)+/, '');
  const bad = (why: string) => new UploadError(`Tên file "${raw}" không hợp lệ: ${why}`);
  if (!path || path.length > LIMITS.pathLength) throw bad('trống hoặc quá dài');
  if (path.startsWith('/') || /^[a-zA-Z]:/.test(path)) throw bad('không được là đường dẫn tuyệt đối');
  // eslint-disable-next-line no-control-regex
  if (/[\u0000-\u001f<>:"|?*]/.test(path)) throw bad('chứa ký tự không cho phép');
  const parts = path.split('/');
  if (parts.some((p) => p === '' || p === '.' || p === '..')) throw bad('không được chứa "..", "." hoặc "//"');
  if (parts.some((p) => p.startsWith('.'))) throw bad('không nhận file/thư mục ẩn');
  const ext = path.slice(path.lastIndexOf('.')).toLowerCase();
  if (!path.includes('.') || !ALLOWED_EXTENSIONS.includes(ext)) throw bad(`chỉ nhận ${ALLOWED_EXTENSIONS.join(' ')}`);
  return path;
}

// Giải nén .zip (dùng cho archive tải từ GitHub) có đếm byte THẬT trong lúc giải nén (header zip có thể khai man
// kích thước), dừng ngay khi vượt giới hạn — chặn zip nén quá mức. Không bao giờ tạo symlink: mọi mục đều là dữ liệu thường.
// skipInvalid: bỏ qua (không giải nén) file ẩn, đuôi lạ, node_modules, đường dẫn "../" thay vì báo lỗi — repo thật
// thường có .gitignore, ảnh…; mục bị bỏ qua không được giải nén nên không tốn dung lượng.
export function extractZip(data: Uint8Array, opts: { skipInvalid?: boolean } = {}): UploadedFile[] {
  const files: UploadedFile[] = [];
  let entries = 0;
  let total = 0;
  let failure: UploadError | null = null;

  const unzip = new Unzip();
  unzip.register(UnzipInflate);
  unzip.register(UnzipPassThrough);
  unzip.onfile = (file) => {
    if (failure) return;
    if (file.name.endsWith('/')) return; // thư mục
    const name = file.name.replace(/\\/g, '/');
    if (isJunk(name)) return;
    if (opts.skipInvalid && name.split('/').includes('node_modules')) return;
    let path: string;
    try {
      path = checkPath(name);
    } catch (e) {
      if (!opts.skipInvalid) failure = e as UploadError;
      return;
    }
    if (++entries > LIMITS.zipEntries) {
      failure = new UploadError(`Bài nộp có quá nhiều file (tối đa ${LIMITS.zipEntries})`);
      return;
    }
    const chunks: Uint8Array[] = [];
    let size = 0;
    file.ondata = (err, chunk, final) => {
      if (failure) return;
      if (err) {
        failure = new UploadError('File zip bị hỏng');
        return;
      }
      size += chunk.length;
      total += chunk.length;
      if (size > LIMITS.fileBytes || total > LIMITS.zipTotalBytes) {
        failure = new UploadError(
          size > LIMITS.fileBytes ? `File "${path}" quá lớn (tối đa ${LIMITS.fileBytes / 1024} KB)` : `Nội dung zip quá lớn (tối đa ${LIMITS.zipTotalBytes / 1024 / 1024} MB)`,
        );
        file.terminate();
        return;
      }
      chunks.push(chunk);
      if (final) files.push({ path, data: concat(chunks, size) });
    };
    file.start();
  };

  try {
    unzip.push(data, true);
  } catch {
    if (!failure) failure = new UploadError('Không đọc được file zip (file hỏng hoặc không phải zip)');
  }
  if (failure) throw failure;
  if (!files.length && !looksLikeZip(data)) throw new UploadError('Không đọc được file zip (file hỏng hoặc không phải zip)');
  return files;
}

const looksLikeZip = (d: Uint8Array) => d.length >= 4 && d[0] === 0x50 && d[1] === 0x4b;

function concat(chunks: Uint8Array[], size: number): Uint8Array {
  const out = new Uint8Array(size);
  let off = 0;
  for (const c of chunks) {
    out.set(c, off);
    off += c.length;
  }
  return out;
}

// Mọi file cùng nằm trong một thư mục gốc (chọn cả thư mục khi nộp, archive GitHub "<repo>-<sha>/") → bỏ thư mục đó.
export function stripCommonRoot(files: UploadedFile[]): UploadedFile[] {
  const first = files[0]?.path.split('/')[0];
  if (!first || !files.every((f) => f.path.includes('/') && f.path.split('/')[0] === first)) return files;
  return files.map((f) => ({ ...f, path: f.path.slice(first.length + 1) }));
}

// Gom file từ form nộp bài (từng file hoặc cả thư mục; tên có thể chứa thư mục con). Không nhận .zip:
// nộp cả thư mục giữ được cấu trúc mà server không phải giải nén.
export async function collectFiles(input: File[]): Promise<UploadedFile[]> {
  if (!input.length) throw new UploadError('Chưa chọn file nào để nộp');
  if (input.some((f) => /\.(zip|rar|7z|tar|gz|tgz)$/i.test(f.name))) {
    throw new UploadError('Không nhận file nén — hãy chọn cả thư mục bài làm hoặc nộp bằng link GitHub');
  }
  if (input.length > LIMITS.files) throw new UploadError(`Nộp quá nhiều file (tối đa ${LIMITS.files})`);
  const files: UploadedFile[] = [];
  for (const f of input) {
    if (isJunk(f.name.replace(/\\/g, '/'))) continue;
    const path = checkPath(f.name);
    if (f.size > LIMITS.fileBytes) throw new UploadError(`File "${path}" quá lớn (tối đa ${LIMITS.fileBytes / 1024} KB)`);
    files.push({ path, data: new Uint8Array(await f.arrayBuffer()) });
  }
  return checkFileSet(files);
}

// Kiểm tra chung cho mọi nguồn bài nộp (upload, GitHub): số file, trùng tên, không rỗng.
export function checkFileSet(files: UploadedFile[]): UploadedFile[] {
  if (files.length > LIMITS.files) throw new UploadError(`Nộp quá nhiều file (tối đa ${LIMITS.files})`);
  const seen = new Set<string>();
  for (const f of files) {
    const key = f.path.toLowerCase();
    if (seen.has(key)) throw new UploadError(`File "${f.path}" bị trùng`);
    seen.add(key);
  }
  if (!files.length) throw new UploadError('Không có file hợp lệ nào để nộp');
  return files;
}
