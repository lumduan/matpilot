'use client';

import { useCallback, useEffect, useRef, useState, type RefObject } from 'react';
import type { EditorHandle, EditorHistory } from '@/lib/blocks/editor';
import type { PortHints } from '@/lib/blocks/fields/hints';
import type { GeneratedProgram } from '@/lib/blocks/generator';
import {
  parseProgramFile,
  programFileName,
  serializeProgramFile,
  type ProgramFile,
} from '@/lib/blocks/program-file';
import {
  NEW_PROGRAM_META,
  parseProgramMeta,
  type GitHubLink,
  type ProgramMeta,
} from '@/lib/blocks/program-meta';

const WORKSPACE_STORAGE_KEY = 'matpilot.blocks.workspace.v1';
const META_STORAGE_KEY = 'matpilot.blocks.program.v1';

function readSavedMeta(): ProgramMeta {
  try {
    const saved = window.localStorage.getItem(META_STORAGE_KEY);
    return saved === null ? NEW_PROGRAM_META : parseProgramMeta(JSON.parse(saved));
  } catch {
    return NEW_PROGRAM_META;
  }
}

function saveMeta(meta: ProgramMeta): void {
  try {
    window.localStorage.setItem(META_STORAGE_KEY, JSON.stringify(meta));
  } catch {
    // Not remembered; the page still works.
  }
}

