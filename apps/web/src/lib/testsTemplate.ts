// Mẫu tests.js gợi ý khi tạo đề mới (CommonJS, chạy bởi packages/core/src/test-runner.cts).
export const TESTS_TEMPLATE = `// Bộ test cho đề bài — CommonJS. "mod" là module.exports của file chính học viên nộp.
// Mỗi test: { name, run(mod) }; test đạt nếu run() không ném lỗi (có thể là hàm async).
const assert = require('node:assert/strict');

module.exports = [
  // Ví dụ: đề yêu cầu file chính export hàm sumArray(arr)
  { name: 'cộng số dương', run: (mod) => assert.equal(mod.sumArray([1, 2, 3]), 6) },
  { name: 'mảng rỗng trả về 0', run: (mod) => assert.equal(mod.sumArray([]), 0) },
  { name: 'không phải mảng thì ném TypeError', run: (mod) => assert.throws(() => mod.sumArray('abc'), TypeError) },
];
`;
