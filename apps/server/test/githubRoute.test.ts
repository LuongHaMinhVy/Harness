import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { strToU8, zipSync } from 'fflate';
import { expect, test } from 'vitest';
import { createTestServer } from './helpers.js';

const SHA = 'b'.repeat(40);

function fakeGithub(files: Record<string, string>) {
  const archive = zipSync(Object.fromEntries(Object.entries(files).map(([k, v]) => [`bai-tap-${SHA.slice(0, 7)}/${k}`, strToU8(v)])));
  return (async (url: string) => {
    if (url === 'https://api.github.com/repos/nam/bai-tap') return Response.json({ private: false, size: 5, default_branch: 'main' });
    if (url === 'https://api.github.com/repos/nam/bai-tap/commits/main') return Response.json({ sha: SHA });
    if (url === `https://codeload.github.com/nam/bai-tap/zip/${SHA}`) return new Response(new Blob([archive as Uint8Array<ArrayBuffer>]));
    return new Response('', { status: 404 });
  }) as unknown as typeof fetch;
}

async function setup(files: Record<string, string>) {
  const s = await createTestServer({ github: { fetch: fakeGithub(files) } });
  const cls = await s.as.gv.json(s.as.gv.post('/api/teacher/classes', { name: 'Lớp JS' }));
  await s.as.gv.post(`/api/teacher/classes/${cls.id}/students`, { students: [{ username: 'nam', fullName: 'NAM' }] });
  const a = await s.as.gv.json(
    s.as.gv.post('/api/teacher/assignments', {
      title: 'Tổng mảng',
      description: 'x',
      rubric: 'x',
      entryFile: 'index.js',
      classId: cls.id,
      dueAt: null,
      tests: 'module.exports = []',
    }),
  );
  return { ...s, a };
}

test('nộp bằng link GitHub → bài nộp ghi nguồn github, link và commit được ghim; file lưu như upload', async () => {
  const { as, a, dataDir } = await setup({ 'index.js': 'module.exports = 1', 'lib/x.js': 'x', '.gitignore': 'node_modules' });
  const res = await as.nam.post(`/api/student/assignments/${a.id}/submissions/github`, { url: 'https://github.com/nam/bai-tap' });
  expect(res.status).toBe(201);
  const sub = await res.json();
  expect(sub).toMatchObject({ version: 1, source: 'github', githubUrl: 'https://github.com/nam/bai-tap', commit: SHA });
  expect(sub.files.map((f: { path: string }) => f.path)).toEqual(['index.js', 'lib/x.js']);
  expect(readFileSync(join(dataDir, 'submissions', a.slug, 'nam', 'v1', 'index.js'), 'utf8')).toBe('module.exports = 1');
});

test('repo thiếu file chính → 400; link không phải GitHub → 400', async () => {
  const { as, a } = await setup({ 'main.js': 'x' });
  const missing = await as.nam.post(`/api/student/assignments/${a.id}/submissions/github`, { url: 'https://github.com/nam/bai-tap' });
  expect(missing.status).toBe(400);
  expect((await missing.json()).error).toContain('index.js');
  expect((await as.nam.post(`/api/student/assignments/${a.id}/submissions/github`, { url: 'http://127.0.0.1:22/x/y' })).status).toBe(400);
});

test('học viên không thuộc lớp → 404', async () => {
  const { as, a } = await setup({ 'index.js': 'x' });
  expect((await as.lan.post(`/api/student/assignments/${a.id}/submissions/github`, { url: 'https://github.com/nam/bai-tap' })).status).toBe(404);
});
