function sumArray(numbers) {
  console.log('đang tính', numbers);
  if (!Array.isArray(numbers)) throw new TypeError('cần mảng');
  return numbers.reduce((total, value) => total + value, 0);
}

module.exports = { sumArray };
