// Trang Harness của admin (giao diện trợ lý chấm bài cũ): hỏi tự do, log từng lượt, duyệt lưu điểm, bộ đánh giá.
// Trạng thái = snapshot SSE + sự kiện mới hơn, gộp bằng reducer dùng chung (uiState.ts).
import type { EventEnvelope, StateSnapshot } from '@harness/shared/events';
import { useEffect, useReducer, useState } from 'react';
import { connectHarnessEvents, harnessApi } from '../../api.js';
import { ChatPanel } from '../../components/ChatPanel.js';
import { EvalPanel } from '../../components/EvalPanel.js';
import { GradesTable } from '../../components/GradesTable.js';
import { LogPanel } from '../../components/LogPanel.js';
import { useAction } from '../../hooks.js';
import { applyEnvelope, applySnapshot, initialUi, type UiState } from '../../uiState.js';

type Action = { kind: 'snapshot'; snap: StateSnapshot } | { kind: 'envelope'; env: EventEnvelope } | { kind: 'connected'; value: boolean };

function uiReducer(ui: UiState, a: Action): UiState {
  switch (a.kind) {
    case 'snapshot':
      return applySnapshot(ui, a.snap);
    case 'envelope':
      return applyEnvelope(ui, a.env);
    case 'connected':
      return { ...ui, connected: a.value };
  }
}

type Tab = 'grade' | 'eval' | 'grades';
const TABS: { id: Tab; label: string }[] = [
  { id: 'grade', label: 'Chấm bài' },
  { id: 'eval', label: 'Đánh giá' },
  { id: 'grades', label: 'Bảng điểm' },
];

export function HarnessPage() {
  const [ui, dispatch] = useReducer(uiReducer, initialUi);
  const [tab, setTab] = useState<Tab>('grade');
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(
    () =>
      connectHarnessEvents({
        onOpen: () => dispatch({ kind: 'connected', value: true }),
        onError: () => dispatch({ kind: 'connected', value: false }),
        onSnapshot: (snap) => dispatch({ kind: 'snapshot', snap }),
        onEnvelope: (env) => dispatch({ kind: 'envelope', env }),
      }),
    [],
  );

  const ask = useAction(harnessApi.ask, setNotice);
  const approve = useAction(harnessApi.approve, setNotice);
  const settings = useAction(harnessApi.settings, setNotice);
  const reset = useAction(harnessApi.reset, setNotice);
  const runEval = useAction(harnessApi.runEval, setNotice);

  const snap = ui.snap;
  return (
    <div className="harness">
      <div className="harness-bar">
        <h1>Harness · trợ lý chấm bài</h1>
        <nav className="tabs" role="tablist">
          {TABS.map((t) => (
            <button
              key={t.id}
              type="button"
              role="tab"
              aria-selected={tab === t.id}
              className={tab === t.id ? 'tab active' : 'tab'}
              onClick={() => setTab(t.id)}
            >
              {t.label}
            </button>
          ))}
        </nav>
        <span className={ui.connected ? 'status online' : 'status offline'}>
          {ui.connected ? '●' : '○'} {snap?.model ?? '…'}
        </span>
      </div>

      {notice && (
        <div className="notice" role="alert">
          {notice}
          <button type="button" className="link" onClick={() => setNotice(null)}>
            Đóng
          </button>
        </div>
      )}

      {!snap ? (
        <p className="empty">Đang kết nối tới server…</p>
      ) : tab === 'grade' ? (
        <div className="grade-layout">
          <ChatPanel snap={snap} onAsk={ask} onApprove={approve} onSettings={settings} onReset={reset} />
          <LogPanel turns={snap.turns} />
        </div>
      ) : tab === 'eval' ? (
        <EvalPanel evalState={snap.eval} busy={snap.busy} onRun={runEval} />
      ) : (
        <GradesTable version={ui.gradesVersion} />
      )}
    </div>
  );
}
