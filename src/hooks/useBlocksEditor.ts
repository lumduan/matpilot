'use client';

import { useCallback, useEffect, useRef, useState, type RefObject } from 'react';
import type {
  AddTabResult,
  EditorHandle,
  EditorHistory,
  EditorTab,
  SavedProgram,
} from '@/lib/blocks/editor';
import type { PortHints } from '@/lib/blocks/fields/hints';
import type { PythonEdit, PythonProblem } from '@/lib/blocks/from-python/tab';
import type { GeneratedProgram } from '@/lib/blocks/generator';
import {
  MAIN_TAB_NAME,
  parseProgramFile,
  programFileName,
  serializeProgramFile,
  type ProgramFile,
  type ProgramTabState,
} from '@/lib/blocks/program-file';
import {
  NEW_PROGRAM_META,
  parseProgramMeta,
  programMetaData,
  type GitHubLink,
  type ProgramMeta,
} from '@/lib/blocks/program-meta';
import { downloadTextFile } from './downloadFile';

/** The program in tabs (ADR 0013): `{ tabs: [{ name, workspace }], active }`. */
const PROGRAM_STORAGE_KEY = 'matpilot.blocks.tabs.v2';
/** Before tabs: one workspace. Read once, when there is no program in tabs yet. */
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
    window.localStorage.setItem(META_STORAGE_KEY, JSON.stringify(programMetaData(meta)));
  } catch {
    // Not remembered; the page still works.
  }
}

const isObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

/** The program saved in this browser: in tabs, or from before tabs as the main tab. */
function readSavedProgram(): SavedProgram | null {
  try {
    const saved = window.localStorage.getItem(PROGRAM_STORAGE_KEY);
    if (saved !== null) {
      const data = JSON.parse(saved) as unknown;
      if (isObject(data) && Array.isArray(data.tabs)) {
        const tabs = (data.tabs as unknown[]).filter(
          (tab): tab is ProgramTabState =>
            isObject(tab) && typeof tab.name === 'string' && isObject(tab.workspace),
        );
        if (tabs.length > 0) {
          return { tabs, active: typeof data.active === 'string' ? data.active : undefined };
        }
      }
    }
    const old = window.localStorage.getItem(WORKSPACE_STORAGE_KEY);
    return old === null
      ? null
      : { tabs: [{ name: MAIN_TAB_NAME, workspace: JSON.parse(old) as object }] };
  } catch {
    return null;
  }
}

function saveProgram(state: SavedProgram): void {
  try {
    window.localStorage.setItem(PROGRAM_STORAGE_KEY, JSON.stringify(state));
  } catch {
    // Storage blocked or full: the blocks are simply not remembered.
  }
}

export type BlocksEditorStatus = 'loading' | 'ready' | 'failed';

const STILL_LOADING: readonly PythonProblem[] = [
  { from: 0, to: 0, message: 'The block editor is still loading.' },
];

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
  /** Undo and Redo of the open tab. */
  readonly history: EditorHistory;
  /** The program's tabs, main first, and the open one. */
  readonly tabs: readonly EditorTab[];
  readonly activeTab: string;
  readonly undo: () => void;
  readonly redo: () => void;
  /** Starts a new program from the starter blocks. */
  readonly reset: () => void;
  /** Puts back the program from before the last open, start over, closed tab or moved function. */
  readonly undoProgramChange: () => void;
  readonly selectTab: (id: string) => void;
  readonly addTab: () => AddTabResult;
  readonly renameTab: EditorHandle['renameTab'];
  readonly closeTab: (id: string) => void;
  readonly showBlock: (tabId: string, blockId: string) => void;
  /** The program as the text of a file (ADR 0011). */
  readonly fileText: (name: string, savedBy: string) => string;
  /** Downloads the program as `<name>.matpilot.json`; returns the file name. */
  readonly saveToComputer: (name: string, savedBy: string) => string;
  /** Opens a program file's text (`undoProgramChange` brings the old program back). */
  readonly openFile: (text: string, fileName: string, github: GitHubLink | null) => OpenResult;
  /** Records a new name or GitHub file after saving. */
  readonly setMeta: (meta: ProgramMeta) => void;
  /** The tab's Python to edit, and the parts that can change (ADR 0014); null while loading. */
  readonly pythonEdit: (tabId: string) => Promise<PythonEdit | null>;
  /** What in this Python cannot become the tab's blocks. */
  readonly checkPython: (tabId: string, text: string) => Promise<readonly PythonProblem[]>;
  /** Replaces the tab's blocks with the Python's (undone from the notice), or returns why not. */
  readonly applyPython: (tabId: string, text: string) => Promise<readonly PythonProblem[]>;
  /** Locks the blocks while their Python is edited. */
  readonly setLocked: (locked: boolean) => void;
}

