const assert = require('node:assert/strict');
module.exports = [
  { name: 'không đọc được file ngoài bài nộp', run: (m) => assert.equal(m.readOutside(), 'ERR_ACCESS_DENIED') },
  { name: 'không ghi được file', run: (m) => assert.equal(m.write(), 'ERR_ACCESS_DENIED') },
  { name: 'không chạy được lệnh hệ thống', run: (m) => assert.equal(m.spawn(), 'ERR_ACCESS_DENIED') },
  { name: 'không thấy biến môi trường của server', run: (m) => assert.equal(m.secret(), 'none') },
  { name: 'vẫn đọc được file của chính bài nộp', run: (m) => assert.equal(m.readOwn(), 'ALLOWED') },
];
