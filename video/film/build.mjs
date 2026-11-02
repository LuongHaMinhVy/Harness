// Dựng các cảnh HyperFrames từ bản quay màn hình (video/record/out/<tên>) + giọng đọc (audio_meta.json).
//   node build.mjs --rec ../record/out/real
// Mỗi phần: tốc độ bản quay khớp độ dài giọng đọc, chú thích hiện đúng mốc thời gian thật của bản quay,
// phóng vào vùng chứng minh (log, thẻ kết quả). Chạy lại bất cứ khi nào bản quay hoặc giọng đọc thay đổi.
import { execFileSync } from 'node:child_process';
import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { parseArgs } from 'node:util';

const { values: args } = parseArgs({ options: { rec: { type: 'string', default: '../record/out/mock' } } });
const REC = resolve(args.rec);
const LEAD = 0.6; // giọng đọc bắt đầu sau khi cảnh mở
const TAIL = 1.2; // thở ở cuối cảnh
const CALLOUT = 3.2;
const FPS = 30;

const voices = Object.fromEntries(JSON.parse(readFileSync('audio_meta.json', 'utf8')).voices.map((v) => [v.id, v]));
const round = (x) => Math.round(x * 100) / 100;
const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;');

const SECTIONS = [
  {
    id: 's1',
    label: '1/5 · Giới thiệu bài toán',
    callouts: [
      { at: 'submissions', text: 'Đề sum-array · 5 bài nộp của lớp' },
      { at: 'harness', text: 'Trang Harness của admin' },
    ],
    zooms: [],
    intro: true,
  },
  {
    id: 's2',
    label: '2/5 · Câu bình thường: log từng lượt + chi phí',
    // Bản quay phần này mở trình duyệt mới (trang trắng, đăng nhập lại): bắt đầu ngay trước khi gõ câu hỏi.
    trim: { at: 'ask', offset: -3 },
    callouts: [
      { at: 'step', text: 'Log từng lượt: tool · input · kết quả' },
      { at: 'approval', text: 'Thao tác ghi → chờ duyệt' },
      { at: 'answer', text: 'Tổng lượt · token · cache · chi phí' },
    ],
    zooms: [{ at: 'answer', origin: '97% 96%', scale: 1.32 }],
  },
  {
    id: 's3',
    label: '3/5 · Câu dựa vào câu trước',
    callouts: [
      { at: 'ask', text: 'Không nhắc lại tên Nam' },
      { at: 'answer', text: 'Cache hit: token đầu vào giá rẻ' },
    ],
    zooms: [{ at: 'answer', origin: '97% 96%', scale: 1.32 }],
  },
  {
    id: 's4',
    label: '4/5 · Cố ý gây lỗi',
    // Phần này quay riêng (sau khi khởi động lại server): bỏ đoạn đăng nhập ở đầu.
    trim: { at: 'ask', offset: -3 },
    callouts: [
      { at: 'step', nth: 1, text: 'Tool báo lỗi → harness vẫn chạy' },
      { at: 'max-steps-2', text: 'Giới hạn còn 2 lượt' },
      { at: 'answer', nth: 2, text: 'Hết lượt → vẫn có câu trả lời' },
    ],
    zooms: [
      { at: 'answer', nth: 1, until: 'max-steps-2', origin: '97% 96%', scale: 1.32 },
      { at: 'answer', nth: 2, origin: '97% 96%', scale: 1.32 },
    ],
  },
  {
    id: 's5',
    label: '5/5 · Phần nâng cao',
    // Bỏ đoạn đăng xuất khỏi trang Harness: bắt đầu khi học viên An đã vào trang của mình.
    trim: { at: 'student-home', offset: -0.4 },
    callouts: [
      { at: 'submitted', text: 'Học viên nộp bài có câu “dụ” AI' },
      { at: 'grade-clicked', text: 'Giảng viên bấm Chấm' },
      { at: 'detail', text: 'Kết quả test + cờ cảnh báo' },
      { at: 'approved', text: 'Giảng viên sửa điểm, duyệt' },
      { at: 'student-grade', text: 'Học viên thấy điểm chính thức' },
    ],
    zooms: [{ at: 'detail', until: 'approved', untilOffset: -2.4, origin: '97% 30%', scale: 1.38 }],
  },
];

