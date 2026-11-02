const assert = require('node:assert/strict');

module.exports = [
  { name: 'số dương', run: (mod) => assert.equal(mod.sumArray([1, 2, 3]), 6) },
  { name: 'số âm và thập phân', run: (mod) => assert.equal(mod.sumArray([-1, 2.5]), 1.5) },
  { name: 'một phần tử', run: (mod) => assert.equal(mod.sumArray([7]), 7) },
  { name: 'mảng rỗng', run: (mod) => assert.equal(mod.sumArray([]), 0) },
  { name: 'không phải mảng', run: (mod) => assert.throws(() => mod.sumArray('abc'), TypeError) },
];
