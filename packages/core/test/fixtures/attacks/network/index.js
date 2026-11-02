// Tấn công: mở kết nối mạng (cổng truyền qua tên file .port cạnh bài nộp, do test ghi sẵn).
const port = Number(require('fs').readFileSync(require('path').join(__dirname, 'port.txt'), 'utf8'));
const tried = [];
const attempt = (name, fn) => { try { fn(); tried.push(`${name}:sent`); } catch (e) { tried.push(`${name}:${e.message}`); } };
attempt('net', () => require('net').connect(port, '127.0.0.1').on('error', () => {}));
attempt('http', () => require('http').get(`http://127.0.0.1:${port}/`).on('error', () => {}));
attempt('fetch', () => { fetch(`http://127.0.0.1:${port}/`).catch(() => {}); });
attempt('dgram', () => require('dgram').createSocket('udp4').send('x', port, '127.0.0.1'));
attempt('server', () => require('net').createServer().listen(0));
module.exports = { sumArray: (a) => { if (!Array.isArray(a)) throw new TypeError('x'); return a.reduce((s, v) => s + v, 0); }, tried };
