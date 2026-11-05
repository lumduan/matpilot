'use client';

import { useEffect, useRef, useState } from 'react';
import { formatClock, type LogLine } from '@/lib/monitor/log';

function downloadText(fileName: string, text: string): void {
  const url = URL.createObjectURL(new Blob([text], { type: 'text/plain;charset=utf-8' }));
  const link = document.createElement('a');
  link.href = url;
  link.download = fileName;
  link.style.display = 'none';
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

/** The text monitor: program output, notes, Copy / Save / Clear, and a stdin line. */
export function MonitorPanel({
  lines,
  partial,
  dropped,
  canSend,
  onSend,
  onClear,
  exportText,
}: {
  lines: readonly LogLine[];
  partial: string;
  dropped: number;
  canSend: boolean;
  onSend: (text: string) => void;
  onClear: () => void;
  exportText: (withTimes: boolean) => string;
}) {
  const [autoScroll, setAutoScroll] = useState(true);
  const [showTimes, setShowTimes] = useState(true);
  const [input, setInput] = useState('');
  const [copied, setCopied] = useState<'idle' | 'ok' | 'failed'>('idle');
  const outputRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const element = outputRef.current;
    if (autoScroll && element) element.scrollTop = element.scrollHeight;
  }, [lines, partial, autoScroll]);

  const copy = () => {
    const text = exportText(showTimes);
    void (navigator.clipboard?.writeText(text) ?? Promise.reject(new Error('no clipboard'))).then(
      () => setCopied('ok'),
      () => setCopied('failed'),
    );
  };

  return (
    <section className="card" aria-labelledby="monitor-heading">
      <div className="card-header">
        <h2 id="monitor-heading">Monitor</h2>
        <div className="button-row">
          <label className="check-label">
            <input
              type="checkbox"
              checked={autoScroll}
              onChange={(e) => setAutoScroll(e.target.checked)}
            />{' '}
            Auto-scroll
          </label>
          <label className="check-label">
            <input
              type="checkbox"
              checked={showTimes}
              onChange={(e) => setShowTimes(e.target.checked)}
            />{' '}
            Timestamps
          </label>
          <button type="button" className="button" onClick={copy}>
            Copy
          </button>
          <button
            type="button"
            className="button"
            onClick={() => downloadText('matpilot-monitor.txt', exportText(showTimes))}
          >
            Save .txt
          </button>
          <button type="button" className="button" onClick={onClear}>
            Clear
          </button>
        </div>
      </div>
      {copied === 'failed' && (
        <p className="notice notice-warn" role="status">
          This browser would not copy automatically. Use Save .txt instead.
        </p>
      )}
      <div
        className="monitor-output"
        ref={outputRef}
        role="log"
        aria-label="Program output"
        data-testid="monitor"
      >
        {dropped > 0 && (
          <div className="monitor-line monitor-info"># {dropped} older lines removed</div>
        )}
        {lines.length === 0 && partial === '' ? (
          <div className="monitor-line monitor-info"># Output from print() appears here.</div>
        ) : null}
        {lines.map((line) => (
          <div key={line.id} className={`monitor-line monitor-${line.kind}`}>
            {showTimes && <span className="monitor-time">{formatClock(line.time)}</span>}
            {line.kind === 'in' && '> '}
            {line.text}
          </div>
        ))}
        {partial !== '' && (
          <div className="monitor-line monitor-out monitor-partial">{partial}</div>
        )}
      </div>
      <form
        className="monitor-input"
        onSubmit={(event) => {
          event.preventDefault();
          if (!canSend || input === '') return;
          onSend(input);
          setInput('');
        }}
      >
        <input
          type="text"
          className="text-input"
          value={input}
          onChange={(event) => setInput(event.target.value)}
          placeholder={
            canSend ? 'Send a line to the program’s stdin' : 'Run a program to send input'
          }
          disabled={!canSend}
          aria-label="Input for the running program"
        />
        <button type="submit" className="button" disabled={!canSend || input === ''}>
          Send
        </button>
      </form>
    </section>
  );
}
