import { spawn, type ChildProcess } from 'node:child_process';
import { createHash } from 'node:crypto';
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
  memoryMb?: number;
  /** Trần thời gian cả lần chạy (mọi lần gọi cộng lại). */
  totalBudgetMs?: number;
};

const RUNNER = fileURLToPath(new URL('./test-runner.cts', import.meta.url));
const STUDENT_CALL = fileURLToPath(new URL('./student-call.cts', import.meta.url));
const MEMORY_MB = 64;
const TOTAL_BUDGET_MS = 20_000;
const MAX_REPLY_BYTES = 1024 * 1024;

/** Dấu vân tay của runner: đưa vào khoá cache để sửa runner thì kết quả cũ trong cache hết hiệu lực. */
export const RUNNER_ID = createHash('sha256').update(readFileSync(RUNNER)).update(readFileSync(STUDENT_CALL)).digest('hex').slice(0, 12);

// Chạy bộ test với bài nộp, tách làm hai lớp tiến trình (Permission Model của Node, env rỗng, intrinsic đóng băng):
// - giám khảo (test-runner.cts): giữ bộ test ẩn và tự chạy assert, KHÔNG nạp bài nộp, không được tạo tiến trình
//   (bộ test do giảng viên viết chạy ở đó); cần gọi hàm của bài nộp thì gửi yêu cầu về đây;
// - mỗi lần gọi: một tiến trình student-call.cts riêng do tiến trình này tạo, chỉ ĐỌC được thư mục bài nộp, không ghi
//   file, không tạo tiến trình/worker/inspector, giới hạn bộ nhớ và `timeoutMs` cho lần gọi đó.
// Code học viên không cùng tiến trình với bộ test hay kênh kết quả nên không giả được kết quả, không đọc được test ẩn.
// Node 24 chưa có quyền chặn mạng: student-call chặn ở các API public, nhưng chấm bài người lạ vẫn nên chạy
// trong container không có mạng.
export function runSubmission(submissionPath: string, testsPath: string, timeoutMs = 3000, opts: RunOptions = {}): Promise<RunResult> {
  const entry = resolve(submissionPath);
  const readRoots = (opts.readRoots ?? [dirname(entry)]).map((p) => resolve(p));
  const deadline = Date.now() + (opts.totalBudgetMs ?? TOTAL_BUDGET_MS);
  let tests: string;
  try {
    tests = readFileSync(resolve(testsPath), 'utf8');
  } catch (err) {
    return Promise.resolve({ status: 'load_error', message: `Không đọc được bộ test: ${err instanceof Error ? err.message : String(err)}` });
  }
  const judgeArgs = ['--permission', `--allow-fs-read=${RUNNER}`, '--frozen-intrinsics', RUNNER];
  const callArgs = [
    '--permission',
    ...[...readRoots, STUDENT_CALL].map((p) => `--allow-fs-read=${p}`),
    '--frozen-intrinsics',
    `--max-old-space-size=${opts.memoryMb ?? MEMORY_MB}`,
    STUDENT_CALL,
    entry,
  ];

  return new Promise((done) => {
    const judge = spawn(process.execPath, judgeArgs, { stdio: ['pipe', 'ignore', 'ignore', 'pipe'], env: {}, windowsHide: true });
    const [toJudge, , , fromJudge] = judge.stdio as unknown as [Writable, null, null, Readable];
    let current: ChildProcess | null = null;
    let finished = false;
    const finish = (r: RunResult) => {
      if (finished) return;
      finished = true;
      clearTimeout(guard);
      current?.kill('SIGKILL');
      judge.kill('SIGKILL');
      done(r);
    };
    // Mỗi lần gọi đã có timeoutMs và tổng thời gian có deadline; đây chỉ là chốt chặn cuối nếu chính giám khảo bị treo.
    const guard = setTimeout(() => finish({ status: 'timeout', timeoutMs }), deadline - Date.now() + 5000);
    const reply = (msg: object) => toJudge.write(`${JSON.stringify(msg)}\n`);

    // Một lần gọi vào bài nộp: tiến trình cô lập riêng, trả lời (v8.serialize) qua fd 3.
    const call = (payload: string) => {
      const budget = Math.min(timeoutMs, deadline - Date.now());
      if (budget <= 0) return reply({ status: 'timeout' });
      const child = spawn(process.execPath, callArgs, { stdio: ['pipe', 'ignore', 'ignore', 'pipe'], env: {}, cwd: dirname(entry), windowsHide: true });
      current = child;
      const [stdin, , , out] = child.stdio as unknown as [Writable, null, null, Readable];
      const chunks: Buffer[] = [];
      let size = 0;
      let outcome: 'ok' | 'timeout' | 'too_big' = 'ok';
      const timer = setTimeout(() => {
        outcome = 'timeout';
        child.kill('SIGKILL');
      }, budget);
      stdin.on('error', () => {});
      stdin.end(Buffer.from(payload, 'base64'));
      out.on('data', (c: Buffer) => {
        size += c.length;
        if (size > MAX_REPLY_BYTES) {
          outcome = 'too_big';
          child.kill('SIGKILL');
        } else chunks.push(c);
      });
      child.on('error', () => {});
      child.on('close', (code) => {
        clearTimeout(timer);
        current = null;
        if (finished) return;
        if (outcome !== 'ok') return reply({ status: outcome });
        reply({ status: 'exit', code, payload: chunks.length ? Buffer.concat(chunks).toString('base64') : undefined });
      });
    };

    let buffer = '';
    fromJudge.on('data', (chunk: Buffer) => {
      buffer += chunk;
      if (buffer.length > MAX_REPLY_BYTES * 2) return finish({ status: 'load_error', message: 'Kết quả chạy test quá lớn' });
      let nl: number;
      while ((nl = buffer.indexOf('\n')) >= 0) {
        const line = buffer.slice(0, nl);
        buffer = buffer.slice(nl + 1);
        let msg: { type?: string; payload?: string; result?: unknown };
        try {
          msg = JSON.parse(line);
        } catch {
          return finish({ status: 'load_error', message: 'Kết quả chạy test bị hỏng' });
        }
        if (msg.type === 'call' && typeof msg.payload === 'string') call(msg.payload);
        else if (msg.type === 'result') return finish(toRunResult(msg.result, timeoutMs));
      }
    });
    toJudge.on('error', () => {});
    toJudge.write(`${JSON.stringify({ tests })}\n`);
    judge.on('error', (err) => finish({ status: 'load_error', message: `Không chạy được test: ${err.message}` }));
    judge.on('close', (code) => finish({ status: 'load_error', message: `Tiến trình chạy test thoát mà không trả kết quả (mã ${code})` }));
  });
}

function toRunResult(raw: unknown, timeoutMs: number): RunResult {
  const parsed = raw as { status: 'ok'; results: TestCaseResult[] } | { status: 'load_error'; message: string } | { status: 'timeout' } | undefined;
  if (!parsed || typeof parsed !== 'object') return { status: 'load_error', message: 'Kết quả chạy test bị hỏng' };
  if (parsed.status === 'load_error') return parsed;
  if (parsed.status === 'timeout') return { status: 'timeout', timeoutMs };
  const passed = parsed.results.filter((r) => r.ok).length;
  return { status: 'ok', passed, total: parsed.results.length, results: parsed.results };
}
