const cache = new Map();
setInterval(() => cache.clear(), 60000);

function sumArray(numbers) {
  if (!Array.isArray(numbers)) throw new TypeError('cần mảng');
  return numbers.reduce((total, value) => total + value, 0);
}

module.exports = { sumArray };
