function sumArray(numbers) {
  let total = 0;
  let i = 0;
  while (i < numbers.length) {
    total += numbers[i];
  }
  return total;
}

module.exports = { sumArray };
