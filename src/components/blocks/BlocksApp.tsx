'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import { ConnectButton } from '@/components/hub/ConnectButton';
import { DeviceBar } from '@/components/hub/DeviceBar';
import { MonitorPanel } from '@/components/hub/MonitorPanel';
import { PlotterCard } from '@/components/hub/PlotterCard';
import { linkSummary, programSummary } from '@/components/hub/status';
import { useBlocksEditor } from '@/hooks/useBlocksEditor';
import { useHubRunner } from '@/hooks/useHubRunner';
import { saveProgramForEditor } from '@/hooks/useProgramRunner';
import { useStoredState } from '@/hooks/useStoredState';
import { PROJECT_NAME, PROJECT_STATUS, TRADEMARK_DISCLAIMER } from '@/lib/project';
import { CodeView } from './CodeView';

/** How long the page's introduction stays open after the page loads. */
const INTRO_OPEN_MS = 5000;

const VIEWS = ['blocks', 'python'] as const;
const OPEN_CLOSED = ['open', 'closed'] as const;

/**
 * Client-side root of /blocks: a full-window editor. The block area takes the space; the Python
 * opens beside it or fills the window (Blocks | Python), the Monitor and Plotter open in a drawer
 * at the bottom, and the device bar shows what is plugged in, with live values.
 */
