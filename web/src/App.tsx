import { useEffect, useReducer, useState } from 'react';
import type { EventEnvelope, StateSnapshot } from '../../src/shared/events.js';
import { api, connectEvents } from './api.js';
import { useAction } from './hooks.js';
import { ChatPanel } from './components/ChatPanel.js';
import { EvalPanel } from './components/EvalPanel.js';
import { GradesTable } from './components/GradesTable.js';
import { LogPanel } from './components/LogPanel.js';
import { applyEnvelope, applySnapshot, initialUi, type UiState } from './uiState.js';

type Action =
  | { kind: 'snapshot'; snap: StateSnapshot }
  | { kind: 'envelope'; env: EventEnvelope }
  | { kind: 'connected'; value: boolean };

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

export function App() {
  const [ui, dispatch] = useReducer(uiReducer, initialUi);
  const [tab, setTab] = useState<Tab>('grade');
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(
    () =>
      connectEvents({
        onOpen: () => dispatch({ kind: 'connected', value: true }),
        onError: () => dispatch({ kind: 'connected', value: false }),
        onSnapshot: (snap) => dispatch({ kind: 'snapshot', snap }),
        onEnvelope: (env) => dispatch({ kind: 'envelope', env }),
      }),
    [],
  );

  const ask = useAction(api.ask, setNotice);
  const approve = useAction(api.approve, setNotice);
  const settings = useAction(api.settings, setNotice);
  const reset = useAction(api.reset, setNotice);
  const runEval = useAction(api.runEval, setNotice);

  const snap = ui.snap;
  return (
    <div className="app">
      <header className="topbar">
        <h1>Trợ lý chấm bài · sum-array</h1>
        <nav className="tabs" role="tablist">
          {TABS.map((t) => (
            <button
              key={t.id}
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
      </header>

      {notice && (
        <div className="notice" role="alert">
          {notice}
          <button className="link" onClick={() => setNotice(null)}>
            Đóng
          </button>
        </div>
      )}

      {!snap ? (
        <p className="empty">Đang kết nối tới server…</p>
      ) : tab === 'grade' ? (
        <main className="grade-layout">
          <ChatPanel
            snap={snap}
            onAsk={ask}
            onApprove={approve}
            onSettings={settings}
            onReset={reset}
          />
          <LogPanel turns={snap.turns} />
        </main>
      ) : tab === 'eval' ? (
        <EvalPanel evalState={snap.eval} busy={snap.busy} onRun={runEval} />
      ) : (
        <GradesTable version={ui.gradesVersion} />
      )}
    </div>
  );
}
