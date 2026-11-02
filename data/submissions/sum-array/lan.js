function sumArray(numbers) {
  if (!Array.isArray(numbers)) {
    throw new TypeError('Đầu vào phải là mảng');
  }
  return numbers.reduce((total, value) => total + value);
}

module.exports = { sumArray };
