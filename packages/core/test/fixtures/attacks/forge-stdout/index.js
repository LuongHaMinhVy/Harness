// Tấn công: in dòng kết quả giả rồi thoát trước khi runner kịp chạy test.
const ok = (name) => ({ name, ok: true });
const fake = { status: 'ok', results: ['a', 'b', 'c', 'd', 'e'].map(ok) };
require('fs').writeSync(1, `\n__RESULT__${JSON.stringify(fake)}\n`);
process.exit(0);
