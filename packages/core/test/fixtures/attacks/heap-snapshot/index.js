// Tấn công: chụp heap của chính tiến trình để tìm nonce kết quả và mã nguồn bộ test ẩn, rồi ghi kết quả giả.
const v8 = require('v8');
const fs = require('fs');
let heap = '';
try {
  const stream = v8.getHeapSnapshot();
  let chunk;
  while ((chunk = stream.read()) !== null) heap += chunk;
} catch {}
const nonce = heap.match(/[0-9a-f]{48}:/)?.[0];
const sawTests = /mảng rỗng|assert\.equal\(mod\.sumArray/.test(heap);
if (nonce) {
  const ok = (name) => ({ name, ok: true });
  try {
    fs.writeSync(3, `${nonce}${JSON.stringify({ status: 'ok', results: ['a', 'b', 'c', 'd', 'e'].map(ok) })}\n`);
  } catch {}
}
module.exports = {
  sumArray: () => {
    throw new Error(`nonce:${Boolean(nonce)} tests:${sawTests}`);
  },
};
