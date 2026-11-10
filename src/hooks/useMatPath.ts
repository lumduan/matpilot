'use client';

import { useRef, useState } from 'react';
import {
  EMPTY_DRAFT,
  PATHS_KEY,
  newItemId,
  pathsData,
  readPaths,
  selectItem,
  type PathDraft,
} from '@/lib/mats/path-edit';
import type { PathItem } from '@/lib/mats/path';

/** How many changes Undo can take back. */
const UNDO_LIMIT = 50;

function stored(): Record<string, readonly PathItem[]> {
  try {
    return readPaths(window.localStorage.getItem(PATHS_KEY));
  } catch {
    return {};
  }
}

function store(matId: string, items: readonly PathItem[]): void {
  try {
    window.localStorage.setItem(PATHS_KEY, pathsData({ ...stored(), [matId]: items }));
  } catch {
    // Storage is blocked: the moves stay while the page is open.
  }
}

/** A deleted mat's moves go too. */
export function forgetMatPath(matId: string): void {
  try {
    const paths = stored();
    if (!(matId in paths)) return;
    delete paths[matId];
    window.localStorage.setItem(PATHS_KEY, pathsData(paths));
  } catch {
    // Storage is blocked: nothing was kept.
  }
}

const listed = (items: readonly PathItem[]): PathDraft => ({
  items: items.map((item) => ({ id: newItemId(), item })),
  selected: null,
});

export interface MatPath {
  readonly draft: PathDraft;
  readonly items: readonly PathItem[];
  readonly canUndo: boolean;
  /** A change Undo can take back. */
  readonly change: (next: (draft: PathDraft) => PathDraft) => void;
  /**
   * A change while a point is dragged: Undo takes the whole drag back at once. `done` ends the
   * drag.
   */
  readonly drag: (next: (draft: PathDraft) => PathDraft, done: boolean) => void;
  readonly select: (id: string | null) => void;
  readonly undo: () => void;
}

/**
 * The Path tab's moves for the open mat (src/lib/mats/path-edit.ts), kept in this browser for
 * each mat, with Undo.
 */
export function useMatPath(matId: string | null): MatPath {
  const [loadedFor, setLoadedFor] = useState<string | null>(null);
  const [draft, setDraft] = useState<PathDraft>(EMPTY_DRAFT);
  const [history, setHistory] = useState<readonly PathDraft[]>([]);
  const dragging = useRef(false);
  // Another mat: its own moves, and nothing to undo.
  if (matId !== loadedFor) {
    setLoadedFor(matId);
    setDraft(matId && typeof window !== 'undefined' ? listed(stored()[matId] ?? []) : EMPTY_DRAFT);
    setHistory([]);
  }

  // From event handlers only, so `draft` and `history` are the ones on the screen. True when the
  // moves changed.
  const apply = (next: (draft: PathDraft) => PathDraft, remember: boolean): boolean => {
    const changed = next(draft);
    if (changed === draft) return false;
    setDraft(changed);
    if (changed.items === draft.items) return false;
    if (remember) setHistory([...history, draft].slice(-UNDO_LIMIT));
    if (matId)
      store(
        matId,
        changed.items.map((each) => each.item),
      );
    return true;
  };
  const change = (next: (draft: PathDraft) => PathDraft) => {
    apply(next, true);
  };
  // Undo's step is taken at the drag's first real change (its first moves may change nothing).
  const drag = (next: (draft: PathDraft) => PathDraft, done: boolean) => {
    if (apply(next, !dragging.current)) dragging.current = true;
    if (done) dragging.current = false;
  };
  const select = (id: string | null) => setDraft(selectItem(draft, id));
  const undo = () => {
    const previous = history.at(-1);
    if (!previous) return;
    setDraft(previous);
    setHistory(history.slice(0, -1));
    if (matId)
      store(
        matId,
        previous.items.map((each) => each.item),
      );
  };

  return {
    draft,
    items: draft.items.map((each) => each.item),
    canUndo: history.length > 0,
    change,
    drag,
    select,
    undo,
  };
}