/** Saves `text` as a file through the browser's download, usually into Downloads. */
function downloadTextFile(fileName: string, text: string): void {
  const url = URL.createObjectURL(new Blob([text], { type: 'application/json' }));
  const link = document.createElement('a');
  link.href = url;
  link.download = fileName;
  link.rel = 'noopener';
  document.body.append(link);
  link.click();
  link.remove();
  // Some browsers read the URL after click() returns.
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

function readSavedWorkspace(): object | null {
  try {
    const saved = window.localStorage.getItem(WORKSPACE_STORAGE_KEY);
    return saved === null ? null : (JSON.parse(saved) as object);
  } catch {
    return null;
  }
}

function saveWorkspace(state: object): void {
  try {
    window.localStorage.setItem(WORKSPACE_STORAGE_KEY, JSON.stringify(state));
  } catch {
    // Storage blocked or full: the blocks are simply not remembered.
  }
}

export type BlocksEditorStatus = 'loading' | 'ready' | 'failed';

export type OpenResult =
  | { readonly ok: true; readonly file: ProgramFile }
  | { readonly ok: false; readonly message: string };

export interface BlocksEditor {
  readonly status: BlocksEditorStatus;
  /** The Python made from the blocks, and anything to fix before it can run. */
  readonly program: GeneratedProgram | null;
  /** `true` when the saved blocks could not be loaded and the starter program was used. */
  readonly restoredStarter: boolean;
  /** The program's name, and the GitHub file it came from or was saved to. */
  readonly meta: ProgramMeta;
  readonly history: EditorHistory;
  readonly undo: () => void;
  readonly redo: () => void;
  /** Starts a new program from the starter blocks (Undo brings the old one back). */
  readonly reset: () => void;
  /** The program as the text of a file (ADR 0011). */
  readonly fileText: (name: string, savedBy: string) => string;
  /** Downloads the program as `<name>.matpilot.json`; returns the file name. */
  readonly saveToComputer: (name: string, savedBy: string) => string;
  /** Opens a program file's text (Undo brings the old program back). */
  readonly openFile: (text: string, fileName: string, github: GitHubLink | null) => OpenResult;
  /** Records a new name or GitHub file after saving. */
  readonly setMeta: (meta: ProgramMeta) => void;
}

/**
 * React binding for the block editor (src/lib/blocks/editor.ts). Blockly is loaded only in the
 * browser, after the page has rendered; the workspace is saved in this browser after every change.
 * `hints` (what the hub says is plugged into each port) go to the port pickers and new blocks.
 */
export function useBlocksEditor(
  host: RefObject<HTMLDivElement | null>,
  hints: PortHints,
): BlocksEditor {
  const [status, setStatus] = useState<BlocksEditorStatus>('loading');
  const [program, setProgram] = useState<GeneratedProgram | null>(null);
  const [restoredStarter, setRestoredStarter] = useState(false);
  const [meta, setMetaState] = useState<ProgramMeta>(NEW_PROGRAM_META);
  const [history, setHistory] = useState<EditorHistory>({ canUndo: false, canRedo: false });
  const editor = useRef<EditorHandle | null>(null);
  const latestHints = useRef(hints);

  useEffect(() => {
    latestHints.current = hints;
    editor.current?.setPortHints(hints);
  }, [hints]);

  useEffect(() => {
    const element = host.current;
    if (!element) return;
    let disposed = false;
    const scheme = window.matchMedia('(prefers-color-scheme: dark)');
    const onScheme = () => editor.current?.setDark(scheme.matches);
    import('@/lib/blocks/editor').then(
      ({ createEditor }) => {
        if (disposed) return;
        const savedMeta = readSavedMeta();
        setMetaState(savedMeta);
        const handle = createEditor({
          host: element,
          dark: scheme.matches,
          saved: readSavedWorkspace(),
          meta: savedMeta,
          onChange: (next, state) => {
            setProgram(next);
            saveWorkspace(state);
          },
          onMeta: (next) => {
            setMetaState(next);
            saveMeta(next);
          },
          onHistory: setHistory,
        });
        editor.current = handle;
        handle.setPortHints(latestHints.current);
        setRestoredStarter(handle.restoredStarter);
        setStatus('ready');
        scheme.addEventListener('change', onScheme);
      },
      (error: unknown) => {
        if (disposed) return;
        console.error('The block editor failed to load.', error);
        setStatus('failed');
      },
    );
    return () => {
      disposed = true;
      scheme.removeEventListener('change', onScheme);
      editor.current?.dispose();
      editor.current = null;
    };
  }, [host]);

  const undo = useCallback(() => editor.current?.undo(), []);
  const redo = useCallback(() => editor.current?.redo(), []);
  const reset = useCallback(() => editor.current?.reset(), []);
  const setMeta = useCallback((next: ProgramMeta) => editor.current?.setMeta(next), []);

  const code = program?.code ?? '';
  const fileText = useCallback(
    (name: string, savedBy: string) =>
      serializeProgramFile({
        name,
        savedBy,
        savedAt: new Date().toISOString(),
        python: code,
        workspace: editor.current?.save() ?? {},
      }),
    [code],
  );

  const saveToComputer = useCallback(
    (name: string, savedBy: string) => {
      const fileName = programFileName(name);
      downloadTextFile(fileName, fileText(name, savedBy));
      return fileName;
    },
    [fileText],
  );

  const openFile = useCallback(
    (text: string, fileName: string, github: GitHubLink | null): OpenResult => {
      const handle = editor.current;
      if (!handle) return { ok: false, message: 'The block editor is still loading.' };
      const parsed = parseProgramFile(text, fileName);
      if (!parsed.ok) return parsed;
      const file: ProgramFile = {
        name: parsed.name,
        workspace: parsed.workspace,
        savedBy: parsed.savedBy,
        savedAt: parsed.savedAt,
      };
      try {
        handle.open(file.workspace, { name: file.name, github });
      } catch (error) {
        console.warn('A program file could not be opened.', error);
        return {
          ok: false,
          message:
            'These blocks could not be opened. The file may be damaged, or made by a newer MatPilot: reload the page and try again.',
        };
      }
      return { ok: true, file };
    },
    [],
  );

  return {
    status,
    program,
    restoredStarter,
    meta,
    history,
    undo,
    redo,
    reset,
    fileText,
    saveToComputer,
    openFile,
    setMeta,
  };
}
