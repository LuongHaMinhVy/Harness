import { useEffect, useRef, useState, type FormEvent, type KeyboardEvent } from 'react';
import type { StateSnapshot } from '../../../src/shared/events.js';
import { MAX_QUESTION_CHARS } from '../../../src/shared/types.js';
import { money } from '../format.js';
import { ApprovalCard } from './ApprovalCard.js';

type Props = {
  snap: StateSnapshot;
  onAsk: (question: string) => void;
  onApprove: (id: string, approved: boolean) => void;
  onSettings: (maxSteps: number) => void;
  onReset: () => void;
};

const STEP_OPTIONS = Array.from({ length: 20 }, (_, i) => i + 1);

export function ChatPanel({ snap, onAsk, onApprove, onSettings, onReset }: Props) {
  const [draft, setDraft] = useState('');
  const bottom = useRef<HTMLDivElement>(null);
  const last = snap.turns.at(-1);

  useEffect(() => bottom.current?.scrollIntoView({ block: 'end' }), [snap.turns]);

  const send = (e?: FormEvent) => {
    e?.preventDefault();
    const question = draft.trim();
    if (!question || snap.busy) return;
    onAsk(question);
    setDraft('');
  };
  // Enter để gửi, Shift+Enter để xuống dòng.
  const onKey = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) send(e);
  };

  return (
    <section className="panel chat" aria-label="Trò chuyện">
      <div className="scroll">
        {snap.turns.length === 0 && (
          <p className="empty">Thử hỏi: "Chấm bài của Nam", rồi "So với bài của Lan thì ai tốt hơn?"</p>
        )}
        {snap.turns.map((t) => (
          <article key={t.n} className="turn">
            <div className="bubble user">{t.question}</div>
            {t.approvals.map((a) => (
              <ApprovalCard key={a.id} approval={a} onDecide={onApprove} />
            ))}
            {t.answer !== undefined && <div className="bubble assistant">{t.answer}</div>}
            {t.error && (
              <div className="bubble error" role="alert">
                ✖ {t.error}
              </div>
            )}
          </article>
        ))}
        {snap.busyKind === 'ask' && last && last.answer === undefined && !last.error && (
          <p className="thinking">Đang xử lý…</p>
        )}
        <div ref={bottom} />
      </div>

      <form className="composer" onSubmit={send}>
        <textarea
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={onKey}
          maxLength={MAX_QUESTION_CHARS}
          placeholder={snap.busy ? 'Đang chạy, chờ một chút…' : 'Nhập câu hỏi (Enter để gửi, Shift+Enter xuống dòng)'}
          disabled={snap.busy}
          rows={2}
          aria-label="Câu hỏi"
        />
        <button type="submit" disabled={snap.busy || !draft.trim()}>
          Gửi
        </button>
      </form>

      <footer className="toolbar">
        <label>
          Lượt tối đa{' '}
          <select value={snap.maxSteps} onChange={(e) => onSettings(Number(e.target.value))}>
            {STEP_OPTIONS.map((n) => (
              <option key={n} value={n}>
                {n}
              </option>
            ))}
          </select>
        </label>
        <button className="secondary" onClick={onReset} disabled={snap.busy}>
          Xoá lịch sử
        </button>
        <span className="total">
          Tổng phiên: {snap.session.questions} câu · ≈ {money(snap.session.costUsd)} (quy đổi)
        </span>
      </footer>
    </section>
  );
}
