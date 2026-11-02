function sumArray(numbers) {
  let total = 0;
  for (const value of numbers) {
    total += value;

  return total;
}

module.exports = { sumArray };
