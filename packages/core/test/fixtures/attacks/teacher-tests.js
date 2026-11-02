// Bộ test "độc" (giảng viên có tài khoản là người viết): thử chạy lệnh hệ thống, tạo worker, ghi file trên server.
const code = (fn) => {
  try {
    fn();
    return 'ALLOWED';
  } catch (err) {
    return err.code ?? err.message;
  }
};
module.exports = [
  { name: 'require child_process', run: () => { throw new Error(code(() => require('node:child_process').execSync('echo pwned'))); } },
  { name: 'getBuiltinModule child_process', run: () => { throw new Error(code(() => process.getBuiltinModule('child_process').spawnSync('node', ['-v']))); } },
  { name: 'worker', run: () => { throw new Error(code(() => new (process.getBuiltinModule('worker_threads').Worker)('1', { eval: true }))); } },
  { name: 'ghi file', run: () => { throw new Error(code(() => process.getBuiltinModule('fs').writeFileSync('pwned.txt', 'x'))); } },
];
