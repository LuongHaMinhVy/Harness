import { checkFileSet, extractZip, stripCommonRoot, UploadError, type UploadedFile } from './collect.js';

export type GithubRef = { owner: string; repo: string; ref: string | null; subdir: string | null };
export type GithubSubmission = { files: UploadedFile[]; commit: string; url: string };

const NAME = /^[A-Za-z0-9_.-]{1,100}$/;
const REF = /^[A-Za-z0-9._-]{1,100}$/;
const SHA = /^[0-9a-f]{40}$/;

const MAX_REPO_KB = 20_000;
const MAX_ARCHIVE_BYTES = 10 * 1024 * 1024;
const TIMEOUT_MS = 20_000;

const bad = (why: string) => new UploadError(`Link GitHub không hợp lệ: ${why}`);

// Chỉ nhận https://github.com/<owner>/<repo>[.git][/tree/<nhánh>[/<thư mục>]].
// Server chỉ gọi tới api.github.com và codeload.github.com với owner/repo đã kiểm tra — người nộp không điều khiển được host.
export function parseGithubUrl(raw: string): GithubRef {
  const text = raw.trim();
  if (/(^|\/)\.\.?(\/|$)/.test(text.replace(/^https:\/\//, ''))) throw bad('không được chứa "." hay ".."');
  let u: URL;
  try {
    u = new URL(text);
  } catch {
    throw bad('không phải địa chỉ web');
  }
  if (u.protocol !== 'https:' || u.hostname !== 'github.com' || u.port || u.username || u.password) {
    throw bad('phải có dạng https://github.com/<tài-khoản>/<repo>');
  }
  const parts = u.pathname.split('/').filter(Boolean);
  const [owner, repoRaw] = parts;
  const repo = repoRaw?.replace(/\.git$/, '');
  if (!owner || !repo || !NAME.test(owner) || !NAME.test(repo)) throw bad('thiếu tên tài khoản hoặc tên repo');
  if (parts.length === 2) return { owner, repo, ref: null, subdir: null };
  if (parts[2] !== 'tree' || !parts[3] || !REF.test(parts[3])) throw bad('chỉ nhận link repo hoặc link /tree/<nhánh>/<thư mục>');
  const sub = parts.slice(4);
  if (sub.some((p) => !NAME.test(p))) throw bad('tên thư mục không hợp lệ');
  return { owner, repo, ref: parts[3], subdir: sub.length ? sub.join('/') : null };
}

type Options = { fetch?: typeof fetch; token?: string };

async function call(f: typeof fetch, url: string, token: string | undefined): Promise<Response> {
  try {
    return await f(url, {
      redirect: 'error',
      signal: AbortSignal.timeout(TIMEOUT_MS),
      headers: {
        'User-Agent': 'harness-cham-bai',
        Accept: 'application/vnd.github+json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
    });
  } catch {
    throw new UploadError('Không kết nối được tới GitHub — kiểm tra mạng của máy chủ');
  }
}

function checkStatus(res: Response): void {
  if (res.ok) return;
  if (res.status === 404 || res.status === 401) throw new UploadError('Không tìm thấy repo trên GitHub (repo phải để public)');
  if (res.status === 403 || res.status === 429) throw new UploadError('GitHub đang giới hạn số lần truy cập — thử lại sau ít phút');
  throw new UploadError(`GitHub trả lỗi ${res.status}`);
}

// Đọc body có giới hạn: vượt quá thì huỷ tải ngay, không đọc hết vào bộ nhớ.
async function readCapped(res: Response, max: number): Promise<Uint8Array> {
  const reader = res.body?.getReader();
  if (!reader) return new Uint8Array();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.length;
    if (total > max) {
      await reader.cancel();
      throw new UploadError(`Repo quá lớn (bản nén tối đa ${max / 1024 / 1024} MB)`);
    }
    chunks.push(value);
  }
  const out = new Uint8Array(total);
  let off = 0;
  for (const c of chunks) {
    out.set(c, off);
    off += c.length;
  }
  return out;
}

// Tải bài nộp từ repo GitHub public, ghim đúng commit tại thời điểm nộp (repo có sửa sau đó cũng không ảnh hưởng).
export async function fetchGithubSubmission(url: string, opts: Options = {}): Promise<GithubSubmission> {
  const ref = parseGithubUrl(url);
  const f = opts.fetch ?? fetch;
  const base = `https://api.github.com/repos/${ref.owner}/${ref.repo}`;

  const metaRes = await call(f, base, opts.token);
  checkStatus(metaRes);
  const meta = (await metaRes.json()) as { private?: boolean; size?: number; default_branch?: string };
  if (meta.private) throw new UploadError('Không tìm thấy repo trên GitHub (repo phải để public)');
  if ((meta.size ?? 0) > MAX_REPO_KB) throw new UploadError(`Repo quá lớn (tối đa ${MAX_REPO_KB / 1000} MB)`);

  const branch = ref.ref ?? meta.default_branch ?? 'HEAD';
  const commitRes = await call(f, `${base}/commits/${encodeURIComponent(branch)}`, opts.token);
  checkStatus(commitRes);
  const { sha } = (await commitRes.json()) as { sha?: string };
  if (!sha || !SHA.test(sha)) throw new UploadError('Không xác định được commit của repo');

  const archiveRes = await call(f, `https://codeload.github.com/${ref.owner}/${ref.repo}/zip/${sha}`, opts.token);
  checkStatus(archiveRes);
  let files = stripCommonRoot(extractZip(await readCapped(archiveRes, MAX_ARCHIVE_BYTES), { skipInvalid: true }));
  if (ref.subdir) {
    const prefix = `${ref.subdir}/`;
    files = files.filter((x) => x.path.startsWith(prefix)).map((x) => ({ ...x, path: x.path.slice(prefix.length) }));
    if (!files.length) throw new UploadError(`Không có file nào trong thư mục "${ref.subdir}" của repo`);
  }
  if (!files.length) throw new UploadError('Repo không có file code nào hợp lệ');
  return { files: checkFileSet(files), commit: sha, url: `https://github.com/${ref.owner}/${ref.repo}${ref.subdir ? `/tree/${branch}/${ref.subdir}` : ''}` };
}
