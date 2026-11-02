import { describe, expect, test } from 'vitest';
import {
  addFiles,
  ARCHIVE_MESSAGE,
  commonRoot,
  formatBytes,
  hasEntryFile,
  normalizePath,
  skipReason,
  submissionWarnings,
  walkEntries,
  type EntryLike,
  type PickedFile,
} from '../src/lib/files.js';

type Fake = { size: number; label: string };
const f = (path: string, size = 10): PickedFile<Fake> => ({ file: { size, label: path }, path });

describe('normalizePath', () => {
  test('đổi \\ thành / và bỏ / hoặc ./ ở đầu', () => {
    expect(normalizePath('\\bai\\index.js')).toBe('bai/index.js');
    expect(normalizePath('/bai/index.js')).toBe('bai/index.js');
    expect(normalizePath('./index.js')).toBe('index.js');
  });
});

describe('skipReason', () => {
  test('giữ file .js/.json/.md', () => {
    expect(skipReason('index.js')).toBeNull();
    expect(skipReason('src/lib/util.mjs')).toBeNull();
    expect(skipReason('package.json')).toBeNull();
  });
  test('bỏ file ẩn, node_modules, file rác, đuôi lạ', () => {
    expect(skipReason('.git/config')).toMatch(/ẩn/);
    expect(skipReason('bai/.eslintrc.json')).toMatch(/ẩn/);
    expect(skipReason('bai/node_modules/x/index.js')).toMatch(/node_modules/);
    expect(skipReason('bai/.DS_Store')).toMatch(/rác/);
    expect(skipReason('__MACOSX/index.js')).toMatch(/rác/);
    expect(skipReason('logo.png')).toMatch(/chỉ nhận/);
    expect(skipReason('Makefile')).toMatch(/chỉ nhận/);
  });
});

describe('addFiles', () => {
  test('chuẩn hoá, sắp xếp và bỏ file không hợp lệ', () => {
    const r = addFiles([], [f('bai/index.js'), f('bai/.git/HEAD'), f('bai/README.md'), f('bai/logo.png')]);
    expect(r.files.map((x) => x.path)).toEqual(['bai/README.md', 'bai/index.js']);
    expect(r.skipped.map((s) => s.path)).toEqual(['bai/.git/HEAD', 'bai/logo.png']);
    expect(r.archiveError).toBeNull();
  });
  test('trùng đường dẫn (không phân biệt hoa thường) thì file mới thay file cũ', () => {
    const first = addFiles([], [f('index.js', 1)]);
    const second = addFiles(first.files, [f('INDEX.js', 2)]);
    expect(second.files).toHaveLength(1);
    expect(second.files[0]!.file.size).toBe(2);
  });
  test('từ chối file nén', () => {
    const r = addFiles([], [f('bai.zip'), f('index.js')]);
    expect(r.archiveError).toBe(ARCHIVE_MESSAGE);
    expect(r.files.map((x) => x.path)).toEqual(['index.js']);
  });
});

describe('commonRoot / hasEntryFile', () => {
  test('một thư mục gốc chung', () => {
    expect(commonRoot(['bai/index.js', 'bai/lib/a.js'])).toBe('bai');
    expect(commonRoot(['bai/index.js', 'khac/a.js'])).toBeNull();
    expect(commonRoot(['index.js', 'lib/a.js'])).toBeNull();
    expect(commonRoot([])).toBeNull();
  });
  test('file chính đúng tên, hoặc có sau khi bỏ thư mục gốc chung', () => {
    expect(hasEntryFile(['index.js', 'lib/a.js'], 'index.js')).toBe(true);
    expect(hasEntryFile(['bai/index.js', 'bai/lib/a.js'], 'index.js')).toBe(true);
    expect(hasEntryFile(['bai/src/main.js'], 'src/main.js')).toBe(true);
    expect(hasEntryFile(['bai/lib/index.js', 'bai/a.js'], 'index.js')).toBe(false);
    expect(hasEntryFile(['a/b/index.js'], 'index.js')).toBe(false);
  });
});

describe('submissionWarnings', () => {
  test('không cảnh báo khi chưa chọn file', () => {
    expect(submissionWarnings([], 'index.js')).toEqual([]);
  });
  test('thiếu file chính, file quá lớn, quá nhiều file', () => {
    const many = Array.from({ length: 51 }, (_, i) => f(`f${i}.js`));
    const w = submissionWarnings([...many, f('big.js', 600 * 1024)], 'index.js');
    expect(w.some((x) => x.includes('"index.js"'))).toBe(true);
    expect(w.some((x) => x.includes('tối đa 50'))).toBe(true);
    expect(w.some((x) => x.includes('big.js'))).toBe(true);
  });
  test('hợp lệ thì không cảnh báo', () => {
    expect(submissionWarnings([f('bai/index.js')], 'index.js')).toEqual([]);
  });
});

test('formatBytes', () => {
  expect(formatBytes(512)).toBe('512 B');
  expect(formatBytes(1536)).toBe('1,5 KB');
  expect(formatBytes(2 * 1024 * 1024)).toBe('2,0 MB');
});

describe('walkEntries', () => {
  const file = (fullPath: string): EntryLike & { file: (ok: (x: Fake) => void) => void } => ({
    isFile: true,
    isDirectory: false,
    name: fullPath.split('/').pop()!,
    fullPath,
    file: (ok) => ok({ size: 1, label: fullPath }),
  });
  // readEntries trả từng đợt (tối đa `batch` mục), rồi mảng rỗng khi hết — giống trình duyệt.
  const dir = (fullPath: string, children: EntryLike[], batch = 2) => ({
    isFile: false,
    isDirectory: true,
    name: fullPath.split('/').pop()!,
    fullPath,
    createReader: () => {
      let i = 0;
      return {
        readEntries: (ok: (e: EntryLike[]) => void) => {
          const part = children.slice(i, i + batch);
          i += batch;
          ok(part);
        },
      };
    },
  });

  test('duyệt đệ quy, đọc hết các đợt, bỏ node_modules và thư mục ẩn', async () => {
    const tree = dir('/bai', [
      file('/bai/index.js'),
      file('/bai/a.js'),
      file('/bai/b.js'),
      dir('/bai/lib', [file('/bai/lib/util.js')]),
      dir('/bai/node_modules', [file('/bai/node_modules/x.js')]),
      dir('/bai/.git', [file('/bai/.git/HEAD')]),
    ]);
    const { files, skipped } = await walkEntries<Fake>([tree, file('/README.md')]);
    expect(files.map((x) => x.path).sort()).toEqual(['README.md', 'bai/a.js', 'bai/b.js', 'bai/index.js', 'bai/lib/util.js']);
    expect(skipped.map((s) => s.path)).toEqual(['bai/node_modules/', 'bai/.git/']);
  });
});
