'use client';

import { useRouter } from 'next/navigation';
import { useRef, useState } from 'react';
import { HubCard } from '@/components/hub/HubCard';
import { MonitorPanel } from '@/components/hub/MonitorPanel';
import { PlotterCard } from '@/components/hub/PlotterCard';
import { programSummary } from '@/components/hub/status';
import { useBlocksEditor } from '@/hooks/useBlocksEditor';
import { useHubRunner } from '@/hooks/useHubRunner';
import { saveProgramForEditor } from '@/hooks/useProgramRunner';

/** Client-side root of /blocks. */
export function BlocksApp() {
  const router = useRouter();
  const runner = useHubRunner();
  const host = useRef<HTMLDivElement>(null);
  const editor = useBlocksEditor(host);
  const [copied, setCopied] = useState<'idle' | 'ok' | 'failed'>('idle');
  const { connection, monitor } = runner;
  const ready = connection.link.status === 'ready';
  const running = connection.flags.programRunning || connection.program.phase !== 'idle';
  const code = editor.program?.code ?? '';
  const problems = editor.program?.problems ?? [];
  const status = programSummary(connection, runner.compiling);

  const copy = () => {
    void (navigator.clipboard?.writeText(code) ?? Promise.reject(new Error('no clipboard'))).then(
      () => setCopied('ok'),
      () => setCopied('failed'),
    );
  };

  const openInPythonEditor = () => {
    const message =
      'Open this Python on the Program & Monitor page?\n\nIt replaces the program there. Your blocks stay here. Leaving this page disconnects the hub.';
    if (!window.confirm(message)) return;
    if (saveProgramForEditor(code)) router.push('/program');
  };

  let statusText = status;
  if (!statusText) {
    if (editor.status === 'loading') statusText = 'Loading the block editor…';
    else if (problems.length > 0) statusText = 'Fix the problems below to run the program.';
    else if (ready) statusText = 'Ready. Press Run to send the program to the hub.';
    else statusText = 'Connect to a hub to run the program.';
  }

  return (
    <>
      <HubCard
        connection={connection}
        onConnect={runner.connect}
        onDisconnect={runner.disconnect}
      />

      <section className="card" aria-labelledby="blocks-heading">
        <div className="card-header">
          <h2 id="blocks-heading">Blocks</h2>
          <div className="button-row">
            <button
              type="button"
              className="button"
              onClick={() => {
                if (window.confirm('Replace all blocks with the starter program?')) editor.reset();
              }}
              disabled={editor.status !== 'ready' || running}
            >
              Start over
            </button>
            {running ? (
              <button type="button" className="button button-stop" onClick={runner.stop}>
                Stop
              </button>
            ) : (
              <button
                type="button"
                className="button button-primary"
                onClick={() => runner.runSource(code)}
                disabled={!ready || runner.compiling || !editor.program || problems.length > 0}
                data-testid="run"
              >
                Run
              </button>
            )}
          </div>
        </div>

        {editor.status === 'failed' && (
          <p className="notice notice-error" role="alert">
            The block editor could not be loaded. Reload the page to try again.
          </p>
        )}
        {editor.restoredStarter && (
          <p className="notice notice-warn" role="status">
            Your saved blocks could not be opened, so the starter program is shown instead.
          </p>
        )}

        <div className="blocks-layout">
          <div
            className="blocks-workspace"
            ref={host}
            data-testid="blocks-workspace"
            data-status={editor.status}
          />
          <aside className="blocks-python" aria-labelledby="python-heading">
            <div className="blocks-python-header">
              <h3 id="python-heading">Python</h3>
              <div className="button-row">
                <button type="button" className="button" onClick={copy} disabled={code === ''}>
                  {copied === 'ok' ? 'Copied' : 'Copy'}
                </button>
                <button
                  type="button"
                  className="button"
                  onClick={openInPythonEditor}
                  disabled={code === ''}
                >
                  Edit as Python
                </button>
              </div>
            </div>
            {copied === 'failed' && (
              <p className="notice notice-warn" role="status">
                This browser would not copy automatically. Select the code and copy it instead.
              </p>
            )}
            <CodeView code={code} errorLine={runner.compileError?.line ?? null} />
          </aside>
        </div>

        <p className="muted program-status" data-testid="program-status" aria-live="polite">
          {statusText}
        </p>
        {problems.length > 0 && (
          <div className="notice notice-warn" data-testid="block-problems">
            <p>
              <strong>Fix before running:</strong>
            </p>
            <ul>
              {problems.map((problem, index) => (
                <li key={`${problem.blockId ?? 'program'}-${index}`}>{problem.message}</li>
              ))}
            </ul>
          </div>
        )}
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

/** Read-only Python with line numbers; the line of a compile error is marked. */
function CodeView({ code, errorLine }: { code: string; errorLine: number | null }) {
  const lines = code === '' ? [''] : code.replace(/\n$/, '').split('\n');
  return (
    <div className="code-view" data-testid="python-code">
      <pre className="code-gutter" aria-hidden="true">
        {lines.map((_, i) => (
          <span key={i} className={i + 1 === errorLine ? 'code-gutter-error' : undefined}>
            {i + 1}
            {'\n'}
          </span>
        ))}
      </pre>
      <pre className="code-text" tabIndex={0} aria-label="Python made from the blocks">
        {code}
      </pre>
    </div>
  );
}
