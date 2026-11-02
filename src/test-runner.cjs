// Chạy trong tiến trình con: node test-runner.cjs <submission> <tests>
// In đúng một dòng kết quả cuối cùng dạng __RESULT__<json>.
const realWrite = process.stdout.write.bind(process.stdout);
const silence = () => true;

function report(result) {
  realWrite(`\n__RESULT__${JSON.stringify(result)}\n`);
}

function describeLoadError(err) {
  if (!(err instanceof Error)) return String(err);
  // Với SyntaxError, stack có dạng "<file>:<dòng>\n<code>\n   ^\n\nSyntaxError: ..." — giữ phần đó để chỉ ra dòng lỗi.
  const lines = String(err.stack ?? '').split('\n');
  const end = lines.findIndex((l) => l.startsWith(`${err.name}:`));
  const head = end >= 0 ? lines.slice(0, end + 1) : [`${err.name}: ${err.message}`];
  return head.filter((l) => l.trim() !== '').join('\n').slice(0, 600);
}

async function main() {
  const [submissionPath, testsPath] = process.argv.slice(2);
  const tests = require(testsPath);

  console.log = console.error = console.warn = console.info = () => {};
  process.stdout.write = silence;

  let mod;
  try {
    mod = require(submissionPath);
  } catch (err) {
    report({ status: 'load_error', message: describeLoadError(err) });
    return;
  }

  const results = [];
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

main();
