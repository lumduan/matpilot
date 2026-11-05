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
import { DEFAULT_PROGRAM_SOURCE, type ExampleProgram } from '@/lib/program/examples';
import { compilePython, type CompileError } from '@/lib/pybricks/compiler';
import { MAIN_MODULE_NAME, packMultiMpy } from '@/lib/pybricks/mpy';

const SOURCE_STORAGE_KEY = 'matpilot.program.source.v1';
/** The id of the example loaded last, so the picker can say "(edited)" after a change. */
const EXAMPLE_STORAGE_KEY = 'matpilot.program.example.v1';

/**
 * The firmware stops a program only on the stop command, the hub's stop button (the centre button
 * on SPIKE Prime), or shutdown; never when Bluetooth drops. Cited at Pybricks v4.0.1:
 * https://github.com/pybricks/pybricks-micropython/blob/4104553405decb0384bcfb030fbfcb4b5a9854cc/lib/pbio/sys/program_stop.c#L73-L88
 * https://github.com/pybricks/pybricks-micropython/blob/4104553405decb0384bcfb030fbfcb4b5a9854cc/lib/pbio/platform/prime_hub/pbsysconfig.h#L12
 * A program can change or disable its stop button, so the message says "normally".
 */
const LOST_WHILE_RUNNING =
  'Connection lost. The program keeps running on the hub: press the hub’s centre button to stop it (that is the stop button unless the program changed it).';

function readSaved(key: string): string | null {
  if (typeof window === 'undefined') return null;
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

function save(key: string, value: string): void {
  try {
    window.localStorage.setItem(key, value);
  } catch {
    // Storage blocked or full: the value is simply not remembered.
  }
}

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

export interface ProgramRunner {
  readonly connection: ConnectionSnapshot;
  readonly monitor: MonitorSnapshot;
  readonly source: string;
  readonly setSource: (source: string) => void;
  /** The example loaded last (it may have been edited since), or `null`. */
  readonly lastExampleId: string | null;
  readonly loadExample: (example: ExampleProgram) => void;
  readonly compiling: boolean;
  readonly compileError: CompileError | null;
  /** Call from a click handler: the browser only opens its device picker on a user gesture. */
  readonly connect: () => void;
  readonly disconnect: () => void;
  readonly run: () => void;
  readonly stop: () => void;
  readonly sendInput: (text: string) => void;
  readonly clearText: () => void;
  readonly clearPlot: () => void;
  readonly setPlotPaused: (paused: boolean) => void;
  readonly exportText: (withTimes: boolean) => string;
}

/** React binding for the Program and Monitor page. */
export function useProgramRunner(): ProgramRunner {
  const [hub] = useState(() => new HubConnection());
  const [store] = useState(() => new MonitorStore());
  const connection = useSyncExternalStore(hub.subscribe, hub.getSnapshot, getServerConnection);
  const monitor = useSyncExternalStore(store.subscribe, store.getSnapshot, getServerMonitor);
  const [source, setSourceState] = useState(
    () => readSaved(SOURCE_STORAGE_KEY) ?? DEFAULT_PROGRAM_SOURCE,
  );
  const [lastExampleId, setLastExampleId] = useState(() => readSaved(EXAMPLE_STORAGE_KEY));
  const [compiling, setCompiling] = useState(false);
  const [compileError, setCompileError] = useState<CompileError | null>(null);

  useEffect(() => {
    const offOutput = hub.onOutput((bytes) => store.pushOutput(bytes));
    let previous = hub.getSnapshot();
    const offState = hub.subscribe((next) => {
      if (!previous.flags.programRunning && next.flags.programRunning) {
        store.note('info', 'Program started.');
      }
      if (
        previous.flags.programRunning &&
        !next.flags.programRunning &&
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

  const setSource = useCallback((next: string) => {
    setSourceState(next);
    save(SOURCE_STORAGE_KEY, next);
  }, []);
  const loadExample = useCallback(
    (example: ExampleProgram) => {
      setSource(example.source);
      setLastExampleId(example.id);
      save(EXAMPLE_STORAGE_KEY, example.id);
    },
    [setSource],
  );

  const run = useCallback(() => {
    void (async () => {
      setCompileError(null);
      setCompiling(true);
      const outcome = await compilePython(source);
      setCompiling(false);
      if (!outcome.ok) {
        setCompileError(outcome.error);
        const where = outcome.error.line === null ? '' : ` (near line ${outcome.error.line})`;
        store.note('error', `${outcome.error.message}${where}`);
        return;
      }
      const program = packMultiMpy([{ name: MAIN_MODULE_NAME, mpy: outcome.mpy }]);
      const result = await hub.run(program);
      if (!result.ok) store.note('error', describeRunError(result.error));
    })();
  }, [hub, source, store]);

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

  return {
    connection,
    monitor,
    source,
    setSource,
    lastExampleId,
    loadExample,
    compiling,
    compileError,
    connect,
    disconnect,
    run,
    stop,
    sendInput,
    clearText,
    clearPlot,
    setPlotPaused,
    exportText,
  };
}
