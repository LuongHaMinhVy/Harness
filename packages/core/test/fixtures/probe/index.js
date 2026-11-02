const fs = require('fs');
const path = require('path');
const attempt = (fn) => { try { fn(); return 'ALLOWED'; } catch (e) { return e.code || e.message; } };
module.exports = {
  readOutside: () => attempt(() => fs.readFileSync(path.join(__dirname, '..', '..', '..', 'package.json'))), 
  write: () => attempt(() => fs.writeFileSync(path.join(__dirname, 'w.txt'), 'x')),
  spawn: () => attempt(() => require('child_process').execSync('echo hi')),
  secret: () => process.env.HARNESS_SECRET_PROBE ?? 'none',
  readOwn: () => attempt(() => fs.readFileSync(path.join(__dirname, 'index.js'))),
};
