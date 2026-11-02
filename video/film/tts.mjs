// Tạo giọng đọc bằng Gemini TTS với API key của dự án: đọc GOOGLE_GENERATIVE_AI_API_KEY từ ../../.env lúc chạy
// (không in ra), chuyển thành GEMINI_API_KEY cho audio engine của HyperFrames.
//   node tts.mjs audio_request.json [--only tts]
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

const ENGINE = 'C:/Users/OS/.claude/skills/media-use/audio/scripts/audio.mjs';
const env = { ...process.env };
for (const line of readFileSync('../../.env', 'utf8').split(/\r?\n/)) {
  const m = line.match(/^\s*GOOGLE_GENERATIVE_AI_API_KEY\s*=\s*"?([^"#\s]+)"?/);
  if (m) env.GEMINI_API_KEY = m[1];
}
if (!env.GEMINI_API_KEY) throw new Error('Không thấy GOOGLE_GENERATIVE_AI_API_KEY trong .env');
const [request = 'audio_request.json', ...rest] = process.argv.slice(2);
const r = spawnSync(process.execPath, [ENGINE, '--request', request, '--hyperframes', '.', '--out', './audio_meta.json', '--only', 'tts', ...rest], { env, stdio: 'inherit' });
process.exit(r.status ?? 1);
