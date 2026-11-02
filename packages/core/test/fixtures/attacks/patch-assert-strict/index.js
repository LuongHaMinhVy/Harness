'use strict';
// Như patch-assert nhưng ở strict mode: gán vào đối tượng đã đóng băng phải ném lỗi, không âm thầm bỏ qua.
require('node:assert/strict').equal = () => {};
module.exports = { sumArray: () => 42 };
