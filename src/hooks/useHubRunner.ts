'use client';

import { useCallback, useEffect, useState, useSyncExternalStore } from 'react';
import {
  HubConnection,
  INITIAL_CONNECTION_SNAPSHOT,
  type ConnectionSnapshot,
  type RunError,
} from '@/lib/ble/hub-connection';
import { formatLog } from '@/lib/monitor/log';
import { EMPTY_MONITOR_SNAPSHOT, MonitorStore, type MonitorSnapshot } from '@/lib/monitor/store';
import { DEFAULT_SOURCE_NAME, compilePython, type CompileError } from '@/lib/pybricks/compiler';
import { MAIN_MODULE_NAME, packMultiMpy, type ProgramModule } from '@/lib/pybricks/mpy';
import { useLiveDevices, type LiveDevices } from './useLiveDevices';

/**
 * The firmware stops a program only on the stop command, the hub's stop button (the centre button
 * on SPIKE Prime), or shutdown; never when Bluetooth drops. Cited at Pybricks v4.0.1:
 * https://github.com/pybricks/pybricks-micropython/blob/4104553405decb0384bcfb030fbfcb4b5a9854cc/lib/pbio/sys/program_stop.c#L73-L88
 * https://github.com/pybricks/pybricks-micropython/blob/4104553405decb0384bcfb030fbfcb4b5a9854cc/lib/pbio/platform/prime_hub/pbsysconfig.h#L12
 * A program can change or disable its stop button, so the message says "normally".
 */
const LOST_WHILE_RUNNING =
  'Connection lost. The program keeps running on the hub: press the hub’s centre button to stop it (that is the stop button unless the program changed it).';

function describeRunError(error: RunError): string {
  switch (error.kind) {
    case 'not-connected':
      return 'Connect to a hub first.';
    case 'busy':
      return 'A program is already running on the hub. Stop it first.';
    case 'too-big':
      return `The program is ${error.size} bytes; this hub accepts at most ${error.max}.`;
    case 'write-failed':
      return `Sending the program failed: ${error.detail}`;
  }
}

const getServerConnection = () => INITIAL_CONNECTION_SNAPSHOT;
const getServerMonitor = () => EMPTY_MONITOR_SNAPSHOT;

/** A Python file of a program in several files (ADR 0013); `module` is how the hub imports it. */
export interface SourceFile {
  readonly name: string;
  readonly module: string;
  readonly code: string;
}

/** A compile error, and the file it is in when the program has several. */
export type RunnerCompileError = CompileError & { readonly file: string | null };

export interface HubRunner {
  readonly connection: ConnectionSnapshot;
  readonly monitor: MonitorSnapshot;
  readonly compiling: boolean;
  readonly compileError: RunnerCompileError | null;
  /** Call from a click handler: the browser only opens its device picker on a user gesture. */
  readonly connect: () => void;
  readonly disconnect: () => void;
  /** Compiles the program, sends it to the hub, and starts it. */
  readonly runSource: (source: string) => void;
  /**
   * Compiles every file, sends them to the hub as one program, and starts it. The first file is
   * the one the hub runs (`__main__`).
   */
  readonly runFiles: (files: readonly SourceFile[]) => void;
  readonly stop: () => void;
  readonly sendInput: (text: string) => void;
  readonly clearText: () => void;
  readonly clearPlot: () => void;
  readonly setPlotPaused: (paused: boolean) => void;
  readonly exportText: (withTimes: boolean) => string;
  /** Live device values while the hub is idle; only when asked for (`liveDevices`). */
  readonly live: LiveDevices;
}

/**
 * React binding for running programs on a hub: the connection, the monitor and plotter, and
 * compile-then-run. Shared by the Program and Monitor page and the Blocks page.
 */
