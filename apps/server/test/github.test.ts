import { strToU8, zipSync } from 'fflate';
import { expect, test } from 'vitest';
import { UploadError } from '../src/uploads/collect.js';
import { fetchGithubSubmission, parseGithubUrl } from '../src/uploads/github.js';

const SHA = 'a'.repeat(40);
const ROOT = `bai-tap-${SHA.slice(0, 7)}`;

test('parseGithubUrl chỉ nhận https://github.com/<owner>/<repo>[.git][/tree/<nhánh>[/<thư mục>]]', () => {
  expect(parseGithubUrl('https://github.com/nam/bai-tap')).toEqual({ owner: 'nam', repo: 'bai-tap', ref: null, subdir: null });
  expect(parseGithubUrl('https://github.com/nam/bai-tap.git')).toMatchObject({ repo: 'bai-tap' });
  expect(parseGithubUrl('https://github.com/nam/bai-tap/tree/main/tuan-2')).toEqual({ owner: 'nam', repo: 'bai-tap', ref: 'main', subdir: 'tuan-2' });
  for (const bad of [
    'http://github.com/nam/x',
    'https://gitlab.com/nam/x',
    'https://github.com.evil.com/nam/x',
    'https://evil.com/github.com/nam/x',
    'https://github.com/nam',
    'https://github.com/../x/y',
    'https://user:pass@github.com/nam/x',
    'https://github.com/nam/x/tree/main/../../etc',
    'git@github.com:nam/x.git',
  ]) {
    expect(() => parseGithubUrl(bad), bad).toThrow(UploadError);
  }
});

type Call = { url: string; init?: RequestInit };

function fakeFetch(opts: { size?: number; status?: number; archive?: Uint8Array } = {}) {
  const calls: Call[] = [];
  const archive = opts.archive ?? zipSync({ [`${ROOT}/index.js`]: strToU8('module.exports={}'), [`${ROOT}/.github/x.yml`]: strToU8('x') });
  const fn = async (url: string, init?: RequestInit) => {
    calls.push({ url, init });
    if (url === 'https://api.github.com/repos/nam/bai-tap') {
      return opts.status ? new Response('{}', { status: opts.status }) : Response.json({ private: false, size: opts.size ?? 10, default_branch: 'main' });
    }
    if (url.startsWith('https://api.github.com/repos/nam/bai-tap/commits/')) return Response.json({ sha: SHA });
    if (url === `https://codeload.github.com/nam/bai-tap/zip/${SHA}`) return new Response(new Blob([archive as Uint8Array<ArrayBuffer>]));
    return new Response('not found', { status: 404 });
  };
  return { fn: fn as unknown as typeof fetch, calls };
}

test('tải đúng commit được ghim, bỏ thư mục gốc của archive, bỏ file ẩn; chỉ gọi host của GitHub, không theo redirect', async () => {
  const f = fakeFetch();
  const r = await fetchGithubSubmission('https://github.com/nam/bai-tap', { fetch: f.fn });
  expect(r.commit).toBe(SHA);
  expect(r.files.map((x) => x.path)).toEqual(['index.js']);
  expect(f.calls.every((c) => /^https:\/\/(api|codeload)\.github\.com\//.test(c.url))).toBe(true);
  expect(f.calls.every((c) => c.init?.redirect === 'error')).toBe(true);
});

test('repo không tồn tại hoặc private → báo lỗi dễ hiểu', async () => {
  await expect(fetchGithubSubmission('https://github.com/nam/bai-tap', { fetch: fakeFetch({ status: 404 }).fn })).rejects.toThrow(/public/i);
});

test('repo quá lớn → từ chối trước khi tải archive', async () => {
  const f = fakeFetch({ size: 50_000 });
  await expect(fetchGithubSubmission('https://github.com/nam/bai-tap', { fetch: f.fn })).rejects.toThrow(/quá lớn/);
  expect(f.calls.some((c) => c.url.includes('codeload'))).toBe(false);
});

test('archive tải về lớn hơn giới hạn → dừng tải', async () => {
  const big = new Uint8Array(11 * 1024 * 1024);
  await expect(fetchGithubSubmission('https://github.com/nam/bai-tap', { fetch: fakeFetch({ archive: big }).fn })).rejects.toThrow(/quá lớn/);
});

test('link /tree/<nhánh>/<thư mục> → chỉ lấy file trong thư mục đó', async () => {
  const archive = zipSync({ [`${ROOT}/tuan-1/index.js`]: strToU8('a'), [`${ROOT}/tuan-2/index.js`]: strToU8('b'), [`${ROOT}/tuan-2/lib/x.js`]: strToU8('c') });
  const r = await fetchGithubSubmission('https://github.com/nam/bai-tap/tree/main/tuan-2', { fetch: fakeFetch({ archive }).fn });
  expect(r.files.map((x) => x.path).sort()).toEqual(['index.js', 'lib/x.js']);
});
