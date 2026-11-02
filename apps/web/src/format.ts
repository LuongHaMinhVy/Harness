import type { Usage } from '@harness/shared/types';

export const money = (usd: number) => `$${usd < 0.01 ? usd.toFixed(6) : usd.toFixed(4)}`;
export const num = (n: number) => n.toLocaleString('en-US');

export function tokens(u: Usage): string {
  const cache = u.cached === null ? 'cache n/a' : `cache ${num(u.cached)} · ${u.input ? Math.round((u.cached / u.input) * 100) : 0}%`;
  return `in ${num(u.input)} (${cache}) · out ${num(u.output)}`;
}

export const json = (v: unknown) => JSON.stringify(v, null, 2) ?? 'undefined';
