import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

// File của đề nằm trong data/assignments/<slug>/: README.md (mô tả), rubric.md, tests.js.
// Prompt và runner đọc từ đây, nên CLI và web dùng chung một cách lưu.
export const assignmentDir = (dataDir: string, slug: string) => join(dataDir, 'assignments', slug);

export function writeAssignmentFiles(dataDir: string, slug: string, a: { description: string; rubric: string; tests: string }): void {
  const dir = assignmentDir(dataDir, slug);
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, 'README.md'), a.description);
  writeFileSync(join(dir, 'rubric.md'), a.rubric);
  writeFileSync(join(dir, 'tests.js'), a.tests);
}

export function readAssignmentTests(dataDir: string, slug: string): string {
  try {
    return readFileSync(join(assignmentDir(dataDir, slug), 'tests.js'), 'utf8');
  } catch {
    return '';
  }
}

// "Tính tổng mảng" → "tinh-tong-mang"; trùng (trong DB hoặc đã có thư mục) thì thêm -2, -3…
export function uniqueSlug(title: string, taken: (slug: string) => boolean, dataDir: string): string {
  const base =
    title
      .toLowerCase()
      .normalize('NFD')
      .replace(/\p{M}/gu, '')
      .replace(/đ/g, 'd')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 40)
      .replace(/-+$/, '') || 'bai-tap';
  const free = (s: string) => !taken(s) && !existsSync(assignmentDir(dataDir, s));
  if (free(base)) return base;
  for (let i = 2; ; i++) if (free(`${base}-${i}`)) return `${base}-${i}`;
}
