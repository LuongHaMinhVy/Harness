import { useEffect, useRef } from 'react';
import type { StepLog, Turn } from '@harness/shared/events';
import { clip, summarizeToolOutput } from '@harness/shared/format';
import { json, money, tokens } from '../format.js';

function Step({ step }: { step: StepLog }) {
  return (
    <div className="step">
      <div className="step-index">[lượt {step.index}]</div>
      <div className="step-body">
        {step.toolCalls.length === 0 && <div>💬 trả lời ({step.finishReason})</div>}
        {step.toolCalls.map((c, i) => {
          const s = summarizeToolOutput(c.name, c.output);
          return (
            <div key={i} className="call">
              <div>
                <span className="tool">🔧 {c.name}</span> <code>{clip(JSON.stringify(c.input), 120)}</code>
              </div>
              <div className={`result ${s.tone}`}>
                → {s.text}
                {s.cache && <span className={s.cache.hit ? 'badge hit' : 'badge'}>{s.cache.label}</span>}
              </div>
              <details>
                <summary>Chi tiết</summary>
                <pre>{json(c.input)}</pre>
                <pre>{json(c.output)}</pre>
              </details>
            </div>
          );
        })}
        <div className="tokens">
          {tokens(step.usage)} · {step.ms}ms
        </div>
      </div>
    </div>
  );
}

export function LogPanel({ turns }: { turns: Turn[] }) {
  const bottom = useRef<HTMLDivElement>(null);
  useEffect(() => {
    bottom.current?.scrollIntoView({ block: 'end' });
  }, [turns]);

  return (
    <section className="panel log" aria-label="Log từng lượt">
      <div className="scroll">
        {turns.length === 0 && <p className="empty">Log từng lượt (tool, input, kết quả, token, cache, chi phí) sẽ hiện ở đây.</p>}
        {turns.map((t) => (
          <div key={t.n} className="log-turn">
            <h3>
              Câu #{t.n}: "{clip(t.question, 80)}"
            </h3>
            {t.steps.map((s) => (
              <Step key={s.index} step={s} />
            ))}
            {t.summary?.hitLimit && (
              <div className="warn">
                ⚠ Đã dùng hết {t.summary.maxSteps}/{t.summary.maxSteps} lượt — câu trả lời dựa trên thông tin hiện có
              </div>
            )}
            {t.summary && (
              <div className="summary">
                ─ Tổng: {t.summary.steps} lượt · {tokens(t.summary)} · ≈ {money(t.summary.costUsd)} (quy đổi) ·{' '}
                {(t.summary.totalMs / 1000).toFixed(1)}s
              </div>
            )}
          </div>
        ))}
        <div ref={bottom} />
      </div>
    </section>
  );
}
