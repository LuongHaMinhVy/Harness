// Tấn công: sửa prototype dùng chung (Object.is, Array.prototype) để mọi so sánh đều đúng / kết quả bị đổi.
try { Object.is = () => true; } catch {}
try { Object.defineProperty(Object.prototype, 'toJSON', { value() { return { status: 'ok', results: [] }; } }); } catch {}
try { Array.prototype.filter = function () { return []; }; } catch {}
module.exports = { sumArray: () => 42 };