mkdirSync('assets/rec', { recursive: true });
mkdirSync('compositions', { recursive: true });

function markTime(marks, at, nth = 1) {
  const found = marks.filter((m) => m.label === at)[nth - 1];
  if (!found) throw new Error(`Thiếu mốc "${at}" #${nth}`);
  return found.t;
}

const CSS = `
  #root { position: absolute; inset: 0; background: #f4f6fb; overflow: hidden; font-family: Inter, sans-serif; }
  .zoom { position: absolute; inset: 0; }
  .rec { position: absolute; left: 0; top: 0; width: 1920px; height: 1080px; object-fit: contain; }
  .pill { position: absolute; left: 0; right: 0; top: 18px; display: flex; justify-content: center; z-index: 5; }
  .pill span { display: inline-block; padding: 12px 28px; border-radius: 999px; background: rgba(255,255,255,.94); border: 1px solid #d0d7e2;
    box-shadow: 0 6px 24px rgba(15,23,42,.12); font-weight: 700; font-size: 28px; color: #0f172a; }
  .badge { position: absolute; right: 64px; top: 22px; z-index: 6; }
  .badge span { display: inline-block; padding: 8px 18px; border-radius: 999px; background: #0f172a; color: #fff; font-weight: 700; font-size: 28px; }
  /* Chú thích nằm trong khoảng trống dưới menu trái của app (rộng ~270 px) — không che nội dung đang được nói tới. */
  .callout { position: absolute; left: 20px; bottom: 44px; width: 262px; z-index: 7; }
  .callout span { display: block; padding: 16px 18px 16px 18px; background: #fff; border-left: 6px solid #2563eb; border-radius: 10px;
    box-shadow: 0 10px 32px rgba(15,23,42,.18); font-weight: 700; font-size: 30px; line-height: 1.25; color: #0f172a; }
  .intro { position: absolute; inset: 0; display: flex; align-items: center; justify-content: center; z-index: 8; }
  .intro .card { padding: 56px 80px; border-radius: 24px; background: rgba(255,255,255,.95); box-shadow: 0 24px 80px rgba(15,23,42,.22); text-align: center; }
  .intro h1 { font-weight: 900; font-size: 64px; color: #0f172a; letter-spacing: -0.02em; }
  .intro p { margin-top: 18px; font-weight: 400; font-size: 32px; color: #334155; }
`;

const built = [];

