'use client';

import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { useProgramRunner } from '@/hooks/useProgramRunner';
import type { ConnectionSnapshot } from '@/lib/ble/hub-connection';
import { formatClock, type LogLine } from '@/lib/monitor/log';
import { EXAMPLE_PROGRAMS } from '@/lib/program/examples';
import { PlotterView } from './PlotterView';

const noopSubscribe = () => () => {};

/** False during the server render and hydration, true afterwards. */
function useMounted(): boolean {
  return useSyncExternalStore(
    noopSubscribe,
    () => true,
    () => false,
  );
}

function linkSummary(snapshot: ConnectionSnapshot): string {
  const { link } = snapshot;
  switch (link.status) {
    case 'idle':
      return 'Not connected.';
    case 'requesting':
      return 'Choose your hub in the browser’s device picker.';
    case 'no-device-selected':
      return 'No hub selected.';
    case 'connecting':
      return `Connecting to ${link.deviceName ?? 'the hub'}…`;
    case 'ready':
      return `Connected to ${link.hub.name ?? 'the hub'} · Pybricks ${link.hub.firmwareRevision}`;
    case 'disconnected':
      return link.reason === 'lost' ? 'Connection lost.' : 'Disconnected.';
    case 'error':
      return `${link.error.title}. ${link.error.message}`;
  }
}

function programSummary(snapshot: ConnectionSnapshot, compiling: boolean): string | null {
  if (compiling) return 'Compiling…';
  const { program } = snapshot;
  switch (program.phase) {
    case 'uploading':
      return `Sending to the hub… ${Math.round((program.sent / Math.max(1, program.total)) * 100)}%`;
    case 'starting':
      return 'Starting…';
    case 'running':
      return 'Running.';
    case 'stopping':
      return 'Stopping…';
    case 'idle':
      return null;
  }
}

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

/** Client-side root of /program. */
export function ProgramApp() {
  const mounted = useMounted();
  const runner = useProgramRunner();
  const { connection, monitor } = runner;
  const ready = connection.link.status === 'ready';
  const busyLink =
    connection.link.status === 'requesting' || connection.link.status === 'connecting';
  const running = connection.flags.programRunning || connection.program.phase !== 'idle';
  const status = programSummary(connection, runner.compiling);

  return (
    <>
      <section className="card" aria-labelledby="hub-heading">
        <div className="card-header">
          <h2 id="hub-heading">Hub</h2>
          {ready || connection.link.status === 'connecting' ? (
            <button type="button" className="button" onClick={runner.disconnect}>
              Disconnect
            </button>
          ) : (
            <button
              type="button"
              className="button button-primary"
              onClick={runner.connect}
              disabled={busyLink}
            >
              Connect to hub
            </button>
          )}
        </div>
        <p
          className={connection.link.status === 'error' ? 'notice notice-error' : 'muted'}
          data-testid="link-status"
          data-status={connection.link.status}
          aria-live="polite"
        >
          {linkSummary(connection)}
        </p>
        {connection.flags.batteryLow && (
          <p className="notice notice-warn" role="status">
            <strong>Battery low.</strong> Charge the hub soon; motors may behave differently.
          </p>
        )}
      </section>

      <section className="card" aria-labelledby="program-heading">
        <div className="card-header">
          <h2 id="program-heading">Program</h2>
          <div className="button-row">
            <ExamplePicker onPick={runner.setSource} disabled={running} />
            {running ? (
              <button type="button" className="button button-stop" onClick={runner.stop}>
                Stop
              </button>
            ) : (
              <button
                type="button"
                className="button button-primary"
                onClick={runner.run}
                disabled={!ready || runner.compiling}
                data-testid="run"
              >
                Run
              </button>
            )}
          </div>
        </div>
        {mounted ? (
          <CodeEditor
            value={runner.source}
            onChange={runner.setSource}
            errorLine={runner.compileError?.line ?? null}
          />
        ) : (
          <p className="muted">Loading the editor…</p>
        )}
        <p className="muted program-status" data-testid="program-status" aria-live="polite">
          {status ??
            (ready
              ? 'Ready. Press Run to send the program to the hub.'
              : 'Connect to a hub to run the program.')}
        </p>
        {runner.compileError && (
          <div className="notice notice-error" role="alert" data-testid="compile-error">
            <p>
              <strong>{runner.compileError.message}</strong>
              {runner.compileError.line !== null && ` near line ${runner.compileError.line}`}
            </p>
          </div>
        )}
      </section>

      <MonitorPanel
        lines={monitor.lines}
        partial={monitor.partial}
        dropped={monitor.dropped}
        canSend={ready && running}
        onSend={runner.sendInput}
        onClear={runner.clearText}
        exportText={runner.exportText}
      />

      <section className="card" aria-labelledby="plot-heading">
        <div className="card-header">
          <h2 id="plot-heading">Plotter</h2>
          <div className="button-row">
            <button
              type="button"
              className="button"
              onClick={() => runner.setPlotPaused(!monitor.plotPaused)}
              aria-pressed={monitor.plotPaused}
            >
              {monitor.plotPaused ? 'Resume' : 'Pause'}
            </button>
            <button type="button" className="button" onClick={runner.clearPlot}>
              Clear
            </button>
          </div>
        </div>
        <PlotterView series={monitor.series} />
      </section>
    </>
  );
}

function ExamplePicker({
  onPick,
  disabled,
}: {
  onPick: (source: string) => void;
  disabled: boolean;
}) {
  return (
    <select
      className="select"
      aria-label="Load an example program"
      value=""
      disabled={disabled}
      onChange={(event) => {
        const example = EXAMPLE_PROGRAMS.find((item) => item.id === event.target.value);
        if (!example) return;
        if (
          window.confirm(`Replace the program with “${example.title}”?\n\n${example.description}`)
        ) {
          onPick(example.source);
        }
      }}
    >
      <option value="">Examples…</option>
      {EXAMPLE_PROGRAMS.map((example) => (
        <option key={example.id} value={example.id}>
          {example.title}
        </option>
      ))}
    </select>
  );
}

function CodeEditor({
  value,
  onChange,
  errorLine,
}: {
  value: string;
  onChange: (value: string) => void;
  errorLine: number | null;
}) {
  const lineCount = value.split('\n').length;
  return (
    <div className="code-editor">
      <pre className="code-gutter" aria-hidden="true">
        {Array.from({ length: lineCount }, (_, i) => (
          <span key={i} className={i + 1 === errorLine ? 'code-gutter-error' : undefined}>
            {i + 1}
            {'\n'}
          </span>
        ))}
      </pre>
      <textarea
        className="code-input"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        onKeyDown={(event) => {
          if (event.key !== 'Tab' || event.shiftKey) return;
          // Tab inserts four spaces (Python indentation) instead of leaving the editor.
          event.preventDefault();
          const target = event.currentTarget;
          const { selectionStart, selectionEnd } = target;
          const next = `${value.slice(0, selectionStart)}    ${value.slice(selectionEnd)}`;
          onChange(next);
          requestAnimationFrame(() =>
            target.setSelectionRange(selectionStart + 4, selectionStart + 4),
          );
        }}
        spellCheck={false}
        autoCapitalize="off"
        autoCorrect="off"
        aria-label="Python program"
        data-testid="code"
        rows={Math.min(24, Math.max(10, lineCount + 1))}
      />
    </div>
  );
}

function MonitorPanel({
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
