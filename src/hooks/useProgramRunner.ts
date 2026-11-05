'use client';

import { useCallback, useState } from 'react';
import { DEFAULT_PROGRAM_SOURCE, type ExampleProgram } from '@/lib/program/examples';
import { useHubRunner, type HubRunner } from './useHubRunner';

const SOURCE_STORAGE_KEY = 'matpilot.program.source.v1';
/** The id of the example loaded last, so the picker can say "(edited)" after a change. */
const EXAMPLE_STORAGE_KEY = 'matpilot.program.example.v1';

function readSaved(key: string): string | null {
  if (typeof window === 'undefined') return null;
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

function save(key: string, value: string | null): void {
  try {
    if (value === null) window.localStorage.removeItem(key);
    else window.localStorage.setItem(key, value);
  } catch {
    // Storage blocked or full: the value is simply not remembered.
  }
}

/**
 * Replaces the Program and Monitor page's saved program, for example with the Python made from
 * blocks. Returns false when the browser would not store it.
 */
export function saveProgramForEditor(source: string): boolean {
  try {
    window.localStorage.setItem(SOURCE_STORAGE_KEY, source);
    window.localStorage.removeItem(EXAMPLE_STORAGE_KEY);
    return true;
  } catch {
    return false;
  }
}

export interface ProgramRunner extends HubRunner {
  readonly source: string;
  readonly setSource: (source: string) => void;
  /** The example loaded last (it may have been edited since), or `null`. */
  readonly lastExampleId: string | null;
  readonly loadExample: (example: ExampleProgram) => void;
  /** Compiles and runs the program in the editor. */
  readonly run: () => void;
}

/** React binding for the Program and Monitor page. */
export function useProgramRunner(): ProgramRunner {
  const runner = useHubRunner();
  const [source, setSourceState] = useState(
    () => readSaved(SOURCE_STORAGE_KEY) ?? DEFAULT_PROGRAM_SOURCE,
  );
  const [lastExampleId, setLastExampleId] = useState(() => readSaved(EXAMPLE_STORAGE_KEY));

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
  const { runSource } = runner;
  const run = useCallback(() => runSource(source), [runSource, source]);

  return { ...runner, source, setSource, lastExampleId, loadExample, run };
}
