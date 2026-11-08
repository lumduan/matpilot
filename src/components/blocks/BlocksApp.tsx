'use client';

import dynamic from 'next/dynamic';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useMemo, useRef, useState } from 'react';
import { ConnectButton } from '@/components/hub/ConnectButton';
import { DeviceBar } from '@/components/hub/DeviceBar';
import { StudioNav } from '@/components/StudioNav';
import { MonitorPanel } from '@/components/hub/MonitorPanel';
import { PlotterCard } from '@/components/hub/PlotterCard';
import { linkSummary, programSummary } from '@/components/hub/status';
import { useBlocksEditor } from '@/hooks/useBlocksEditor';
import { useGitHub } from '@/hooks/useGitHub';
import { useHubRunner } from '@/hooks/useHubRunner';
import { useIncomingBlocks } from '@/hooks/useIncomingBlocks';
import { stepsToBlocks } from '@/lib/blocks/incoming';
import { useMounted } from '@/hooks/useMounted';
import { usePythonEditing } from '@/hooks/usePythonEditing';
import { saveProgramForEditor } from '@/hooks/useProgramRunner';
import { useStoredState } from '@/hooks/useStoredState';
import { hintsFromKey, hintsKey } from '@/lib/blocks/fields/hints';
import { PROJECT_NAME, PROJECT_STATUS } from '@/lib/project';
import { CodeView } from './CodeView';
import { ControllerPanel } from './ControllerPanel';
import { GitHubSettingsDialog } from './GitHubSettingsDialog';
import { LoadDialog } from './LoadDialog';
import { PythonEditPane } from './PythonEditPane';
import { RobotPicker } from './RobotPicker';
import { SaveDialog } from './SaveDialog';
import { TabBar } from './TabBar';

// The AI helper (ADR 0015) loads only when its panel opens.
const AiPanel = dynamic(() => import('./AiPanel').then((module) => module.AiPanel), {
  ssr: false,
  loading: () => (
    <aside className="studio-side ai-side" aria-busy="true">
      <p className="muted ai-loading">Loading the AI helper…</p>
    </aside>
  ),
});

/** How long a notice with Undo stays (after opening a program, closing a tab, ...). */
const NOTICE_MS = 12_000;

const VIEWS = ['blocks', 'python'] as const;
const OPEN_CLOSED = ['open', 'closed'] as const;

type DialogName = 'save' | 'load' | 'github';

const isMac = () => /Mac|iPhone|iPad/.test(navigator.platform);

/**
 * Client-side root of /blocks: a full-window editor. The block area takes the space; the Python
 * opens beside it or fills the window (Blocks | Python), the Monitor and Plotter open in a drawer
 * at the bottom, and the device bar shows what is plugged in, with live values.
 */
