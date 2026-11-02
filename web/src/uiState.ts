// Trạng thái giao diện = snapshot từ server + các sự kiện SSE mới hơn snapshot.
// Thuần, không đụng DOM, để test được bằng vitest.
import type { EventEnvelope, StateSnapshot } from '../../src/shared/events.js';
import { reduce } from '../../src/shared/reduce.js';

export type UiState = { snap: StateSnapshot | null; connected: boolean; gradesVersion: number };

export const initialUi: UiState = { snap: null, connected: false, gradesVersion: 0 };

export function applySnapshot(ui: UiState, snap: StateSnapshot): UiState {
  return { ...ui, snap, gradesVersion: ui.gradesVersion + 1 };
}

export function applyEnvelope(ui: UiState, { seq, event }: EventEnvelope): UiState {
  if (!ui.snap || seq <= ui.snap.seq) return ui;
  const snap = { ...reduce(ui.snap, event), seq };
  const gradesVersion = event.type === 'grade-saved' ? ui.gradesVersion + 1 : ui.gradesVersion;
  return { ...ui, snap, gradesVersion };
}
