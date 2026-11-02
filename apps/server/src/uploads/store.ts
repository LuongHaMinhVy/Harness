import { randomBytes } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, renameSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join, relative, resolve, isAbsolute } from 'node:path';
import type { SubmittedFile } from '@harness/shared/api';
import { checkPath, type UploadedFile } from './collect.js';

// Bài nộp lưu ở data/submissions/<slug>/<username>/v<n>/…; thư mục do server đặt, không dùng tên người nộp gửi lên.
export const submissionDir = (dataDir: string, slug: string, username: string, version: number) =>
  join(dataDir, 'submissions', slug, username.toLowerCase(), `v${version}`);

const inside = (base: string, target: string) => {
  const rel = relative(base, target);
  return rel !== '' && !rel.startsWith('..') && !isAbsolute(rel);
};

// Ghi vào thư mục tạm rồi đổi tên: hoặc có đủ cả bài, hoặc không có gì (không để lại bài nộp dở dang).
export function saveSubmissionFiles(dir: string, files: UploadedFile[]): SubmittedFile[] {
  if (existsSync(dir)) throw new Error(`Thư mục bài nộp đã tồn tại: ${dir}`);
  const tmp = `${dir}.tmp-${randomBytes(4).toString('hex')}`;
  const base = resolve(tmp);
  try {
    for (const f of files) {
      const target = resolve(base, checkPath(f.path));
      if (!inside(base, target)) throw new Error(`Đường dẫn thoát khỏi thư mục bài nộp: ${f.path}`);
      mkdirSync(dirname(target), { recursive: true });
      writeFileSync(target, f.data);
    }
    mkdirSync(dirname(dir), { recursive: true });
    renameSync(tmp, dir);
  } catch (err) {
    rmSync(tmp, { recursive: true, force: true });
    throw err;
  }
  return files.map((f) => ({ path: f.path, size: f.data.length })).sort((a, b) => a.path.localeCompare(b.path));
}

// Đọc một file trong bài nộp; đường dẫn lạ / thoát ra ngoài / không tồn tại → null.
export function readSubmissionFile(dir: string, path: string): string | null {
  let clean: string;
  try {
    clean = checkPath(path);
  } catch {
    return null;
  }
  const base = resolve(dir);
  const target = resolve(base, clean);
  if (!inside(base, target) || !existsSync(target) || !statSync(target).isFile()) return null;
  return readFileSync(target, 'utf8');
}
