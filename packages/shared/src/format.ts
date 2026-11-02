// Tóm tắt kết quả tool thành một dòng ngắn — dùng chung cho log CLI và log web để hai nơi luôn giống nhau.

export const MAX_SHOWN = 200;

export type ToolSummary = {
  text: string;
  tone: 'ok' | 'warn' | 'error';
  cache?: { hit: boolean; label: string };
};

export const clip = (s: string, max = MAX_SHOWN) => (s.length > max ? `${s.slice(0, max - 1)}…` : s);

type RunTestsOutput = {
  status?: string;
  passed?: number;
  total?: number;
  results?: { name: string; ok: boolean }[];
  timeoutMs?: number;
  message?: string;
  cached?: boolean;
  cacheKey?: string;
  durationMs?: number;
};

export function summarizeToolOutput(name: string, output: unknown): ToolSummary {
  if (output && typeof output === 'object' && 'error' in output) {
    const o = output as { error: string; message?: string };
    return { text: clip(`✖ ${name} → ${o.error}: ${o.message ?? ''}`), tone: 'error' };
  }
  if (name === 'run_tests' && output && typeof output === 'object') {
    const o = output as RunTestsOutput;
    const cache = o.cached
      ? { hit: true, label: `CACHE HIT (${o.cacheKey ?? ''}…)` }
      : { hit: false, label: `MISS · ${o.durationMs}ms` };
    if (o.status === 'timeout') return { text: `TIMEOUT ${(o.timeoutMs ?? 0) / 1000}s`, tone: 'error', cache };
    if (o.status === 'load_error') return { text: clip(`LOAD_ERROR: ${o.message}`), tone: 'error', cache };
    const failed = (o.results ?? []).filter((r) => !r.ok).map((r) => r.name);
    const detail = failed.length ? ` · trượt: ${failed.join(', ')}` : '';
    return { text: clip(`${o.passed}/${o.total} test đạt${detail}`), tone: failed.length ? 'warn' : 'ok', cache };
  }
  return { text: clip(JSON.stringify(output) ?? 'undefined'), tone: 'ok' };
}
