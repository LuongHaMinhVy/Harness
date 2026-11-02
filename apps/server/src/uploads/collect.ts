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

// Giải nén .zip có đếm byte THẬT trong lúc giải nén (header zip có thể khai man kích thước),
// dừng ngay khi vượt giới hạn — chặn zip nén quá mức. Không bao giờ tạo symlink: mọi mục đều là dữ liệu thường.
export function extractZip(data: Uint8Array): UploadedFile[] {
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
    if (++entries > LIMITS.zipEntries) {
      failure = new UploadError(`File zip có quá nhiều mục (tối đa ${LIMITS.zipEntries})`);
      return;
    }
    let path: string;
    try {
      path = checkPath(name);
    } catch (e) {
      failure = e as UploadError;
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

// Gom file từ form nộp bài: một file .zip duy nhất → giải nén; còn lại → từng file (tên có thể chứa thư mục con).
export async function collectFiles(input: File[]): Promise<UploadedFile[]> {
  if (!input.length) throw new UploadError('Chưa chọn file nào để nộp');
  let files: UploadedFile[];
  if (input.length === 1 && input[0].name.toLowerCase().endsWith('.zip')) {
    files = extractZip(new Uint8Array(await input[0].arrayBuffer()));
  } else {
    if (input.length > LIMITS.files) throw new UploadError(`Nộp quá nhiều file (tối đa ${LIMITS.files})`);
    files = [];
    for (const f of input) {
      const path = checkPath(f.name);
      if (isJunk(path)) continue;
      if (f.size > LIMITS.fileBytes) throw new UploadError(`File "${path}" quá lớn (tối đa ${LIMITS.fileBytes / 1024} KB)`);
      files.push({ path, data: new Uint8Array(await f.arrayBuffer()) });
    }
  }
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
