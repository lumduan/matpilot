'use client';

import { HubCard } from '@/components/hub/HubCard';
import { MonitorPanel } from '@/components/hub/MonitorPanel';
import { PlotterCard } from '@/components/hub/PlotterCard';
import { programSummary } from '@/components/hub/status';
import { useMounted } from '@/hooks/useMounted';
import { useProgramRunner } from '@/hooks/useProgramRunner';
import {
  EXAMPLE_PROGRAMS,
  describeExampleSelection,
  type ExampleProgram,
} from '@/lib/program/examples';

/** Client-side root of /program. */
export function ProgramApp() {
  const mounted = useMounted();
  const runner = useProgramRunner();
  const { connection, monitor } = runner;
  const ready = connection.link.status === 'ready';
  const running = connection.flags.programRunning || connection.program.phase !== 'idle';
  const status = programSummary(connection, runner.compiling);

  return (
    <>
      <HubCard
        connection={connection}
        onConnect={runner.connect}
        onDisconnect={runner.disconnect}
      />

      <section className="card" aria-labelledby="program-heading">
        <div className="card-header">
          <h2 id="program-heading">Program</h2>
          <div className="button-row">
            <ExamplePicker
              source={mounted ? runner.source : null}
              lastExampleId={runner.lastExampleId}
              onPick={runner.loadExample}
              disabled={running}
            />
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

      <PlotterCard
        series={monitor.series}
        paused={monitor.plotPaused}
        onPausedChange={runner.setPlotPaused}
        onClear={runner.clearPlot}
      />
    </>
  );
}

/** Value of the picker's entry for a program that is not an unchanged example. */
const OWN_PROGRAM = 'own';

function ExamplePicker({
  source,
  lastExampleId,
  onPick,
  disabled,
}: {
  /** `null` until the saved program has been read in the browser. */
  source: string | null;
  lastExampleId: string | null;
  onPick: (example: ExampleProgram) => void;
  disabled: boolean;
}) {
  const selection = source === null ? null : describeExampleSelection(source, lastExampleId);
  const current = selection?.current ?? null;
  let ownLabel = 'Examples…';
  if (selection?.editedFrom) ownLabel = `${selection.editedFrom.title} (edited)`;
  else if (selection) ownLabel = 'Your program';

  return (
    <select
      className="select"
      aria-label="Example program"
      value={current?.id ?? OWN_PROGRAM}
      disabled={disabled || selection === null}
      data-testid="example-picker"
      onChange={(event) => {
        const example = EXAMPLE_PROGRAMS.find((item) => item.id === event.target.value);
        if (!example) return;
        // Swapping one unchanged example for another loses nothing; ask only before
        // replacing a program the user wrote or edited.
        if (
          current ||
          window.confirm(`Replace your program with “${example.title}”?\n\n${example.description}`)
        ) {
          onPick(example);
        }
      }}
    >
      {!current && (
        <option value={OWN_PROGRAM} disabled>
          {ownLabel}
        </option>
      )}
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
