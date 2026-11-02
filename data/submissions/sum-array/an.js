var s = 0;

function sumArray(a) {
  s = 0;
  for (var i = 0; i < a.length; i++) {
    s = s + a[i];
  }
  return s;
}

module.exports = { sumArray };
