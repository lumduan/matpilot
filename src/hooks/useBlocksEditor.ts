'use client';

import { useCallback, useEffect, useRef, useState, type RefObject } from 'react';
import type { EditorHandle } from '@/lib/blocks/editor';
import type { PortHints } from '@/lib/blocks/fields/hints';
import type { GeneratedProgram } from '@/lib/blocks/generator';

const WORKSPACE_STORAGE_KEY = 'matpilot.blocks.workspace.v1';

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

export interface BlocksEditor {
  readonly status: BlocksEditorStatus;
  /** The Python made from the blocks, and anything to fix before it can run. */
  readonly program: GeneratedProgram | null;
  /** `true` when the saved blocks could not be loaded and the starter program was used. */
  readonly restoredStarter: boolean;
  readonly reset: () => void;
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
        const handle = createEditor({
          host: element,
          dark: scheme.matches,
          saved: readSavedWorkspace(),
          onChange: (next, state) => {
            setProgram(next);
            saveWorkspace(state);
          },
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

  const reset = useCallback(() => editor.current?.reset(), []);
  return { status, program, restoredStarter, reset };
}