for (const s of SECTIONS) {
  const src = join(REC, `${s.id}.mp4`);
  const marks = JSON.parse(readFileSync(join(REC, `${s.id}.json`), 'utf8'));
  const trim = s.trim ? Math.max(0, markTime(marks, s.trim.at) + s.trim.offset) : 0;
  const recLen = marks.find((m) => m.label === 'end').t - trim;
  const mp4 = `assets/rec/${s.id}.mp4`;
  copyFileSync(src, mp4); // bản quay đã là H.264 30 fps 1920×1080 (record.mjs)
  const voice = voices[s.id].duration_s;
  const want = LEAD + voice + TAIL;
  const speed = round(Math.min(2.0, Math.max(0.7, recLen / want)));
  const T = round(Math.max(want, recLen / speed));
  const vidDur = round(Math.min(T, recLen / speed));
  const at = (label, nth) => round(Math.max(0, markTime(marks, label, nth) - trim) / speed);

  const parts = [];
  const tl = [];
  // Bản quay (+ ảnh khung cuối nếu bản quay ngắn hơn cảnh)
  parts.push(`<div id="${s.id}-zoom" class="zoom" data-layout-allow-overflow>
      <video id="${s.id}-video" class="clip rec" src="${mp4}" muted playsinline data-start="0" data-duration="${vidDur}" data-media-start="${round(trim)}" data-playback-rate="${speed}" data-track-index="0"></video>`);
  if (T - vidDur > 0.05) {
    const png = `assets/rec/${s.id}-last.png`;
    execFileSync('ffmpeg', ['-loglevel', 'error', '-y', '-sseof', '-0.15', '-i', mp4, '-frames:v', '1', '-update', '1', png]);
    parts.push(`      <img id="${s.id}-hold" class="clip rec" src="${png}" alt="" data-hold data-start="${vidDur}" data-duration="${round(T - vidDur)}" data-track-index="0" />`);
  }
  parts.push('    </div>');

  // Nhãn phần + huy hiệu tua nhanh
  parts.push(`    <div id="${s.id}-pill" class="clip pill" data-start="0" data-duration="${T}" data-track-index="1"><span id="${s.id}-pill-t">${esc(s.label)}</span></div>`);
  tl.push(`tl.fromTo('#${s.id}-pill-t', { y: -16, opacity: 0 }, { y: 0, opacity: 1, duration: 0.35, ease: 'power3.out' }, 0.1);`);
  if (speed > 1.15) {
    parts.push(`    <div id="${s.id}-badge" class="clip badge" data-start="0" data-duration="${T}" data-track-index="2"><span>⏩ tua nhanh ×${speed.toFixed(1)}</span></div>`);
  }

  // Chú thích theo mốc thật, không chồng lên nhau
  let free = 0;
  s.callouts.forEach((c, i) => {
    const start = round(Math.max(at(c.at, c.nth), free + 0.1, s.intro ? 4 : 0.6));
    // Giữ đủ lâu để đọc (0,5 s + 0,3 s mỗi từ); chú thích sau sẽ lùi lại nếu cần, không cắt ngắn chú thích trước.
    const minHold = 0.5 + 0.3 * c.text.split(/\s+/).length;
    const dur = round(Math.max(minHold, Math.min(Math.max(CALLOUT, minHold), T - start - 0.2)));
    if (start + 1 > T) return;
    free = start + dur;
    const id = `${s.id}-c${i + 1}`;
    parts.push(`    <div id="${id}" class="clip callout" data-start="${start}" data-duration="${dur}" data-track-index="3"><span id="${id}-t">${esc(c.text)}</span></div>`);
    tl.push(`tl.fromTo('#${id}-t', { x: -24, opacity: 0 }, { x: 0, opacity: 1, duration: 0.3, ease: 'power3.out' }, ${start});`);
    tl.push(`tl.to('#${id}-t', { opacity: 0, duration: 0.25, ease: 'power1.in' }, ${round(start + dur - 0.3)});`);
  });

  // Phóng vào vùng chứng minh
  for (const z of s.zooms) {
    const zin = at(z.at, z.nth);
    const zout = z.until ? round(at(z.until) + (z.untilOffset ?? -0.9)) : round(T - 1.0);
    if (zout - zin < 1.2) continue;
    tl.push(`tl.set('#${s.id}-zoom', { transformOrigin: '${z.origin}' }, ${zin});`);
    tl.push(`tl.fromTo('#${s.id}-zoom', { scale: 1 }, { scale: ${z.scale}, duration: 0.8, ease: 'power2.inOut' }, ${zin});`);
    tl.push(`tl.to('#${s.id}-zoom', { scale: 1, duration: 0.6, ease: 'power2.inOut' }, ${zout});`);
  }

  // Thẻ mở đầu
  if (s.intro) {
    parts.push(`    <div id="${s.id}-intro" class="clip intro" data-start="0" data-duration="3.6" data-track-index="4"><div id="${s.id}-card" class="card"><h1>Bài tập · Xây dựng harness</h1><p>Chấm bài lập trình JavaScript · Gemini, Groq dự phòng</p></div></div>`);
    tl.push(`tl.fromTo('#${s.id}-card', { y: 24, opacity: 0 }, { y: 0, opacity: 1, duration: 0.5, ease: 'power3.out' }, 0);`);
    tl.push(`tl.to('#${s.id}-card', { opacity: 0, duration: 0.35, ease: 'power1.in' }, 3.2);`);
  }

  writeFileSync(
    `compositions/${s.id}.html`,
    `<template>
  <style>${CSS}</style>
  <div id="root" data-composition-id="${s.id}" data-width="1920" data-height="1080" data-duration="${T}">
    ${parts.join('\n')}
  </div>
  <script>
    const tl = gsap.timeline({ paused: true });
    ${tl.join('\n    ')}
    window.__timelines['${s.id}'] = tl;
  </script>
</template>
`,
  );
  built.push({ id: s.id, T, speed, recLen: round(recLen), voice: round(voice) });
}

