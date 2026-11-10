/**
 * The Path tab's list of moves (./path.ts) while the child edits it: each move with an id, the
 * highlighted move (new moves go after it), and how the list is kept in this browser, one list
 * per mat. Not saved in the mat's file.
 */
import { MAX_PATH_ITEMS, cleanItem, type PathItem } from './path';

export interface ListedItem {
  readonly id: string;
  readonly item: PathItem;
}

export interface PathDraft {
  readonly items: readonly ListedItem[];
  /** The highlighted move; new moves go after it. */
  readonly selected: string | null;
}

export const EMPTY_DRAFT: PathDraft = { items: [], selected: null };

/** The browser's key for every mat's list. */
export const PATHS_KEY = 'matpilot.mats.paths.v1';

export function newItemId(): string {
  return `m${Math.random().toString(36).slice(2, 10)}`;
}

/** Puts `item` after the highlighted move (or at the end) and highlights it. */
export function insertItem(draft: PathDraft, item: PathItem, id = newItemId()): PathDraft {
  if (draft.items.length >= MAX_PATH_ITEMS) return draft;
  const at = draft.items.findIndex((each) => each.id === draft.selected);
  const index = at === -1 ? draft.items.length : at + 1;
  const items = [...draft.items];
  items.splice(index, 0, { id, item: cleanItem(item) });
  return { items, selected: id };
}

/** Changes a move; the same draft when nothing changes (so Undo gets no empty step). */
export function updateItem(draft: PathDraft, id: string, item: PathItem): PathDraft {
  const clean = cleanItem(item);
  const before = draft.items.find((each) => each.id === id);
  if (!before || JSON.stringify(before.item) === JSON.stringify(clean)) return draft;
  return {
    ...draft,
    items: draft.items.map((each) => (each.id === id ? { id, item: clean } : each)),
  };
}

/** Takes the move out; the one before it is highlighted then (or the next one). */
export function removeItem(draft: PathDraft, id: string): PathDraft {
  const index = draft.items.findIndex((each) => each.id === id);
  if (index === -1) return draft;
  const items = draft.items.filter((each) => each.id !== id);
  const selected =
    draft.selected === id ? (items[index - 1]?.id ?? items[index]?.id ?? null) : draft.selected;
  return { items, selected };
}

/** Moves it one place up (-1) or down (1). */
export function moveItem(draft: PathDraft, id: string, by: -1 | 1): PathDraft {
  const index = draft.items.findIndex((each) => each.id === id);
  const to = index + by;
  if (index === -1 || to < 0 || to >= draft.items.length) return draft;
  const items = [...draft.items];
  [items[index], items[to]] = [items[to]!, items[index]!];
  return { ...draft, items };
}

export function selectItem(draft: PathDraft, id: string | null): PathDraft {
  return { ...draft, selected: draft.items.some((each) => each.id === id) ? id : null };
}

const isNumber = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value);

/** A move read back strictly: anything else is dropped. */
export function readItem(value: unknown): PathItem | null {
  if (typeof value !== 'object' || value === null) return null;
  const each = value as Record<string, unknown>;
  switch (each.kind) {
    case 'point':
      return isNumber(each.xMm) && isNumber(each.yMm)
        ? cleanItem({
            kind: 'point',
            xMm: each.xMm,
            yMm: each.yMm,
            backward: each.backward === true,
          })
        : null;
    case 'turn':
      return isNumber(each.degrees) ? cleanItem({ kind: 'turn', degrees: each.degrees }) : null;
    case 'straight':
      return isNumber(each.mm) ? cleanItem({ kind: 'straight', mm: each.mm }) : null;
    case 'wait':
      return isNumber(each.seconds) ? cleanItem({ kind: 'wait', seconds: each.seconds }) : null;
    case 'speed':
      return isNumber(each.percent) ? cleanItem({ kind: 'speed', percent: each.percent }) : null;
    default:
      return null;
  }
}

/** Every mat's list, from the browser's storage (bad entries are left out). */
export function readPaths(raw: string | null): Record<string, readonly PathItem[]> {
  if (raw === null) return {};
  try {
    const data = JSON.parse(raw) as unknown;
    if (typeof data !== 'object' || data === null || Array.isArray(data)) return {};
    const paths: Record<string, readonly PathItem[]> = {};
    for (const [matId, list] of Object.entries(data as Record<string, unknown>)) {
      if (!Array.isArray(list)) continue;
      const items = list
        .slice(0, MAX_PATH_ITEMS)
        .map(readItem)
        .filter((item): item is PathItem => item !== null);
      if (items.length > 0) paths[matId] = items;
    }
    return paths;
  } catch {
    return {};
  }
}

/** The lists to store: a mat without moves is left out. */
export function pathsData(paths: Record<string, readonly PathItem[]>): string {
  return JSON.stringify(
    Object.fromEntries(Object.entries(paths).filter(([, items]) => items.length > 0)),
  );
}
