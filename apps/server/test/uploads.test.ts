import { strToU8, zipSync } from 'fflate';
import { expect, test } from 'vitest';
import { checkPath, collectFiles, extractZip, LIMITS, stripCommonRoot, UploadError } from '../src/uploads/collect.js';

const zip = (entries: Record<string, string | Uint8Array>) =>
  zipSync(Object.fromEntries(Object.entries(entries).map(([k, v]) => [k, typeof v === 'string' ? strToU8(v) : v])));

const errorOf = (fn: () => unknown) => {
  try {
    fn();
  } catch (e) {
    if (e instanceof UploadError) return e.message;
    throw e;
  }
  return null;
};

// --- đường dẫn ---

test('checkPath từ chối thư mục/file kết thúc bằng dấu chấm hoặc khoảng trắng (Windows bỏ đi → trùng file khác)', () => {
  for (const bad of ['src./a.js', 'src /a.js', 'a.js.', 'a.js ', 'lib/x ./b.js']) expect(() => checkPath(bad), bad).toThrow(UploadError);
});

test('checkPath chuẩn hoá \\ thành /, bỏ ./ đầu', () => {
  expect(checkPath('src\\lib\\util.js')).toBe('src/lib/util.js');
  expect(checkPath('./index.js')).toBe('index.js');
});

test('checkPath từ chối "..", đường dẫn tuyệt đối, ổ đĩa, file ẩn, đuôi lạ', () => {
  for (const bad of ['../evil.js', 'a/../../b.js', '/etc/passwd.js', 'C:/win.js', 'c:\\x.js', '.env', 'a/.hidden.js', 'virus.exe', 'x.html', 'a//b.js', '']) {
    expect(errorOf(() => checkPath(bad)), bad).not.toBeNull();
  }
});

// --- zip ---

test('giải nén zip bình thường, giữ thư mục con, bỏ __MACOSX và .DS_Store', () => {
  const files = extractZip(zip({ 'index.js': 'module.exports={}', 'lib/util.js': 'x', '__MACOSX/._index.js': 'rac', 'lib/.DS_Store': 'rac' }));
  expect(files.map((f) => f.path).sort()).toEqual(['index.js', 'lib/util.js']);
});

test('zip chứa "../" → từ chối, không trả file nào', () => {
  expect(errorOf(() => extractZip(zip({ 'index.js': 'ok', '../thoat-ra.js': 'x' })))).toMatch(/không hợp lệ/);
});

test('zip quá nhiều mục → từ chối', () => {
  const many = Object.fromEntries(Array.from({ length: LIMITS.zipEntries + 1 }, (_, i) => [`f${i}.js`, 'x']));
  expect(errorOf(() => extractZip(zip(many)))).toMatch(/quá nhiều/);
});

test('zip nén quá mức (giải nén vượt giới hạn) → từ chối dù file nén rất nhỏ', () => {
  const bomb = zip({ 'index.js': new Uint8Array(LIMITS.zipTotalBytes + 1024) });
  expect(bomb.length).toBeLessThan(64 * 1024);
  expect(errorOf(() => extractZip(bomb))).toMatch(/quá lớn/);
});

test('một file trong zip vượt giới hạn mỗi file → từ chối', () => {
  expect(errorOf(() => extractZip(zip({ 'big.js': new Uint8Array(LIMITS.fileBytes + 1) })))).toMatch(/quá lớn/);
});

test('dữ liệu không phải zip → từ chối với thông báo rõ', () => {
  expect(errorOf(() => extractZip(strToU8('khong phai zip')))).toMatch(/zip/i);
});

// --- gom file từ form ---

test('nhiều file thường → giữ nguyên đường dẫn; file .zip → từ chối kèm hướng dẫn', async () => {
  const plain = await collectFiles([new File(['a'], 'index.js'), new File(['b'], 'lib/util.js')]);
  expect(plain.map((f) => f.path)).toEqual(['index.js', 'lib/util.js']);
  await expect(collectFiles([new File([zip({ 'index.js': 'a' })], 'bai-lam.zip')])).rejects.toThrow(/GitHub/);
});

test('file rác của hệ điều hành (.DS_Store, Thumbs.db) bị bỏ qua thay vì báo file ẩn', async () => {
  const files = await collectFiles([new File(['a'], 'bai/index.js'), new File(['r'], 'bai/.DS_Store'), new File(['r'], 'bai/Thumbs.db')]);
  expect(files.map((f) => f.path)).toEqual(['bai/index.js']);
});

test('stripCommonRoot bỏ thư mục gốc chung khi mọi file nằm trong cùng một thư mục', () => {
  const f = (path: string) => ({ path, data: new Uint8Array() });
  expect(stripCommonRoot([f('repo-abc/index.js'), f('repo-abc/lib/a.js')]).map((x) => x.path)).toEqual(['index.js', 'lib/a.js']);
  expect(stripCommonRoot([f('index.js'), f('lib/a.js')]).map((x) => x.path)).toEqual(['index.js', 'lib/a.js']);
  expect(stripCommonRoot([f('only/one.js')]).map((x) => x.path)).toEqual(['one.js']);
});

test('extractZip chế độ skipInvalid (archive GitHub): bỏ qua file ẩn, ảnh, node_modules, "../"; vẫn giới hạn dung lượng', () => {
  const files = extractZip(
    zip({ 'r/index.js': 'a', 'r/.gitignore': 'x', 'r/logo.png': 'x', 'r/node_modules/x/i.js': 'x', '../evil.js': 'x', 'r/README.md': 'doc' }),
    { skipInvalid: true },
  );
  expect(files.map((f) => f.path).sort()).toEqual(['r/README.md', 'r/index.js']);
  const bomb = zip({ 'r/index.js': new Uint8Array(LIMITS.zipTotalBytes + 1024) });
  expect(errorOf(() => extractZip(bomb, { skipInvalid: true }))).toMatch(/quá lớn/);
});

test('trùng đường dẫn, quá nhiều file, file rỗng danh sách → từ chối', async () => {
  await expect(collectFiles([new File(['a'], 'index.js'), new File(['b'], 'index.js')])).rejects.toThrow(/trùng/);
  await expect(collectFiles(Array.from({ length: LIMITS.files + 1 }, (_, i) => new File(['x'], `f${i}.js`)))).rejects.toThrow(/quá nhiều/);
  await expect(collectFiles([])).rejects.toThrow(/chưa chọn/i);
});