export function BlocksApp() {
  const router = useRouter();
  const runner = useHubRunner({ liveDevices: true });
  const host = useRef<HTMLDivElement>(null);
  // What is plugged into each port, for the port pickers; changes only when a device does.
  const portKey = hintsKey(runner.live.snapshot.reading);
  const portHints = useMemo(() => hintsFromKey(portKey), [portKey]);
  // A change to the program as a whole, with Undo: opened, started over, tab closed, moved.
  const [notice, setNotice] = useState<string | null>(null);
  const editor = useBlocksEditor(host, portHints, setNotice);
  const incoming = useIncomingBlocks();
  // Editing a tab's Python and turning it back into blocks (ADR 0014).
  const pythonEditing = usePythonEditing(editor);
  const editing = pythonEditing.active;
  const github = useGitHub();
  const [dialog, setDialog] = useState<{
    readonly name: DialogName;
    /** The dialog to go back to when GitHub settings close. */
    readonly back: DialogName | null;
  } | null>(null);
  // The Python file shown; it follows the open tab until another file is chosen.
  const [chosenFile, setChosenFile] = useState<{
    readonly name: string;
    readonly tab: string;
  } | null>(null);
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
  const [controllerPane, setControllerPane] = useStoredState(
    'matpilot.blocks.controller.v1',
    'closed',
    OPEN_CLOSED,
  );
  const [aiPane, setAiPane] = useStoredState('matpilot.blocks.ai.v1', 'closed', OPEN_CLOSED);
  // A line the AI helper pointed at, marked in the Python ("at" tells two presses apart).
  const [markedLine, setMarkedLine] = useState<{
    readonly file: string;
    readonly line: number;
    readonly at: number;
  } | null>(null);
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
  const files = editor.program?.files ?? [];
  const problems = editor.program?.problems ?? [];
  const loose = editor.program?.loose ?? [];
  const tabName = (id: string) => editor.tabs.find((tab) => tab.id === id)?.name ?? '';
  const mainTabId = editor.tabs[0]?.id ?? 'main';
  const activeFile = files.find((file) => file.tabId === editor.activeTab)?.name;
  const shownName =
    chosenFile && chosenFile.tab === editor.activeTab ? chosenFile.name : (activeFile ?? 'main.py');
  const shownFile = files.find((file) => file.name === shownName) ?? files[0];
  const code = shownFile?.code ?? '';
  const severalFiles = files.length > 1;
  const errorLine =
    runner.compileError && (runner.compileError.file ?? 'main.py') === shownFile?.name
      ? runner.compileError.line
      : null;
  const mark = markedLine && markedLine.file === shownFile?.name ? markedLine : null;
  const aiOpen = aiPane === 'open';
  const showLine = (line: number) => {
    if (view === 'blocks') setPythonPanel('open');
    setChosenFile(null);
    setMarkedLine({ file: activeFile ?? 'main.py', line, at: Date.now() });
  };
  const problemTabs = new Set(problems.map((problem) => problem.tabId));
  const monitorOpen = monitorPane === 'open';
  const plotterOpen = plotterPane === 'open';
  // The controller view is offered while the program uses the controller, or has reported it.
  const controllerOffered =
    (editor.program?.usesController ?? false) || monitor.controller.status !== 'idle';
  const controllerOpen = controllerOffered && controllerPane === 'open';
  const paneCount = [monitorOpen, plotterOpen, controllerOpen].filter(Boolean).length;
  const pythonOpen = view === 'blocks' && pythonPanel === 'open';
  const editorReady = editor.status === 'ready';
  // Shortcut names in tooltips; the server render cannot know the platform.
  const mac = useMounted() && isMac();
  const mod = mac ? '⌘' : 'Ctrl+';

  const openDialog = (name: DialogName) => setDialog({ name, back: null });
  const openGitHubSettings = () =>
    setDialog((current) => ({ name: 'github', back: current?.name ?? null }));
  const closeDialog = () =>
    setDialog((current) =>
      current?.name === 'github' && current.back ? { name: current.back, back: null } : null,
    );

  // A notice with Undo folds away by itself.
  useEffect(() => {
    if (!notice) return;
    const timer = setTimeout(() => setNotice(null), NOTICE_MS);
    return () => clearTimeout(timer);
  }, [notice]);

  // Ctrl+S (⌘S) saves and Ctrl+O (⌘O) loads, as in other editors. Blockly already handles
  // Ctrl+Z / Ctrl+Shift+Z when the blocks have focus.
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (!(event.ctrlKey || event.metaKey) || event.altKey || event.shiftKey) return;
      const key = event.key.toLowerCase();
      if (key !== 's' && key !== 'o') return;
      event.preventDefault();
      if (!editorReady || document.querySelector('dialog[open]')) return;
      if (key === 's') setDialog({ name: 'save', back: null });
      else if (!running && !editing) setDialog({ name: 'load', back: null });
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [editorReady, running, editing]);

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
    if (severalFiles) return;
    const message =
      'Open this Python on the Program & Monitor page?\n\nIt replaces the program there. Your blocks stay here. Leaving this page disconnects the hub.';
    if (!window.confirm(message)) return;
    if (saveProgramForEditor(code)) router.push('/program');
  };

  let statusText = programSummary(connection, runner.compiling);
  if (!statusText && editing) {
    statusText = `Editing ${pythonEditing.fileName}. Update blocks to keep it, or Cancel.`;
  }
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

  const pythonTools = editing ? (
    <div className="button-row">
      <button
        type="button"
        className="button button-small button-primary"
        onClick={pythonEditing.update}
        disabled={pythonEditing.updating}
        data-testid="python-update"
      >
        {pythonEditing.updating ? 'Updating…' : 'Update blocks'}
      </button>
      <button
        type="button"
        className="button button-small"
        onClick={pythonEditing.cancel}
        disabled={pythonEditing.updating}
        data-testid="python-cancel"
      >
        Cancel
      </button>
    </div>
  ) : (
    <div className="button-row">
      <button
        type="button"
        className="button button-small"
        onClick={pythonEditing.start}
        disabled={!editorReady || running}
        title="Edit this tab’s Python here, then turn it back into blocks"
        data-testid="python-edit"
      >
        Edit
      </button>
      <button
        type="button"
        className="button button-small"
        onClick={copy}
        disabled={code === ''}
        title={severalFiles ? `Copy ${shownFile?.name ?? 'this file'}` : 'Copy the Python'}
      >
        {copied === 'ok' ? 'Copied' : 'Copy'}
      </button>
      <button
        type="button"
        className="button button-small"
        onClick={openInPythonEditor}
        disabled={code === '' || severalFiles}
        title={
          severalFiles
            ? 'The Program page holds one file, and this program has several.'
            : 'Open this Python as text on the Program & Monitor page'
        }
      >
        Open in Program page
      </button>
    </div>
  );

  // The files the blocks make: one per tab with functions, and setup.py (ADR 0013).
  const pythonFiles = (
    <>
      {severalFiles && (
        <div className="python-files" role="tablist" aria-label="Python files">
          {files.map((file) => (
            <button
              key={file.name}
              type="button"
              role="tab"
              className="python-file"
              aria-selected={file.name === shownFile?.name}
              onClick={() => setChosenFile({ name: file.name, tab: editor.activeTab })}
              data-testid={`python-file-${file.name}`}
            >
              {file.name}
            </button>
          ))}
        </div>
      )}
      {editor.activeTab !== mainTabId && !activeFile && (
        <p className="python-note">
          The tab “{tabName(editor.activeTab)}” has no functions yet, so it makes no Python file.
          Add a “define” block from Functions.
        </p>
      )}
    </>
  );

  return (
    <main className="studio" data-view={view}>
      <header className="studio-bar">
        <div className="studio-brand">
          <Link href="/" className="studio-home" title={`Back to ${PROJECT_NAME}`}>
            {PROJECT_NAME}
          </Link>
          <span className="status-pill">{PROJECT_STATUS}</span>
          <StudioNav current="blocks" />
          <Link
            href="/docs/blocks"
            target="_blank"
            className="icon-button"
            title="How the Blocks page works (opens the guide in a new tab)"
            data-testid="blocks-help"
          >
            <HelpIcon />
            <span className="visually-hidden">Help: how the Blocks page works</span>
          </Link>
        </div>

        <div className="segmented" role="group" aria-label="View">
          {VIEWS.map((option) => (
            <button
              key={option}
              type="button"
              className="segmented-option"
              aria-pressed={view === option}
              onClick={() => setView(option)}
              disabled={editing}
              data-testid={`view-${option}`}
            >
              {option === 'blocks' ? 'Blocks' : 'Python'}
            </button>
          ))}
        </div>

        <div className="studio-actions">
          <button
            type="button"
            className="button button-small button-file"
            onClick={() => openDialog('load')}
            disabled={!editorReady || running || editing}
            title={`Load a program (${mod}O)`}
            data-testid="load"
          >
            <FolderIcon />
            <span className="button-text">Load</span>
          </button>
          <button
            type="button"
            className="button button-small button-file"
            onClick={() => openDialog('save')}
            disabled={!editorReady}
            title={`Save your program (${mod}S)`}
            data-testid="save"
          >
            <SaveIcon />
            <span className="button-text">Save</span>
          </button>
          <button
            type="button"
            className="button button-small button-file"
            onClick={() => {
              if (
                window.confirm(
                  'Start a new program from the starter blocks? Every tab is replaced. (Undo, right after, brings yours back.)',
                )
              ) {
                editor.reset();
                setNotice('Started a new program from the starter blocks.');
              }
            }}
            disabled={!editorReady || running || editing}
            title="Start a new program from the starter blocks"
            data-testid="start-over"
          >
            <NewIcon />
            <span className="button-text">Start over</span>
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
              onClick={() => {
                // Show the controller live while a controller program runs.
                if (editor.program?.usesController) setControllerPane('open');
                runner.runFiles(files);
              }}
              disabled={
                !ready || runner.compiling || !editor.program || problems.length > 0 || editing
              }
              data-testid="run"
            >
              <PlayIcon />
              Run
            </button>
          )}
          <ConnectButton
            connection={connection}
            onConnect={runner.connect}
            onConnectUsb={runner.usbAvailable ? runner.connectUsb : undefined}
            onDisconnect={runner.disconnect}
          />
        </div>
      </header>

      <noscript>
        <p className="notice notice-error">This page needs JavaScript to be enabled.</p>
      </noscript>

      {(linkNotice ||
        connection.flags.batteryLow ||
        editor.status === 'failed' ||
        editor.restoredStarter ||
        notice ||
        (incoming.incoming && editor.status === 'ready') ||
        copied === 'failed') && (
        <div className="studio-notices">
          {incoming.incoming && editor.status === 'ready' && (
            <p
              className="notice notice-ok notice-actions"
              role="status"
              data-testid="incoming-blocks"
            >
              <span>
                From the Mats page: the path “{incoming.incoming.name}”,{' '}
                {incoming.incoming.steps.length} block
                {incoming.incoming.steps.length === 1 ? '' : 's'} (turns and moves).
              </span>
              <button
                type="button"
                className="button button-small"
                onClick={() => {
                  const state = incoming.incoming && stepsToBlocks(incoming.incoming.steps);
                  if (state) editor.addToMain(state);
                  incoming.clear();
                }}
                data-testid="incoming-add"
              >
                Add at the end of main
              </button>
              <button
                type="button"
                className="button button-small"
                onClick={incoming.clear}
                data-testid="incoming-dismiss"
              >
                Dismiss
              </button>
            </p>
          )}
          {notice && (
            <p
              className="notice notice-ok notice-actions"
              role="status"
              data-testid="opened-notice"
            >
              <span>{notice}</span>
              <button
                type="button"
                className="button button-small"
                onClick={() => {
                  editor.undoProgramChange();
                  setNotice(null);
                }}
                data-testid="notice-undo"
              >
                Undo
              </button>
              <button
                type="button"
                className="icon-button"
                onClick={() => setNotice(null)}
                title="Hide"
              >
                <CloseIcon />
                <span className="visually-hidden">Hide</span>
              </button>
            </p>
          )}
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
          <TabBar
            tabs={editor.tabs}
            active={editor.activeTab}
            problemTabs={problemTabs}
            disabled={!editorReady || running || editing}
            // While a tab's Python is edited, the other tabs wait (Update blocks or Cancel first).
            onSelect={editing ? () => undefined : editor.selectTab}
            onAdd={editor.addTab}
            onRename={editor.renameTab}
            onClose={editor.closeTab}
            trailing={
              <RobotPicker
                robot={editor.meta.robot}
                drive={editor.program?.drive ?? null}
                disabled={!editorReady || running || editing}
                onChoose={(robot) => editor.setMeta({ ...editor.meta, robot })}
              />
            }
          />
          <div className="blocks-area">
            <div
              className="blocks-workspace"
              ref={host}
              data-testid="blocks-workspace"
              data-status={editor.status}
              inert={view === 'python'}
            />
            {view === 'blocks' && editorReady && !editing && (
              <div className="history-buttons" role="group" aria-label="Undo and redo">
                <button
                  type="button"
                  className="history-button"
                  onClick={editor.undo}
                  disabled={!editor.history.canUndo}
                  title={`Undo (${mod}Z)`}
                  data-testid="undo"
                >
                  <UndoIcon />
                  <span className="visually-hidden">Undo</span>
                </button>
                <button
                  type="button"
                  className="history-button"
                  onClick={editor.redo}
                  disabled={!editor.history.canRedo}
                  title={`Redo (${mod}${mac ? '⇧Z' : 'Y'})`}
                  data-testid="redo"
                >
                  <UndoIcon redo />
                  <span className="visually-hidden">Redo</span>
                </button>
              </div>
            )}
          </div>
          {view === 'python' && (
            <section className="studio-python-full" aria-labelledby="python-full-heading">
              <div className="studio-panel-header">
                <h2 id="python-full-heading">Python made from your blocks</h2>
                {pythonTools}
              </div>
              {editing ? (
                <PythonEditPane
                  host={pythonEditing.host}
                  problems={pythonEditing.problems}
                  checking={pythonEditing.checking}
                  lockedHint={pythonEditing.lockedHint}
                  onReveal={pythonEditing.reveal}
                />
              ) : (
                <>
                  {pythonFiles}
                  <CodeView
                    code={code}
                    errorLine={errorLine}
                    mark={mark}
                    label={shownFile ? `Python: ${shownFile.name}` : undefined}
                  />
                </>
              )}
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
                disabled={editing}
                title="Close the Python panel"
              >
                <CloseIcon />
                <span className="visually-hidden">Close the Python panel</span>
              </button>
            </div>
            {editing ? (
              <PythonEditPane
                host={pythonEditing.host}
                problems={pythonEditing.problems}
                checking={pythonEditing.checking}
                lockedHint={pythonEditing.lockedHint}
                onReveal={pythonEditing.reveal}
              />
            ) : (
              <>
                {pythonFiles}
                <CodeView
                  code={code}
                  errorLine={errorLine}
                  mark={mark}
                  label={shownFile ? `Python: ${shownFile.name}` : undefined}
                />
              </>
            )}
          </aside>
        )}
        {aiOpen && (
          <AiPanel
            files={files}
            openFile={activeFile ?? 'main.py'}
            tab={tabName(editor.activeTab) || 'main'}
            onShowLine={showLine}
            onClose={() => setAiPane('closed')}
          />
        )}
      </div>

      {paneCount > 0 && (
        <div className="studio-drawer" data-panes={paneCount}>
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
          {controllerOpen && (
            <ControllerPanel
              controller={monitor.controller}
              profileId={editor.program?.controller ?? null}
              controls={editor.program?.controls ?? []}
            />
          )}
        </div>
      )}

      {(problems.length > 0 || runner.compileError || loose.length > 0) && (
        <div className="studio-problems">
          {problems.length > 0 && (
            <div className="notice notice-warn" data-testid="block-problems">
              <strong>Fix before running:</strong>
              <ul>
                {problems.map((problem, index) => {
                  const where = editor.tabs.length > 1 ? `${tabName(problem.tabId)}: ` : '';
                  const blockId = problem.blockId;
                  return (
                    <li key={`${blockId ?? 'program'}-${index}`}>
                      {blockId ? (
                        <button
                          type="button"
                          className="problem-link"
                          onClick={() => editor.showBlock(problem.tabId, blockId)}
                          title="Show the block"
                        >
                          {where}
                          {problem.message}
                        </button>
                      ) : (
                        <>
                          {where}
                          {problem.message}
                        </>
                      )}
                    </li>
                  );
                })}
              </ul>
            </div>
          )}
          {loose.length > 0 && (
            <div className="notice" data-testid="loose-blocks">
              <strong>Not running (the faded blocks):</strong>
              <ul>
                {loose.map((note) => (
                  <li key={note.blockId ?? note.message}>
                    <button
                      type="button"
                      className="problem-link"
                      onClick={() => note.blockId && editor.showBlock(note.tabId, note.blockId)}
                      title="Show the block"
                    >
                      {editor.tabs.length > 1 ? `${tabName(note.tabId)}: ` : ''}
                      {note.message}
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          )}
          {runner.compileError && (
            <p className="notice notice-error" role="alert" data-testid="compile-error">
              {runner.compileError.file && `${runner.compileError.file}: `}
              <strong>{runner.compileError.message}</strong>
              {runner.compileError.line !== null && ` near line ${runner.compileError.line}`}
            </p>
          )}
        </div>
      )}

      {dialog?.name === 'save' && (
        <SaveDialog
          editor={editor}
          github={github}
          onClose={closeDialog}
          onSetUpGitHub={openGitHubSettings}
        />
      )}
      {dialog?.name === 'load' && (
        <LoadDialog
          editor={editor}
          github={github}
          onClose={closeDialog}
          onOpened={(message) => {
            setDialog(null);
            setNotice(message);
          }}
          onSetUpGitHub={openGitHubSettings}
        />
      )}
      {dialog?.name === 'github' && <GitHubSettingsDialog github={github} onClose={closeDialog} />}

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
              disabled={editing}
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
          <button
            type="button"
            className="toggle-button"
            aria-pressed={aiOpen}
            onClick={() => setAiPane(aiOpen ? 'closed' : 'open')}
            data-testid="toggle-ai"
          >
            AI helper
          </button>
          {controllerOffered && (
            <button
              type="button"
              className="toggle-button"
              aria-pressed={controllerOpen}
              onClick={() => setControllerPane(controllerOpen ? 'closed' : 'open')}
              data-testid="toggle-controller"
            >
              Controller
              {!controllerOpen && monitor.controller.status === 'connected' && (
                <span className="badge-dot">
                  <span className="visually-hidden"> connected</span>
                </span>
              )}
            </button>
          )}
        </div>
      </footer>
    </main>
  );
}

/** A question mark in a circle: help. */
function HelpIcon() {
  return (
    <svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true" focusable="false">
      <circle cx="8" cy="8" r="6.5" fill="none" stroke="currentColor" strokeWidth="1.5" />
      <path
        d="M6.2 6.3a1.9 1.9 0 0 1 3.7.6c0 1.3-1.9 1.6-1.9 2.8"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
      <circle cx="8" cy="11.6" r="0.9" fill="currentColor" />
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

function FolderIcon() {
  return (
    <svg
      className="button-icon"
      viewBox="0 0 16 16"
      width="16"
      height="16"
      aria-hidden="true"
      focusable="false"
    >
      <path
        d="M1.75 4.25v8a1 1 0 0 0 1 1h10.5a1 1 0 0 0 1-1v-6a1 1 0 0 0-1-1H8L6.5 3.25H2.75a1 1 0 0 0-1 1z"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function SaveIcon() {
  return (
    <svg
      className="button-icon"
      viewBox="0 0 16 16"
      width="16"
      height="16"
      aria-hidden="true"
      focusable="false"
    >
      <path
        d="M8 2v7.5M4.75 6.5 8 9.75l3.25-3.25M2.5 10.5v2a1 1 0 0 0 1 1h9a1 1 0 0 0 1-1v-2"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function NewIcon() {
  return (
    <svg
      className="button-icon"
      viewBox="0 0 16 16"
      width="16"
      height="16"
      aria-hidden="true"
      focusable="false"
    >
      <path
        d="M9.5 1.75H4a1 1 0 0 0-1 1v10.5a1 1 0 0 0 1 1h8a1 1 0 0 0 1-1V5.25zM9.5 1.75v3.5H13M8 7.5v4M6 9.5h4"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function UndoIcon({ redo = false }: { redo?: boolean }) {
  return (
    <svg
      viewBox="0 0 24 24"
      width="22"
      height="22"
      aria-hidden="true"
      focusable="false"
      style={redo ? { transform: 'scaleX(-1)' } : undefined}
    >
      <path
        d="M9 14 4 9l5-5M4 9h10.5a5.5 5.5 0 0 1 0 11H11"
        fill="none"
        stroke="currentColor"
        strokeWidth="2.2"
        strokeLinecap="round"
        strokeLinejoin="round"
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
