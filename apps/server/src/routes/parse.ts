import type { Context } from 'hono';
import type { z } from 'zod';

// Đọc và kiểm tra body JSON bằng schema zod; sai thì trả 400 với thông báo ngắn, không lộ chi tiết nội bộ.
export async function parseJson<T extends z.ZodType>(c: Context, schema: T): Promise<z.infer<T> | Response> {
  let raw: unknown;
  try {
    raw = await c.req.json();
  } catch {
    return c.json({ error: 'Body không phải JSON hợp lệ' }, 400);
  }
  const parsed = schema.safeParse(raw);
  if (parsed.success) return parsed.data;
  const issues = parsed.error.issues.map((i) => ({ path: i.path.join('.'), message: i.message }));
  return c.json({ error: issues[0]?.message ?? 'Dữ liệu gửi lên không hợp lệ', issues }, 400);
}

// Tham số id trên URL: số nguyên dương, sai → null (route trả 404).
export function idParam(c: Context, name = 'id'): number | null {
  const n = Number(c.req.param(name));
  return Number.isInteger(n) && n > 0 ? n : null;
}
