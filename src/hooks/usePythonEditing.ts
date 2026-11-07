'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import type { PythonProblem, TextRange } from '@/lib/blocks/from-python/tab';
import type { ProgramNames } from '@/lib/blocks/from-python/vocabulary';
import type { PythonEditorHandle } from '@/lib/blocks/python-editor';
import { compilePython } from '@/lib/pybricks/compiler';
import type { BlocksEditor } from './useBlocksEditor';

/** How long after the last key press the Python is checked again. */
const CHECK_DELAY_MS = 300;

/** A problem with the line it is on, for the list under the editor. */
export interface ShownProblem extends PythonProblem {
  readonly line: number;
}

export interface PythonEditing {
  /** A tab's Python is being edited; its blocks are locked meanwhile. */
  readonly active: boolean;
  readonly fileName: string;
  readonly problems: readonly ShownProblem[];
  /** The Python changed and is about to be checked again. */
  readonly checking: boolean;
  /** Update blocks is compiling and turning the Python into blocks. */
  readonly updating: boolean;
  /** Someone tried to change a part that is made from the blocks. */
  readonly lockedHint: boolean;
  /** Where the editor goes (a callback ref). */
  readonly host: (element: HTMLDivElement | null) => void;
  readonly start: () => void;
  readonly cancel: () => void;
  readonly update: () => void;
  readonly reveal: (problem: ShownProblem) => void;
}

interface Session {
  readonly tabId: string;
  readonly fileName: string;
  readonly text: string;
  readonly editable: readonly TextRange[];
  readonly names: ProgramNames;
}

function withLines(text: string, problems: readonly PythonProblem[]): ShownProblem[] {
  return problems.map((problem) => ({
    ...problem,
    line: text.slice(0, problem.from).split('\n').length,
  }));
}

/** The text range of a 1-based line (the first line when the compiler did not say). */
function lineRange(text: string, line: number | null): TextRange {
  const lines = text.split('\n');
  const index = Math.min(Math.max((line ?? 1) - 1, 0), lines.length - 1);
  const from = lines.slice(0, index).reduce((sum, each) => sum + each.length + 1, 0);
  return { from, to: from + Math.max(lines[index]!.length, 1) };
}

const describe = (error: unknown) => (error instanceof Error ? error.message : String(error));

/**
 * Editing the open tab's Python on the Blocks page (ADR 0014): the editor and the converter
 * (both loaded when Edit is pressed), a check after every pause in typing, and Update blocks,
 * which compiles the Python with the hub's compiler and turns it into the tab's blocks, or shows
 * what is wrong and where.
 */
export function usePythonEditing(editor: BlocksEditor): PythonEditing {
  const { activeTab, pythonEdit, checkPython, applyPython, setLocked } = editor;
  const [session, setSession] = useState<Session | null>(null);
  const [hostElement, setHostElement] = useState<HTMLDivElement | null>(null);
  const [problems, setProblems] = useState<readonly ShownProblem[]>([]);
  const [checking, setChecking] = useState(false);
  const [updating, setUpdating] = useState(false);
  const [lockedHint, setLockedHint] = useState(false);
  const view = useRef<PythonEditorHandle | null>(null);
  const text = useRef('');
  const timer = useRef(0);
  // Each check gets a number; the answer to an older one is ignored.
  const checks = useRef(0);

  const show = useCallback((source: string, found: readonly PythonProblem[]) => {
    setProblems(withLines(source, found));
    view.current?.setProblems(found);
  }, []);

  // The editor itself, while a session is open and its place is on the page.
  useEffect(() => {
    if (!session || !hostElement) return;
    let disposed = false;
    const check = (source: string) => {
      checks.current += 1;
      const number = checks.current;
      checkPython(session.tabId, source).then(
        (found) => {
          if (disposed || number !== checks.current) return;
          setChecking(false);
          show(source, found);
        },
        (error: unknown) => console.error('The Python could not be checked.', error),
      );
    };
    import('@/lib/blocks/python-editor').then(
      ({ createPythonEditor }) => {
        if (disposed) return;
        text.current = session.text;
        view.current = createPythonEditor({
          host: hostElement,
          text: session.text,
          editable: session.editable,
          names: session.names,
          label: `Python: ${session.fileName}`,
          onChange: (source) => {
            text.current = source;
            setChecking(true);
            setLockedHint(false);
            window.clearTimeout(timer.current);
            timer.current = window.setTimeout(() => check(source), CHECK_DELAY_MS);
          },
          onLocked: () => setLockedHint(true),
        });
        check(session.text);
        view.current.focus();
      },
      (error: unknown) => {
        console.error('The Python editor failed to load.', error);
        if (!disposed) {
          show('', [
            {
              from: 0,
              to: 0,
              message: 'The Python editor could not be loaded. Reload the page to try again.',
            },
          ]);
        }
      },
    );
    return () => {
      disposed = true;
      window.clearTimeout(timer.current);
      view.current?.destroy();
      view.current = null;
    };
  }, [session, hostElement, checkPython, show]);

  const finish = useCallback(() => {
    checks.current += 1;
    setLocked(false);
    setSession(null);
    setProblems([]);
    setChecking(false);
    setLockedHint(false);
  }, [setLocked]);

  const start = useCallback(() => {
    setLocked(true);
    pythonEdit(activeTab).then(
      (edit) => {
        if (!edit) {
          setLocked(false);
          return;
        }
        setProblems([]);
        setLockedHint(false);
        setSession({
          tabId: edit.tabId,
          fileName: edit.fileName,
          text: edit.text,
          editable: edit.editable,
          names: edit.names,
        });
      },
      (error: unknown) => {
        console.error('The Python could not be opened for editing.', error);
        setLocked(false);
      },
    );
  }, [activeTab, pythonEdit, setLocked]);

  const update = useCallback(() => {
    if (!session || updating) return;
    const source = view.current?.text() ?? text.current;
    window.clearTimeout(timer.current);
    checks.current += 1;
    setChecking(false);
    setUpdating(true);
    const run = async () => {
      // The hub's own compiler first: what it refuses, the hub would refuse too.
      const compiled = await compilePython(source, { sourceName: session.fileName });
      if (!compiled.ok) {
        show(source, [
          {
            ...lineRange(source, compiled.error.line),
            message: `The hub’s compiler says: ${compiled.error.message}`,
          },
        ]);
        return;
      }
      const found = await applyPython(session.tabId, source);
      if (found.length > 0) show(source, found);
      else finish();
    };
    run()
      .catch((error: unknown) =>
        show(source, [
          { from: 0, to: 0, message: `The Python could not be checked: ${describe(error)}` },
        ]),
      )
      .finally(() => setUpdating(false));
  }, [session, updating, applyPython, finish, show]);

  const reveal = useCallback(
    (problem: ShownProblem) => view.current?.reveal(problem.from, problem.to),
    [],
  );

  return {
    active: session !== null,
    fileName: session?.fileName ?? '',
    problems,
    checking,
    updating,
    lockedHint,
    host: setHostElement,
    start,
    cancel: finish,
    update,
    reveal,
  };
}
