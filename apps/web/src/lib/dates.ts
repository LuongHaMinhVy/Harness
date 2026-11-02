// Định dạng thời gian, hạn nộp, thời lượng, điểm số cho giao diện (giờ địa phương của trình duyệt).

const pad = (n: number) => String(n).padStart(2, '0');

/** 05/11/2026 23:59 */
export function formatDateTime(ms: number): string {
  const d = new Date(ms);
  return `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/** Giá trị cho <input type="datetime-local">: "2026-11-05T23:59" (giờ địa phương). null → "". */
export function toDatetimeLocal(ms: number | null): string {
  if (ms === null) return '';
  const d = new Date(ms);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/** Ngược lại của toDatetimeLocal: chuỗi rỗng/sai → null. */
export function fromDatetimeLocal(value: string): number | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2}))?$/.exec(value.trim());
  if (!m) return null;
  const [, y, mo, d, h, mi, s] = m;
  const date = new Date(Number(y), Number(mo) - 1, Number(d), Number(h), Number(mi), Number(s ?? 0));
  return Number.isNaN(date.getTime()) ? null : date.getTime();
}

export const isOverdue = (dueAt: number | null, now: number) => dueAt !== null && now > dueAt;

/** "còn 3 ngày", "còn 5 giờ", "còn 12 phút", "đã quá hạn". */
export function relativeDue(dueAt: number, now: number): string {
  const left = dueAt - now;
  if (left < 0) return 'đã quá hạn';
  const minutes = Math.floor(left / 60_000);
  if (minutes < 60) return `còn ${minutes} phút`;
  const hours = Math.floor(minutes / 60);
  if (hours < 48) return `còn ${hours} giờ`;
  return `còn ${Math.floor(hours / 24)} ngày`;
}

/** 850ms, 12,3 giây, 2 phút 05 giây */
export function formatDuration(ms: number): string {
  if (ms < 1000) return `${Math.round(ms)}ms`;
  if (ms < 60_000) return `${(ms / 1000).toFixed(1).replace('.', ',')} giây`;
  const total = Math.round(ms / 1000);
  return `${Math.floor(total / 60)} phút ${pad(total % 60)} giây`;
}

/** 7.25 → "7,25"; null → "—". */
export function formatScore(score: number | null | undefined): string {
  if (score === null || score === undefined) return '—';
  return String(Math.round(score * 100) / 100).replace('.', ',');
}