/**
 * React binding for the block editor (src/lib/blocks/editor.ts). Blockly is loaded only in the
 * browser, after the page has rendered; the program is saved in this browser after every change.
 * `hints` (what the hub says is plugged into each port) go to the port pickers and new blocks.
 * `onProgramChange` hears about changes to the program as a whole that the editor made itself
 * (a function moved to another tab, a tab closed), so the page can offer to undo them.
 */
export function useBlocksEditor(
  host: RefObject<HTMLDivElement | null>,
  hints: PortHints,
  onProgramChange: (message: string) => void,
): BlocksEditor {
  const [status, setStatus] = useState<BlocksEditorStatus>('loading');
  const [program, setProgram] = useState<GeneratedProgram | null>(null);
  const [restoredStarter, setRestoredStarter] = useState(false);
  const [meta, setMetaState] = useState<ProgramMeta>(NEW_PROGRAM_META);
  const [history, setHistory] = useState<EditorHistory>({ canUndo: false, canRedo: false });
  const [tabs, setTabs] = useState<{ list: readonly EditorTab[]; active: string }>({
    list: [{ id: 'main', name: MAIN_TAB_NAME }],
    active: 'main',
  });
  const editor = useRef<EditorHandle | null>(null);
  const latestHints = useRef(hints);
  const latestOnProgramChange = useRef(onProgramChange);

  useEffect(() => {
    latestOnProgramChange.current = onProgramChange;
  }, [onProgramChange]);

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
          saved: readSavedProgram(),
          meta: savedMeta,
          onChange: (next, state) => {
            setProgram(next);
            saveProgram(state);
          },
          onMeta: (next) => {
            setMetaState(next);
            saveMeta(next);
          },
          onHistory: setHistory,
          onTabs: (list, active) => setTabs({ list, active }),
          onProgramChange: (message) => latestOnProgramChange.current(message),
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
  const undoProgramChange = useCallback(() => editor.current?.undoProgramChange(), []);
  const setMeta = useCallback((next: ProgramMeta) => editor.current?.setMeta(next), []);
  const selectTab = useCallback((id: string) => editor.current?.selectTab(id), []);
  const addTab = useCallback(
    (): AddTabResult =>
      editor.current?.addTab() ?? { ok: false, message: 'The block editor is still loading.' },
    [],
  );
  const renameTab = useCallback(
    (id: string, text: string) =>
      editor.current?.renameTab(id, text) ?? {
        ok: false as const,
        message: 'The block editor is still loading.',
      },
    [],
  );
  const closeTab = useCallback((id: string) => editor.current?.closeTab(id), []);
  const showBlock = useCallback(
    (tabId: string, blockId: string) => editor.current?.showBlock(tabId, blockId),
    [],
  );

  const pythonEdit = useCallback(
    async (tabId: string) => (await editor.current?.pythonEdit(tabId)) ?? null,
    [],
  );
  const checkPython = useCallback(
    async (tabId: string, text: string) =>
      (await editor.current?.checkPython(tabId, text)) ?? STILL_LOADING,
    [],
  );
  const applyPython = useCallback(
    async (tabId: string, text: string) =>
      (await editor.current?.applyPython(tabId, text)) ?? STILL_LOADING,
    [],
  );
  const setLocked = useCallback((locked: boolean) => editor.current?.setLocked(locked), []);

  const files = program?.files;
  const robot = meta.robot;
  const fileText = useCallback(
    (name: string, savedBy: string) =>
      serializeProgramFile({
        name,
        savedBy,
        savedAt: new Date().toISOString(),
        robot,
        python: files ?? [],
        tabs: editor.current?.save().tabs ?? [],
      }),
    [files, robot],
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
      // A file saved before robots (ADR 0016) keeps the robot chosen here.
      const file: ProgramFile = {
        name: parsed.name,
        tabs: parsed.tabs,
        savedBy: parsed.savedBy,
        savedAt: parsed.savedAt,
        robot: parsed.robot ?? handle.meta().robot,
      };
      try {
        handle.open(file.tabs, { name: file.name, github, robot: file.robot });
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
    tabs: tabs.list,
    activeTab: tabs.active,
    undo,
    redo,
    reset,
    undoProgramChange,
    selectTab,
    addTab,
    renameTab,
    closeTab,
    showBlock,
    fileText,
    saveToComputer,
    openFile,
    setMeta,
    pythonEdit,
    checkPython,
    applyPython,
    setLocked,
  };
}
