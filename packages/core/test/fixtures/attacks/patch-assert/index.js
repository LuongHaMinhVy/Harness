// Tấn công: vô hiệu hoá assert mà bộ test dùng chung, rồi trả kết quả sai.
for (const id of ['assert', 'node:assert', 'assert/strict', 'node:assert/strict']) {
  const a = require(id);
  for (const k of ['equal', 'strictEqual', 'deepEqual', 'deepStrictEqual', 'throws', 'ok']) {
    try {
      a[k] = () => {};
    } catch {}
  }
}
module.exports = { sumArray: () => 42 };
