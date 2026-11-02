import { spawn } from 'node:child_process';
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
const MARKER = '__RESULT__';
const MAX_OUTPUT_BYTES = 1024 * 1024;
const MEMORY_MB = 64;

// Chạy bộ test với bài nộp trong một tiến trình con bị cô lập bằng Permission Model của Node:
// chỉ được ĐỌC thư mục bài nộp, bộ test và runner; không ghi file, không tạo tiến trình con/worker;
// env rỗng (không thấy API key hay bí mật nào); giới hạn bộ nhớ, thời gian và lượng dữ liệu in ra.
// Node 24 chưa chặn được kết nối mạng — chấm bài người lạ thì nên chạy trong container không có mạng.
export function runSubmission(submissionPath: string, testsPath: string, timeoutMs = 3000, opts: RunOptions = {}): Promise<RunResult> {
  const entry = resolve(submissionPath);
  const tests = resolve(testsPath);
  const readRoots = (opts.readRoots ?? [dirname(entry)]).map((p) => resolve(p));
  const maxOutput = opts.maxOutputBytes ?? MAX_OUTPUT_BYTES;
  const args = [
    '--permission',
    ...[...readRoots, tests, RUNNER].map((p) => `--allow-fs-read=${p}`),
    `--max-old-space-size=${opts.memoryMb ?? MEMORY_MB}`,
    RUNNER,
    entry,
    tests,
  ];

  return new Promise((done) => {
    const child = spawn(process.execPath, args, { stdio: ['ignore', 'pipe', 'ignore'], env: {}, cwd: dirname(entry) });
    let stdout = '';
    let bytes = 0;
    let finished = false;
    const finish = (r: RunResult) => {
      if (finished) return;
      finished = true;
      clearTimeout(timer);
      done(r);
    };

    const timer = setTimeout(() => {
      child.kill('SIGKILL');
      finish({ status: 'timeout', timeoutMs });
    }, timeoutMs);

    child.stdout.on('data', (chunk: Buffer) => {
      bytes += chunk.length;
      if (bytes > maxOutput) {
        child.kill('SIGKILL');
        finish({ status: 'load_error', message: `Bài nộp in ra quá nhiều dữ liệu (> ${Math.round(maxOutput / 1024)} KB)` });
        return;
      }
      stdout += chunk;
    });
    child.on('error', (err) => finish({ status: 'load_error', message: `Không chạy được test: ${err.message}` }));
    child.on('close', (code) => {
      const line = stdout.split('\n').reverse().find((l) => l.startsWith(MARKER));
      if (!line) {
        finish({ status: 'load_error', message: `Tiến trình chạy test thoát mà không trả kết quả (mã ${code})` });
        return;
      }
      let parsed: { status: 'ok'; results: TestCaseResult[] } | { status: 'load_error'; message: string };
      try {
        parsed = JSON.parse(line.slice(MARKER.length));
      } catch {
        finish({ status: 'load_error', message: 'Kết quả chạy test bị hỏng' });
        return;
      }
      if (parsed.status === 'load_error') {
        finish(parsed);
        return;
      }
      const passed = parsed.results.filter((r) => r.ok).length;
      finish({ status: 'ok', passed, total: parsed.results.length, results: parsed.results });
    });
  });
}