export function useHubRunner(options: { liveDevices?: boolean } = {}): HubRunner {
  const [hub] = useState(() => new HubConnection());
  const [store] = useState(() => new MonitorStore());
  const connection = useSyncExternalStore(hub.subscribe, hub.getSnapshot, getServerConnection);
  const monitor = useSyncExternalStore(store.subscribe, store.getSnapshot, getServerMonitor);
  const [compiling, setCompiling] = useState(false);
  const [compileError, setCompileError] = useState<RunnerCompileError | null>(null);

  useEffect(() => {
    const offOutput = hub.onOutput((bytes) => store.pushOutput(bytes));
    let previous = hub.getSnapshot();
    const offState = hub.subscribe((next) => {
      // The live device values reader (useLiveDevices) is not the user's program: no notes.
      if (!previous.flags.userProgramRunning && next.flags.userProgramRunning) {
        store.note('info', 'Program started.');
      }
      if (
        previous.flags.userProgramRunning &&
        !next.flags.userProgramRunning &&
        next.link.status === 'ready'
      ) {
        store.endOutput();
        store.note('info', 'Program stopped.');
      }
      if (previous.link.status === 'ready' && next.link.status === 'disconnected') {
        store.endOutput();
        if (next.link.reason === 'lost') {
          store.note(
            'error',
            next.link.programWasRunning ? LOST_WHILE_RUNNING : 'Connection lost.',
          );
        } else {
          store.note('info', 'Disconnected.');
        }
      }
      previous = next;
    });
    // Leaving the page stops a running program (best effort) and releases the hub.
    const onPageHide = () => hub.dispose();
    window.addEventListener('pagehide', onPageHide);
    return () => {
      window.removeEventListener('pagehide', onPageHide);
      offState();
      offOutput();
      hub.dispose();
    };
  }, [hub, store]);

  const runFiles = useCallback(
    (files: readonly SourceFile[]) => {
      void (async () => {
        setCompileError(null);
        setCompiling(true);
        const modules: ProgramModule[] = [];
        for (const file of files) {
          const outcome = await compilePython(file.code, { sourceName: file.name });
          if (!outcome.ok) {
            setCompiling(false);
            const several = files.length > 1;
            setCompileError({ ...outcome.error, file: several ? file.name : null });
            const where = outcome.error.line === null ? '' : ` (near line ${outcome.error.line})`;
            store.note(
              'error',
              `${several ? `${file.name}: ` : ''}${outcome.error.message}${where}`,
            );
            return;
          }
          modules.push({ name: file.module, mpy: outcome.mpy });
        }
        setCompiling(false);
        const result = await hub.run(packMultiMpy(modules));
        if (!result.ok) store.note('error', describeRunError(result.error));
      })();
    },
    [hub, store],
  );

  const runSource = useCallback(
    (source: string) =>
      runFiles([{ name: DEFAULT_SOURCE_NAME, module: MAIN_MODULE_NAME, code: source }]),
    [runFiles],
  );

  const connect = useCallback(() => {
    void hub.connect();
  }, [hub]);
  const disconnect = useCallback(() => {
    void hub.disconnect();
  }, [hub]);
  const stop = useCallback(() => {
    void hub.stop();
  }, [hub]);
  const sendInput = useCallback(
    (text: string) => {
      store.note('in', text);
      void hub.writeStdin(`${text}\n`);
    },
    [hub, store],
  );
  const clearText = useCallback(() => store.clearText(), [store]);
  const clearPlot = useCallback(() => store.clearPlot(), [store]);
  const setPlotPaused = useCallback((paused: boolean) => store.setPlotPaused(paused), [store]);
  const exportText = useCallback(
    (withTimes: boolean) => formatLog(store.getSnapshot().lines, withTimes),
    [store],
  );
  const live = useLiveDevices(hub, connection, compiling, options.liveDevices === true);

  return {
    connection,
    monitor,
    compiling,
    compileError,
    connect,
    disconnect,
    runSource,
    runFiles,
    stop,
    sendInput,
    clearText,
    clearPlot,
    setPlotPaused,
    exportText,
    live,
  };
}
