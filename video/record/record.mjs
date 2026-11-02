// Quay màn hình thật của web lớp học cho video nộp bài: Chrome headless 1920×1080 làm đúng kịch bản (video/SCRIPT.md),
// mỗi phần một file .webm + một file mốc thời gian (để ghép giọng đọc).
//   node record.mjs --base http://127.0.0.1:3002 --out out/real [--only s1,s2] [--password demo-12345]
// Chạy với `pnpm web:demo` (Gemini thật) hoặc `pnpm web:mock` (tập dượt, không tốn quota).
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { parseArgs } from 'node:util';
import puppeteer from 'puppeteer-core';

const { values: args } = parseArgs({
  options: {
    base: { type: 'string', default: 'http://127.0.0.1:3001' },
    out: { type: 'string', default: 'out/mock' },
    only: { type: 'string', default: 's1,s2,s3,s4,s5' },
    password: { type: 'string', default: 'demo-12345' },
    chrome: { type: 'string', default: 'C:/Program Files/Google/Chrome/Application/chrome.exe' },
    headful: { type: 'boolean', default: false },
  },
});
const BASE = args.base;
const OUT = resolve(args.out);
const ONLY = new Set(args.only.split(','));
mkdirSync(OUT, { recursive: true });

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// Con trỏ chuột vẽ trong trang (Chrome headless không quay con trỏ thật), có vòng sáng khi bấm.
const CURSOR = `
(() => {
  const install = () => {
    if (document.getElementById('__cursor')) return;
    const c = document.createElement('div');
    c.id = '__cursor';
    c.innerHTML = '<svg width="28" height="28" viewBox="0 0 28 28"><path d="M4 2 L4 22 L9.5 17 L13 25 L16.5 23.5 L13 15.8 L20.5 15.8 Z" fill="#111" stroke="#fff" stroke-width="1.6" stroke-linejoin="round"/></svg>';
    Object.assign(c.style, { position: 'fixed', left: '0', top: '0', zIndex: '2147483647', pointerEvents: 'none', transform: 'translate(-100px,-100px)', transition: 'none' });
    const ring = document.createElement('div');
    ring.id = '__ring';
    Object.assign(ring.style, { position: 'fixed', left: '0', top: '0', width: '36px', height: '36px', marginLeft: '-18px', marginTop: '-18px', borderRadius: '50%', border: '3px solid rgba(37,99,235,.85)', zIndex: '2147483646', pointerEvents: 'none', opacity: '0' });
    document.documentElement.append(ring, c);
    const pos = window.__cursorPos || { x: -100, y: -100 };
    c.style.transform = 'translate(' + pos.x + 'px,' + pos.y + 'px)';
    addEventListener('mousemove', (e) => { window.__cursorPos = { x: e.clientX, y: e.clientY }; c.style.transform = 'translate(' + e.clientX + 'px,' + e.clientY + 'px)'; }, true);
    addEventListener('mousedown', (e) => {
      ring.style.transform = 'translate(' + e.clientX + 'px,' + e.clientY + 'px) scale(.6)';
      ring.style.opacity = '1';
      ring.animate([{ transform: 'translate(' + e.clientX + 'px,' + e.clientY + 'px) scale(.6)', opacity: 1 }, { transform: 'translate(' + e.clientX + 'px,' + e.clientY + 'px) scale(1.4)', opacity: 0 }], { duration: 450, fill: 'forwards' });
    }, true);
  };
  if (document.readyState === 'loading') addEventListener('DOMContentLoaded', install); else install();
})();
`;

const browser = await puppeteer.launch({
  executablePath: args.chrome,
  headless: !args.headful,
  // Bố cục 1536×864 phóng 125% → hình 1920×1080, chữ đủ to để đọc trong video.
  defaultViewport: { width: 1536, height: 864, deviceScaleFactor: 1.25 },
  args: ['--window-size=1536,864', '--lang=vi-VN', '--force-color-profile=srgb', '--hide-scrollbars', '--disable-features=Translate'],
});
const page = await browser.newPage();
await page.emulateMediaFeatures([{ name: 'prefers-color-scheme', value: 'light' }]);
await page.evaluateOnNewDocument(CURSOR);
let mouse = { x: 768, y: 432 };

async function goto(path) {
  await page.goto(`${BASE}${path}`, { waitUntil: 'networkidle2' });
  await page.mouse.move(mouse.x, mouse.y);
}

