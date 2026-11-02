// Chạy trong tiến trình con: node test-runner.cts <submission> <tests> (Node 24 tự bỏ type khi chạy).
// In đúng một dòng kết quả cuối cùng dạng __RESULT__<json>.
// File .cts (CommonJS) để require() được bài nộp và bộ test viết theo module.exports.

type TestCase = { name: string; run: (mod: unknown) => unknown };
type RunnerResult =
  | { status: 'ok'; results: { name: string; ok: boolean; error?: string }[] }
  | { status: 'load_error'; message: string };

const realWrite = process.stdout.write.bind(process.stdout);
const silence = (() => true) as typeof process.stdout.write;

// In kết quả rồi thoát ngay: bài nộp có thể để lại timer/handle khiến tiến trình sống tiếp và bị tính nhầm là timeout.
function report(result: RunnerResult): void {
  realWrite(`\n__RESULT__${JSON.stringify(result)}\n`, () => process.exit(0));
}

function describeLoadError(err: unknown): string {
  if (!(err instanceof Error)) return String(err);
  // Với SyntaxError, stack có dạng "<file>:<dòng>\n<code>\n   ^\n\nSyntaxError: ..." — giữ phần đó để chỉ ra dòng lỗi.
  const lines = String(err.stack ?? '').split('\n');
  const end = lines.findIndex((l) => l.startsWith(`${err.name}:`));
  const head = end >= 0 ? lines.slice(0, end + 1) : [`${err.name}: ${err.message}`];
  return head.filter((l) => l.trim() !== '').join('\n').slice(0, 600);
}

async function main(): Promise<void> {
  const [submissionPath, testsPath] = process.argv.slice(2);
  const tests = require(testsPath) as TestCase[];

  console.log = console.error = console.warn = console.info = () => {};
  process.stdout.write = silence;

  let mod: unknown;
  try {
    mod = require(submissionPath);
  } catch (err) {
    report({ status: 'load_error', message: describeLoadError(err) });
    return;
  }

  const results: { name: string; ok: boolean; error?: string }[] = [];
  for (const t of tests) {
    try {
      await t.run(mod);
      results.push({ name: t.name, ok: true });
    } catch (err) {
      const message = err instanceof Error ? `${err.name}: ${err.message}` : String(err);
      results.push({ name: t.name, ok: false, error: message.slice(0, 300) });
    }
  }
  report({ status: 'ok', results });
}

void main();
