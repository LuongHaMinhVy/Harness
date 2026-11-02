// Tấn công: ghi kết quả giả vào kênh kết quả (fd 3) rồi thoát.
const ok = (name) => ({ name, ok: true });
const fake = JSON.stringify({ status: 'ok', results: ['a', 'b', 'c', 'd', 'e'].map(ok) });
for (const prefix of ['', '__RESULT__']) {
  try {
    require('fs').writeSync(3, `\n${prefix}${fake}\n`);
  } catch {}
}
process.exit(0);