// Tìm phần tử theo chữ hiển thị (nút, link, tab…), chờ tới khi có.
async function byText(text, { tag = 'button', within = 'body', timeout = 15000, exact = false } = {}) {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    const handles = await page.$$(`${within} ${tag}`);
    for (const h of handles) {
      const ok = await h.evaluate(
        (el, t, ex) => {
          const s = (el.innerText || el.value || '').trim();
          const visible = el.offsetParent !== null || el.getClientRects().length > 0;
          return visible && !el.disabled && (ex ? s === t : s.includes(t));
        },
        text,
        exact,
      );
      if (ok) return h;
    }
    await sleep(200);
  }
  throw new Error(`Không thấy ${tag} "${text}"`);
}

async function moveTo(handle) {
  await handle.evaluate((el) => el.scrollIntoView({ block: 'nearest', behavior: 'instant' }));
  const box = await handle.boundingBox();
  const x = box.x + box.width / 2;
  const y = box.y + box.height / 2;
  const steps = Math.max(12, Math.min(40, Math.round(Math.hypot(x - mouse.x, y - mouse.y) / 25)));
  await page.mouse.move(x, y, { steps });
  mouse = { x, y };
  await sleep(180);
}

async function click(handle, pause = 400) {
  await moveTo(handle);
  await page.mouse.down();
  await sleep(70);
  await page.mouse.up();
  await sleep(pause);
}

async function typeInto(handle, text, delay = 55) {
  await click(handle, 150);
  await page.keyboard.type(text, { delay });
}

async function login(username) {
  await goto('/dang-nhap');
  await sleep(600);
  const [user, pass] = await page.$$('form input');
  await typeInto(user, username, 70);
  await typeInto(pass, args.password, 40);
  await click(await byText('Đăng nhập'), 200);
  await page.waitForFunction(() => !location.pathname.startsWith('/dang-nhap'), { timeout: 15000 });
  await page.waitForNetworkIdle({ idleTime: 400 }).catch(() => {});
  await sleep(900);
}

async function logout() {
  await click(await byText('Đăng xuất'), 300);
  await page.waitForFunction(() => location.pathname.startsWith('/dang-nhap'), { timeout: 10000 });
}

const api = (path, init) =>
  page.evaluate(
    async (p, i) => {
      const r = await fetch(p, i ? { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(i) } : undefined);
      return r.json().catch(() => null);
    },
    path,
    init,
  );

// Một phần của video = một file quay + mốc thời gian (giây tính từ đầu file).
async function segment(name, fn) {
  if (!ONLY.has(name)) return;
  console.log(`▶ ${name}`);
  const marks = [];
  const recorder = await page.screencast({ path: `${OUT}/${name}.webm`, fps: 30, quality: 18, scale: 1.25 });
  const t0 = Date.now();
  const mark = (label, extra = {}) => {
    const t = (Date.now() - t0) / 1000;
    marks.push({ t, label, ...extra });
    console.log(`  ${t.toFixed(1)}s ${label}`, Object.keys(extra).length ? JSON.stringify(extra) : '');
  };
  try {
    await sleep(800);
    await fn(mark);
    await sleep(1800);
  } finally {
    mark('end');
    await recorder.stop();
    writeFileSync(`${OUT}/${name}.json`, JSON.stringify(marks, null, 2));
  }
}

// Trang Harness: gửi câu hỏi, chờ chạy xong; gặp thẻ duyệt điểm thì để người xem đọc rồi bấm Duyệt.
async function ask(mark, question, { approve = true } = {}) {
  const box = await page.$('form.composer textarea');
  await typeInto(box, question);
  await sleep(300);
  await page.keyboard.press('Enter');
  mark('ask', { question });
  let seen = 0;
  const approved = new Set();
  for (let i = 0; i < 1200; i++) {
    const st = await api('/api/admin/harness/state');
    const turn = st?.turns?.at(-1);
    const steps = turn?.steps?.length ?? 0;
    if (steps > seen) {
      for (let k = seen; k < steps; k++) mark('step', { n: k + 1, tools: turn.steps[k].toolCalls.map((c) => c.name) });
      seen = steps;
    }
    const pending = turn?.approvals?.find((a) => a.status === 'pending' && !approved.has(a.id));
    if (pending) {
      approved.add(pending.id);
      mark('approval', { student: pending.student, score: pending.score });
      await sleep(3500);
      const btn = await byText(approve ? 'Duyệt' : 'Từ chối', { within: '.approval-actions' });
      await click(btn, 300);
      mark(approve ? 'approved' : 'rejected');
    }
    if (st && !st.busy && turn && (turn.answer || turn.error)) {
      mark('answer', { summary: turn.summary ?? null, error: turn.error ?? null });
      return turn;
    }
    await sleep(250);
  }
  throw new Error(`Hết giờ chờ câu "${question}"`);
}

