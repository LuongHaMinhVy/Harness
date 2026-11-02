import { spawn } from 'node:child_process';
import { createHash, randomBytes } from 'node:crypto';
import { readFileSync } from 'node:fs';
import type { Readable, Writable } from 'node:stream';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export type TestCaseResult = { name: string; ok: boolean; error?: string };
export type RunResult =
  | { status: 'ok'; passed: number; total: number; results: TestCaseResult[] }
  | { status: 'timeout'; timeoutMs: number }
  | { status: 'load_error'; message: string };

export type RunOptions = {
  /** Thư mục/file bài nộp được phép đọc; mặc định là thư mục chứa file chính. */
  readRoots?: string[];
  maxOutputBytes?: number;
  memoryMb?: number;
};

const RUNNER = fileURLToPath(new URL('./test-runner.cts', import.meta.url));
const MAX_OUTPUT_BYTES = 1024 * 1024;

/** Dấu vân tay của runner: đưa vào khoá cache để sửa runner thì kết quả cũ trong cache hết hiệu lực. */
export const RUNNER_ID = createHash('sha256').update(readFileSync(RUNNER)).digest('hex').slice(0, 12);
const MEMORY_MB = 64;

// Chạy bộ test với bài nộp trong một tiến trình con bị cô lập bằng Permission Model của Node:
// chỉ được ĐỌC thư mục bài nộp và runner (bộ test gửi qua stdin, bài nộp không đọc được); không ghi file,
// không tạo tiến trình con/worker/inspector; env rỗng (không thấy API key); intrinsic bị đóng băng;
// giới hạn bộ nhớ, thời gian và lượng dữ liệu in ra.
// Kết quả chỉ nhận trên fd 3 kèm nonce ngẫu nhiên của lần chạy — bài nộp không biết nonce nên không giả được.
// Node 24 chưa có quyền chặn mạng: runner chặn ở các API public, nhưng chấm bài người lạ vẫn nên chạy
// trong container không có mạng.
export function runSubmission(submissionPath: string, testsPath: string, timeoutMs = 3000, opts: RunOptions = {}): Promise<RunResult> {
  const entry = resolve(submissionPath);
  const readRoots = (opts.readRoots ?? [dirname(entry)]).map((p) => resolve(p));
  const maxOutput = opts.maxOutputBytes ?? MAX_OUTPUT_BYTES;
  const nonce = `${randomBytes(24).toString('hex')}:`;
  let testsSource: string;
  try {
    testsSource = readFileSync(resolve(testsPath), 'utf8');
  } catch (err) {
    return Promise.resolve({ status: 'load_error', message: `Không đọc được bộ test: ${err instanceof Error ? err.message : String(err)}` });
  }
  const args = [
    '--permission',
    ...[...readRoots, RUNNER].map((p) => `--allow-fs-read=${p}`),
    '--frozen-intrinsics',
    `--max-old-space-size=${opts.memoryMb ?? MEMORY_MB}`,
    RUNNER,
    entry,
  ];

  return new Promise((done) => {
    const child = spawn(process.execPath, args, { stdio: ['pipe', 'pipe', 'ignore', 'pipe'], env: {}, cwd: dirname(entry) });
    const [stdin, stdout, , channel] = child.stdio as unknown as [Writable, Readable, null, Readable];
    let result = '';
    let bytes = 0;
    let finished = false;
    const finish = (r: RunResult) => {
      if (finished) return;
      finished = true;
      clearTimeout(timer);
      // Có kết quả rồi thì dừng luôn: bài nộp có thể để lại timer/handle khiến tiến trình sống tiếp.
      child.kill('SIGKILL');
      done(r);
    };
    const tooMuch = () => finish({ status: 'load_error', message: `Bài nộp in ra quá nhiều dữ liệu (> ${Math.round(maxOutput / 1024)} KB)` });

    const timer = setTimeout(() => finish({ status: 'timeout', timeoutMs }), timeoutMs);

    stdin.on('error', () => {});
    stdin.end(JSON.stringify({ nonce, tests: testsSource }));
    stdout.on('data', (chunk: Buffer) => {
      bytes += chunk.length;
      if (bytes > maxOutput) tooMuch();
    });
    channel.on('data', (chunk: Buffer) => {
      bytes += chunk.length;
      if (bytes > maxOutput) return tooMuch();
      result += chunk;
      const line = result.split('\n').find((l) => l.startsWith(nonce));
      if (line) finish(parseResult(line.slice(nonce.length)));
    });
    child.on('error', (err) => finish({ status: 'load_error', message: `Không chạy được test: ${err.message}` }));
    child.on('close', (code) => finish({ status: 'load_error', message: `Tiến trình chạy test thoát mà không trả kết quả (mã ${code})` }));
  });
}

function parseResult(json: string): RunResult {
  let parsed: { status: 'ok'; results: TestCaseResult[] } | { status: 'load_error'; message: string };
  try {
    parsed = JSON.parse(json);
  } catch {
    return { status: 'load_error', message: 'Kết quả chạy test bị hỏng' };
  }
  if (parsed.status === 'load_error') return parsed;
  const passed = parsed.results.filter((r) => r.ok).length;
  return { status: 'ok', passed, total: parsed.results.length, results: parsed.results };
}
