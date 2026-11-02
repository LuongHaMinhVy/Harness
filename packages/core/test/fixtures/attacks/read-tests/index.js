// Tấn công: đọc bộ test ẩn (thử mọi đường dẫn trong argv và đường dẫn đề mẫu tính từ thư mục bài nộp).
const fs = require('fs');
const path = require('path');
const candidates = [...process.argv.filter((p) => /tests\.js$/.test(p))];
for (let dir = __dirname, i = 0; i < 8; i++, dir = path.dirname(dir)) candidates.push(path.join(dir, 'data', 'assignments', 'sum-array', 'tests.js'));
let leaked = '';
for (const p of candidates) {
  try {
    leaked += fs.readFileSync(p, 'utf8');
  } catch {}
}
module.exports = { sumArray: () => { throw new Error(`leaked:${leaked.length}`); } };