// Cảnh kết: link repo
// Thẻ kết không có giọng đọc (đã bỏ s6.wav): giữ 4,5 s.
const endT = 4.5;
writeFileSync(
  'compositions/s6.html',
  `<template>
  <style>
    #root { position: absolute; inset: 0; background: #f4f6fb; font-family: Inter, sans-serif; display: flex; align-items: center; justify-content: center; }
    #s6-box { text-align: center; }
    #s6-url { font-weight: 900; font-size: 56px; color: #0f172a; letter-spacing: -0.02em; }
    #s6-rule { width: 120px; height: 6px; border-radius: 3px; background: #2563eb; margin: 28px auto; }
    #s6-sub { font-weight: 400; font-size: 30px; color: #475569; }
  </style>
  <div id="root" data-composition-id="s6" data-width="1920" data-height="1080" data-duration="${endT}">
    <div id="s6-box" class="clip" data-hold data-start="0" data-duration="${endT}" data-track-index="0">
      <div id="s6-url">github.com/LuongHaMinhVy/Harness</div>
      <div id="s6-rule"></div>
      <div id="s6-sub">Harness chấm bài · Vercel AI SDK · Gemini 2.5 Flash + Groq dự phòng</div>
    </div>
  </div>
  <script>
    const tl = gsap.timeline({ paused: true });
    tl.fromTo('#s6-url', { y: 28, opacity: 0 }, { y: 0, opacity: 1, duration: 0.6, ease: 'power3.out' }, 0.2);
    tl.fromTo('#s6-rule', { scaleX: 0 }, { scaleX: 1, duration: 0.5, ease: 'power2.out' }, 0.6);
    tl.fromTo('#s6-sub', { opacity: 0 }, { opacity: 1, duration: 0.5, ease: 'power1.out' }, 0.9);
    window.__timelines['s6'] = tl;
  </script>
</template>
`,
);
built.push({ id: 's6', T: endT });

// Gốc: các cảnh nối tiếp + giọng đọc
let t = 0;
const hosts = [];
const audios = [];
for (const b of built) {
  hosts.push(
    `      <div id="${b.id}" data-composition-id="${b.id}" data-composition-src="compositions/${b.id}.html" data-start="${round(t)}" data-duration="${b.T}" data-track-index="1" data-track-kind="graphics" data-width="1920" data-height="1080"></div>`,
  );
  if (voices[b.id]) audios.push(`      <audio id="vo-${b.id}" class="clip" src="assets/voice/${b.id}.wav" data-start="${round(t + LEAD)}" data-duration="${round(voices[b.id].duration_s)}" data-volume="1" data-track-index="2"></audio>`);
  t += b.T;
}
const total = round(t);
writeFileSync(
  'index.html',
  `<!doctype html>
<html lang="vi" data-resolution="landscape">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=1920, height=1080" />
    <script src="https://cdn.jsdelivr.net/npm/gsap@3.15.0/dist/gsap.min.js"></script>
    <style>
      * { margin: 0; padding: 0; box-sizing: border-box; }
      html, body { margin: 0; width: 1920px; height: 1080px; overflow: hidden; background: #f4f6fb; }
    </style>
  </head>
  <body>
    <div id="root" data-composition-id="main" data-start="0" data-duration="${total}" data-width="1920" data-height="1080">
${hosts.join('\n')}
${audios.join('\n')}
    </div>
    <script>
      window.__timelines = window.__timelines || {};
      window.__timelines['main'] = gsap.timeline({ paused: true });
    </script>
  </body>
</html>
`,
);

console.table(built);
console.log(`Tổng: ${total}s (${Math.floor(total / 60)}:${String(Math.round(total % 60)).padStart(2, '0')}) · bản quay: ${REC}`);
if (!existsSync('assets/voice/s1.wav')) console.warn('Thiếu giọng đọc — chạy node tts.mjs audio_request.json');
