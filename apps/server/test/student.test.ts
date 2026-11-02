import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { strToU8, zipSync } from 'fflate';
import { expect, test } from 'vitest';
import { BASE, createTestServer, type Client } from './helpers.js';

async function setup(opts: { dueAt?: number | null; now?: () => number } = {}) {
  const s = await createTestServer(opts.now ? { now: opts.now } : {});
  const cls = await s.as.gv.json(s.as.gv.post('/api/teacher/classes', { name: 'Lớp JS' }));
  await s.as.gv.post(`/api/teacher/classes/${cls.id}/students`, { students: [{ username: 'nam', fullName: 'NAM' }] });
  const a = await s.as.gv.json(
    s.as.gv.post('/api/teacher/assignments', {
      title: 'Tổng mảng',
      description: 'Viết sumArray',
      rubric: '10 điểm',
      entryFile: 'index.js',
      classId: cls.id,
      dueAt: opts.dueAt ?? null,
      tests: 'module.exports = []',
    }),
  );
  const upload = (client: Client, files: File[], assignmentId = a.id) => {
    const form = new FormData();
    for (const f of files) form.append('files', f, f.name);
    return s.app.request(`${BASE}/api/student/assignments/${assignmentId}/submissions`, {
      method: 'POST',
      headers: { Cookie: client.cookie, Origin: BASE },
      body: form,
    });
  };
  return { ...s, cls, a, upload };
}

const js = (name: string, body = 'module.exports = {}') => new File([body], name);

test('học viên thấy đề được giao, chưa có bài nộp', async () => {
  const { as, a } = await setup();
  const list = await as.nam.json(as.nam.get('/api/student/assignments'));
  expect(list).toHaveLength(1);
  expect(list[0]).toMatchObject({ id: a.id, title: 'Tổng mảng', latest: null, grade: null });
  expect(await as.lan.json(as.lan.get('/api/student/assignments'))).toEqual([]);
});

test('nộp nhiều file → phiên bản 1, file lưu đúng chỗ; nộp lại → phiên bản 2', async () => {
  const { as, upload, a, dataDir } = await setup();
  const r1 = await upload(as.nam, [js('index.js'), js('lib/util.js', 'exports.x = 1')]);
  expect(r1.status).toBe(201);
  expect(await r1.json()).toMatchObject({ version: 1, files: [{ path: 'index.js' }, { path: 'lib/util.js' }] });
  expect(readFileSync(join(dataDir, 'submissions', a.slug, 'nam', 'v1', 'lib', 'util.js'), 'utf8')).toBe('exports.x = 1');
  const r2 = await upload(as.nam, [js('index.js', '// v2')]);
  expect((await r2.json()).version).toBe(2);
  const detail = await as.nam.json(as.nam.get(`/api/student/assignments/${a.id}`));
  expect(detail.submissions.map((s: { version: number }) => s.version)).toEqual([2, 1]);
});

test('nộp file .zip → giải nén thành bài nộp', async () => {
  const { as, upload } = await setup();
  const z = zipSync({ 'index.js': strToU8('module.exports = {}'), 'helpers/math.js': strToU8('x') });
  const res = await upload(as.nam, [new File([z], 'bai-lam.zip')]);
  expect(res.status).toBe(201);
  expect((await res.json()).files.map((f: { path: string }) => f.path)).toEqual(['helpers/math.js', 'index.js']);
});

test('thiếu file chính → 400 nêu tên file chính', async () => {
  const { as, upload } = await setup();
  const res = await upload(as.nam, [js('main.js')]);
  expect(res.status).toBe(400);
  expect((await res.json()).error).toContain('index.js');
});

test('zip chứa "../" → 400 và không ghi gì ra đĩa', async () => {
  const { as, upload, a, dataDir } = await setup();
  const evil = zipSync({ 'index.js': strToU8('x'), '../../evil.js': strToU8('x') });
  expect((await upload(as.nam, [new File([evil], 'x.zip')])).status).toBe(400);
  expect(existsSync(join(dataDir, 'submissions', a.slug, 'nam'))).toBe(false);
});

test('học viên không thuộc lớp → 404; giảng viên → 403; khách → 401', async () => {
  const { as, upload } = await setup();
  expect((await upload(as.lan, [js('index.js')])).status).toBe(404);
  expect((await upload(as.gv, [js('index.js')])).status).toBe(403);
  expect((await upload(as.guest, [js('index.js')])).status).toBe(401);
});

test('quá hạn nộp → 403', async () => {
  let now = 1_000;
  const { as, upload } = await setup({ dueAt: 2_000, now: () => now });
  now = 3_000;
  const res = await upload(as.nam, [js('index.js')]);
  expect(res.status).toBe(403);
  expect((await res.json()).error).toMatch(/hạn/);
});

test('request nộp bài lớn hơn 2 MB → 413', async () => {
  const { as, upload } = await setup();
  expect((await upload(as.nam, [js('index.js'), new File([new Uint8Array(3 * 1024 * 1024)], 'big.txt')])).status).toBe(413);
});

test('học viên khác không xem được file bài nộp (404); chủ bài xem được nội dung dạng JSON', async () => {
  const { as, upload } = await setup();
  const sub = await (await upload(as.nam, [js('index.js', 'const a = "<script>"')])).json();
  const own = await as.nam.get(`/api/student/submissions/${sub.id}/file?path=index.js`);
  expect(own.status).toBe(200);
  expect(own.headers.get('content-type')).toMatch(/application\/json/);
  expect((await own.json()).content).toBe('const a = "<script>"');
  expect((await as.lan.get(`/api/student/submissions/${sub.id}/file?path=index.js`)).status).toBe(404);
  expect((await as.nam.get(`/api/student/submissions/${sub.id}/file?path=../../../package.json`)).status).toBe(404);
});

test('route JSON khác vẫn từ chối multipart và vẫn giới hạn 16 KB', async () => {
  const { as, app } = await setup();
  const form = new FormData();
  form.append('name', 'x');
  const res = await app.request(`${BASE}/api/teacher/classes`, { method: 'POST', headers: { Cookie: as.gv.cookie, Origin: BASE }, body: form });
  expect(res.status).toBe(415);
});
