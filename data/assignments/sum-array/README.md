# Bài tập: sum-array

Viết hàm `sumArray(arr)` và export bằng `module.exports = { sumArray }`.

Yêu cầu:
1. Trả về tổng các phần tử số trong mảng `arr` (số nguyên, số âm, số thập phân).
2. Mảng rỗng trả về `0`.
3. Nếu `arr` không phải mảng, ném `TypeError`.

Ví dụ:
- `sumArray([1, 2, 3])` → `6`
- `sumArray([-1, 2.5])` → `1.5`
- `sumArray([])` → `0`
- `sumArray("abc")` → ném `TypeError`
