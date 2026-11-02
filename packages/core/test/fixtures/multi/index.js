const { add } = require('./lib/add');
function sumArray(numbers) {
  if (!Array.isArray(numbers)) throw new TypeError('cần mảng');
  return numbers.reduce(add, 0);
}
module.exports = { sumArray };
