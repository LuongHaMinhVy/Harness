import { spawn } from 'node:child_process';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export type TestCaseResult = { name: string; ok: boolean; error?: string };
export type RunResult =
  | { status: 'ok'; passed: number; total: number; results: TestCaseResult[] }
  | { status: 'timeout'; timeoutMs: number }
  | { status: 'load_error'; message: string };

const RUNNER = fileURLToPath(new URL('./test-runner.cts', import.meta.url));
const MARKER = '__RESULT__';

// Chạy bộ test với bài nộp trong một tiến trình con riêng; quá timeoutMs thì kill.
// Chỉ cô lập tiến trình, KHÔNG phải sandbox bảo mật.
export function runSubmission(submissionPath: string, testsPath: string, timeoutMs = 3000): Promise<RunResult> {
  return new Promise((done) => {
    const child = spawn(process.execPath, [RUNNER, resolve(submissionPath), resolve(testsPath)], {
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let stdout = '';
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

    child.stdout.on('data', (chunk) => (stdout += chunk));
    child.on('error', (err) => finish({ status: 'load_error', message: `Không chạy được test: ${err.message}` }));
    child.on('close', (code) => {
      const line = stdout.split('\n').reverse().find((l) => l.startsWith(MARKER));
      if (!line) {
        finish({ status: 'load_error', message: `Tiến trình chạy test thoát mà không trả kết quả (mã ${code})` });
        return;
      }
      const parsed = JSON.parse(line.slice(MARKER.length)) as
        | { status: 'ok'; results: TestCaseResult[] }
        | { status: 'load_error'; message: string };
      if (parsed.status === 'load_error') {
        finish(parsed);
        return;
      }
      const passed = parsed.results.filter((r) => r.ok).length;
      finish({ status: 'ok', passed, total: parsed.results.length, results: parsed.results });
    });
  });
}