async function setMaxSteps(n) {
  const select = await page.$('footer.toolbar select');
  await click(select, 200);
  await page.select('footer.toolbar select', String(n));
  await page.keyboard.press('Escape').catch(() => {});
  await sleep(600);
}

async function scrollLogToBottom() {
  await page.evaluate(() => document.querySelectorAll('.scroll').forEach((el) => el.scrollTo({ top: el.scrollHeight, behavior: 'smooth' })));
  await sleep(900);
}

// ---------------------------------------------------------------- kịch bản

const results = {};

await segment('s1', async (mark) => {
  await login('gv.demo');
  mark('teacher-home');
  await sleep(2500);
  await click(await byText('Đề bài', { tag: 'a' }));
  await sleep(1500);
  await click(await byText('Tính tổng mảng', { tag: 'a' }));
  mark('submissions');
  await sleep(5000);
  const rows = await page.$$('table tbody tr');
  if (rows[0]) await moveTo(rows[0]);
  await sleep(4000);
  await logout();
  await login('admin');
  await click(await byText('Harness', { tag: 'a' }));
  mark('harness');
  await api('/api/admin/harness/reset', {});
  await page.reload({ waitUntil: 'networkidle2' });
  await sleep(4000);
});

await segment('s2', async (mark) => {
  if (!page.url().includes('/admin/harness')) {
    await login('admin');
    await goto('/admin/harness');
    await api('/api/admin/harness/reset', {});
    await page.reload({ waitUntil: 'networkidle2' });
  }
  await setMaxSteps(6);
  results.s2 = await ask(mark, 'Chấm bài của Nam');
  await scrollLogToBottom();
  await sleep(5000);
});

await segment('s3', async (mark) => {
  results.s3 = await ask(mark, 'So với bài của Lan thì ai tốt hơn?');
  await scrollLogToBottom();
  await sleep(5000);
});

await segment('s4', async (mark) => {
  results.s4a = await ask(mark, 'Chấm bài của Tuấn');
  await scrollLogToBottom();
  await sleep(4000);
  await setMaxSteps(2);
  mark('max-steps-2');
  results.s4b = await ask(mark, 'Chấm bài của Minh');
  await scrollLogToBottom();
  await sleep(5000);
  await setMaxSteps(6);
});

await segment('s5', async (mark) => {
  if (page.url().includes('/admin')) await logout();
  // Học viên An nộp lại bài (có câu "dụ" AI)
  await login('an');
  mark('student-home');
  await click(await byText('Tính tổng mảng', { tag: 'a' }));
  await sleep(1500);
  const [fileInput] = await page.$$('input[type=file]');
  await moveTo(await byText('Chọn file'));
  await fileInput.uploadFile(resolve('fixtures/an-v2/index.js'));
  await sleep(1500);
  await click(await byText('Nộp bài'));
  mark('submitted');
  await sleep(3000);
  await logout();
  // Giảng viên chấm bài của An
  await login('gv.demo');
  await click(await byText('Đề bài', { tag: 'a' }));
  await click(await byText('Tính tổng mảng', { tag: 'a' }));
  await sleep(1500);
  const anRow = await page.waitForSelector('xpath///tr[.//*[normalize-space()="an"]]');
  await click(await anRow.$('xpath/.//button[normalize-space()="Chấm"]'));
  mark('grade-clicked');
  await page.waitForFunction(() => /Đã chấm|Lỗi/.test([...document.querySelectorAll('tr')].find((r) => /\ban\b/.test(r.innerText))?.innerText ?? ''), {
    timeout: 240000,
    polling: 500,
  });
  mark('graded');
  await sleep(2000);
  await click(await anRow.$('xpath/.//a[normalize-space()="Xem"]'));
  await sleep(2500);
  mark('detail');
  const flags = await page.$('.flags, .flag, [class*=flag]');
  if (flags) await moveTo(flags);
  await sleep(5000);
  const score = await page.$('input.score-input');
  await moveTo(score);
  await click(score, 100);
  await page.keyboard.down('Control');
  await page.keyboard.press('KeyA');
  await page.keyboard.up('Control');
  await page.keyboard.type('2', { delay: 120 });
  await sleep(800);
  await click(await byText('Duyệt điểm'));
  mark('approved');
  await sleep(3000);
  await logout();
  // Học viên thấy điểm chính thức
  await login('an');
  await click(await byText('Tính tổng mảng', { tag: 'a' }));
  mark('student-grade');
  await sleep(6000);
});

writeFileSync(`${OUT}/results.json`, JSON.stringify(results, null, 2));
await browser.close();
console.log(`Xong → ${OUT}`);
