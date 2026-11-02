function sumArray(numbers) {
  if (!Array.isArray(numbers)) {
    throw new TypeError('sumArray cần một mảng');
  }
  return numbers.reduce((total, value) => total + value, 0);
}

module.exports = { sumArray };