export function BlocksApp() {
  const router = useRouter();
  const runner = useHubRunner({ liveDevices: true });
  const host = useRef<HTMLDivElement>(null);
  const editor = useBlocksEditor(host);
  const [copied, setCopied] = useState<'idle' | 'ok' | 'failed'>('idle');
  const [view, setView] = useStoredState('matpilot.blocks.view.v1', 'blocks', VIEWS);
  const [pythonPanel, setPythonPanel] = useStoredState(
    'matpilot.blocks.python-panel.v1',
    'closed',
    OPEN_CLOSED,
  );
  const [monitorPane, setMonitorPane] = useStoredState(
    'matpilot.blocks.monitor.v1',
    'closed',
    OPEN_CLOSED,
  );
  const [plotterPane, setPlotterPane] = useStoredState(
    'matpilot.blocks.plotter.v1',
    'closed',
    OPEN_CLOSED,
  );
  const intro = useIntro();
  const { connection, monitor } = runner;

  // What arrived while a pane was closed, for the badges on its toggle.
  const [seenLineId, setSeenLineId] = useState(0);
  const [seenPlotTime, setSeenPlotTime] = useState(0);
  const latestLineId = monitor.lines.at(-1)?.id ?? 0;
  const latestPlotTime = Math.max(0, ...monitor.series.map((s) => s.times.at(-1) ?? 0));
  const unread = monitor.lines.filter(
    (line) => line.id > seenLineId && (line.kind === 'out' || line.kind === 'error'),
  );
  const unreadErrors = unread.some((line) => line.kind === 'error');
  const newPlot = latestPlotTime > seenPlotTime;

  const ready = connection.link.status === 'ready';
  const running = connection.flags.userProgramRunning || connection.program.phase !== 'idle';
  const code = editor.program?.code ?? '';
  const problems = editor.program?.problems ?? [];
  const monitorOpen = monitorPane === 'open';
  const plotterOpen = plotterPane === 'open';
  const pythonOpen = view === 'blocks' && pythonPanel === 'open';

  const toggleMonitor = () => {
    if (monitorOpen) setSeenLineId(latestLineId);
    setMonitorPane(monitorOpen ? 'closed' : 'open');
  };
  const togglePlotter = () => {
    if (plotterOpen) setSeenPlotTime(latestPlotTime);
    setPlotterPane(plotterOpen ? 'closed' : 'open');
  };

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

  let statusText = programSummary(connection, runner.compiling);
  if (!statusText) {
    if (editor.status === 'loading') statusText = 'Loading the block editor…';
    else if (problems.length > 0) statusText = 'Fix the problems above to run the program.';
    else if (ready) statusText = 'Ready. Press Run to send the program to the hub.';
    else statusText = 'Connect a hub to run the program.';
  }

  const { link } = connection;
  const linkNotice =
    link.status === 'requesting' ||
    link.status === 'no-device-selected' ||
    link.status === 'error' ||
    (link.status === 'disconnected' && link.reason === 'lost')
      ? linkSummary(connection)
      : null;
  const lostWhileRunning =
    link.status === 'disconnected' && link.reason === 'lost' && link.programWasRunning;

  const pythonTools = (
    <div className="button-row">
      <button type="button" className="button button-small" onClick={copy} disabled={code === ''}>
        {copied === 'ok' ? 'Copied' : 'Copy'}
      </button>
      <button
        type="button"
        className="button button-small"
        onClick={openInPythonEditor}
        disabled={code === ''}
      >
        Edit as Python
      </button>
    </div>
  );

  return (
    <main className="studio" data-view={view}>
      <header className="studio-bar">
        <div className="studio-brand">
          <Link href="/" className="studio-home" title={`Back to ${PROJECT_NAME}`}>
            {PROJECT_NAME}
          </Link>
          <span className="status-pill">{PROJECT_STATUS}</span>
          <h1 className="studio-title">Blocks</h1>
          <button
            type="button"
            className="icon-button"
            aria-expanded={intro.open}
            aria-controls="studio-intro"
            onClick={intro.toggle}
            title={intro.open ? 'Hide the introduction' : 'Show the introduction'}
          >
            <Chevron up={intro.open} />
            <span className="visually-hidden">Introduction</span>
          </button>
        </div>

        <div className="segmented" role="group" aria-label="View">
          {VIEWS.map((option) => (
            <button
              key={option}
              type="button"
              className="segmented-option"
              aria-pressed={view === option}
              onClick={() => setView(option)}
              data-testid={`view-${option}`}
            >
              {option === 'blocks' ? 'Blocks' : 'Python'}
            </button>
          ))}
        </div>

        <div className="studio-actions">
          <button
            type="button"
            className="button button-small"
            onClick={() => {
              if (window.confirm('Replace all blocks with the starter program?')) editor.reset();
            }}
            disabled={editor.status !== 'ready' || running}
          >
            Start over
          </button>
          {running ? (
            <button type="button" className="button button-stop button-run" onClick={runner.stop}>
              <StopIcon />
              Stop
            </button>
          ) : (
            <button
              type="button"
              className="button button-primary button-run"
              onClick={() => runner.runSource(code)}
              disabled={!ready || runner.compiling || !editor.program || problems.length > 0}
              data-testid="run"
            >
              <PlayIcon />
              Run
            </button>
          )}
          <ConnectButton
            connection={connection}
            onConnect={runner.connect}
            onDisconnect={runner.disconnect}
          />
        </div>
      </header>

      <div
        id="studio-intro"
        className="studio-intro"
        data-open={intro.open}
        onPointerEnter={intro.hold}
        onPointerLeave={intro.release}
        onFocus={intro.hold}
        onBlur={intro.release}
      >
        <div className="studio-intro-inner">
          <p>
            Snap blocks together to program your hub. Put your motors and sensors in “set up”, build
            the program under “when the program starts”, and press <strong>Run</strong>. Each block
            is one Pybricks command; press <strong>Python</strong> to see the code it makes.
          </p>
          <p className="muted">
            <strong>Stop</strong> ends the program, and every motor stops with it. Leaving or
            disconnecting also stops it first. If the Bluetooth connection drops, the program keeps
            running on the hub: press the hub’s centre button to stop it. The bar above the blocks
            shows what is plugged into each port while no program runs.
          </p>
          <p className="studio-intro-legal">
            {TRADEMARK_DISCLAIMER} {PROJECT_NAME} is open-source software released under the MIT
            License. It runs entirely in your browser and sends nothing to any server.
          </p>
        </div>
      </div>

      <noscript>
        <p className="notice notice-error">This page needs JavaScript to be enabled.</p>
      </noscript>

      {(linkNotice ||
        connection.flags.batteryLow ||
        editor.status === 'failed' ||
        editor.restoredStarter ||
        copied === 'failed') && (
        <div className="studio-notices">
          {linkNotice && (
            <p
              className={
                link.status === 'error' || lostWhileRunning
                  ? 'notice notice-error'
                  : 'notice notice-warn'
              }
              role={link.status === 'error' || lostWhileRunning ? 'alert' : 'status'}
            >
              {linkNotice}
              {lostWhileRunning &&
                ' The program keeps running on the hub: press the hub’s centre button to stop it.'}
            </p>
          )}
          {connection.flags.batteryLow && (
            <p className="notice notice-warn" role="status">
              <strong>Battery low.</strong> Charge the hub soon; motors may behave differently.
            </p>
          )}
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
          {copied === 'failed' && (
            <p className="notice notice-warn" role="status">
              This browser would not copy automatically. Select the code and copy it instead.
            </p>
          )}
        </div>
      )}

      <DeviceBar live={runner.live} />

      <div className="studio-body" data-python-panel={pythonOpen ? 'open' : 'closed'}>
        <div className="studio-canvas">
          <div
            className="blocks-workspace"
            ref={host}
            data-testid="blocks-workspace"
            data-status={editor.status}
            inert={view === 'python'}
          />
          {view === 'python' && (
            <section className="studio-python-full" aria-labelledby="python-full-heading">
              <div className="studio-panel-header">
                <h2 id="python-full-heading">Python made from your blocks</h2>
                {pythonTools}
              </div>
              <CodeView code={code} errorLine={runner.compileError?.line ?? null} />
            </section>
          )}
        </div>
        {pythonOpen && (
          <aside className="studio-side" aria-labelledby="python-side-heading">
            <div className="studio-panel-header">
              <h2 id="python-side-heading">Python</h2>
              {pythonTools}
              <button
                type="button"
                className="icon-button"
                onClick={() => setPythonPanel('closed')}
                title="Close the Python panel"
              >
                <CloseIcon />
                <span className="visually-hidden">Close the Python panel</span>
              </button>
            </div>
            <CodeView code={code} errorLine={runner.compileError?.line ?? null} />
          </aside>
        )}
      </div>

      {(monitorOpen || plotterOpen) && (
        <div className="studio-drawer" data-panes={monitorOpen && plotterOpen ? 2 : 1}>
          {monitorOpen && (
            <MonitorPanel
              variant="pane"
              lines={monitor.lines}
              partial={monitor.partial}
              dropped={monitor.dropped}
              canSend={ready && running}
              onSend={runner.sendInput}
              onClear={runner.clearText}
              exportText={runner.exportText}
            />
          )}
          {plotterOpen && (
            <PlotterCard
              variant="pane"
              series={monitor.series}
              paused={monitor.plotPaused}
              onPausedChange={runner.setPlotPaused}
              onClear={runner.clearPlot}
            />
          )}
        </div>
      )}

      {(problems.length > 0 || runner.compileError) && (
        <div className="studio-problems">
          {problems.length > 0 && (
            <div className="notice notice-warn" data-testid="block-problems">
              <strong>Fix before running:</strong>
              <ul>
                {problems.map((problem, index) => (
                  <li key={`${problem.blockId ?? 'program'}-${index}`}>{problem.message}</li>
                ))}
              </ul>
            </div>
          )}
          {runner.compileError && (
            <p className="notice notice-error" role="alert" data-testid="compile-error">
              <strong>{runner.compileError.message}</strong>
              {runner.compileError.line !== null && ` near line ${runner.compileError.line}`}
            </p>
          )}
        </div>
      )}

      <footer className="studio-status">
        <p className="studio-status-text" data-testid="program-status" aria-live="polite">
          {statusText}
        </p>
        <div className="studio-toggles" role="group" aria-label="Panels">
          {view === 'blocks' && (
            <button
              type="button"
              className="toggle-button"
              aria-pressed={pythonOpen}
              onClick={() => setPythonPanel(pythonOpen ? 'closed' : 'open')}
              data-testid="toggle-python"
            >
              Python
            </button>
          )}
          <button
            type="button"
            className="toggle-button"
            aria-pressed={monitorOpen}
            onClick={toggleMonitor}
            data-testid="toggle-monitor"
          >
            Monitor
            {!monitorOpen && unread.length > 0 && (
              <span className={unreadErrors ? 'badge-count badge-count-error' : 'badge-count'}>
                {unread.length > 99 ? '99+' : unread.length}
                <span className="visually-hidden"> new lines</span>
              </span>
            )}
          </button>
          <button
            type="button"
            className="toggle-button"
            aria-pressed={plotterOpen}
            onClick={togglePlotter}
            data-testid="toggle-plotter"
          >
            Plotter
            {!plotterOpen && newPlot && (
              <span className="badge-dot">
                <span className="visually-hidden"> new values</span>
              </span>
            )}
          </button>
        </div>
      </footer>
    </main>
  );
}

