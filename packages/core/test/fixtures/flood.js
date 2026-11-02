const fs = require('fs');
fs.writeSync(1, 'x'.repeat(2 * 1024 * 1024));
module.exports = { sumArray: () => 0 };