/**
 * The introduction is open when the page loads and folds away after INTRO_OPEN_MS. While the
 * pointer or keyboard focus is in it, it waits; once the user opens or closes it with the chevron,
 * it stays as they left it.
 */
function useIntro() {
  const [open, setOpen] = useState(true);
  const [held, setHeld] = useState<'none' | 'hover' | 'user'>('none');
  useEffect(() => {
    if (held !== 'none' || !open) return;
    const timer = setTimeout(() => setOpen(false), INTRO_OPEN_MS);
    return () => clearTimeout(timer);
  }, [held, open]);
  return {
    open,
    toggle: () => {
      setHeld('user');
      setOpen((current) => !current);
    },
    hold: () => setHeld((current) => (current === 'user' ? current : 'hover')),
    release: () => setHeld((current) => (current === 'hover' ? 'none' : current)),
  };
}

function Chevron({ up }: { up: boolean }) {
  return (
    <svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true" focusable="false">
      <path
        d={up ? 'M4 10l4-4 4 4' : 'M4 6l4 4 4-4'}
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function CloseIcon() {
  return (
    <svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true" focusable="false">
      <path
        d="M4 4l8 8M12 4l-8 8"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
      />
    </svg>
  );
}

function PlayIcon() {
  return (
    <svg
      className="button-icon"
      viewBox="0 0 16 16"
      width="16"
      height="16"
      aria-hidden="true"
      focusable="false"
    >
      <path d="M5 3.5v9l7.5-4.5z" fill="currentColor" />
    </svg>
  );
}

function StopIcon() {
  return (
    <svg
      className="button-icon"
      viewBox="0 0 16 16"
      width="16"
      height="16"
      aria-hidden="true"
      focusable="false"
    >
      <rect x="4" y="4" width="8" height="8" rx="1" fill="currentColor" />
    </svg>
  );
}
