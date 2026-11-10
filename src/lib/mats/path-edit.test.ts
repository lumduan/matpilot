import { describe, expect, it } from 'vitest';
import { MAX_PATH_ITEMS, type PathItem } from './path';
import {
  EMPTY_DRAFT,
  insertItem,
  moveItem,
  pathsData,
  readPaths,
  removeItem,
  selectItem,
  updateItem,
  type PathDraft,
} from './path-edit';

const point = (xMm: number): PathItem => ({ kind: 'point', xMm, yMm: 100 });
const ids = (draft: PathDraft) => draft.items.map((each) => each.id);

describe('the Path tab’s list of moves', () => {
  it('puts a new move after the highlighted one, and highlights it', () => {
    let draft = insertItem(EMPTY_DRAFT, point(1), 'a');
    draft = insertItem(draft, point(2), 'b');
    expect(ids(draft)).toEqual(['a', 'b']);
    expect(draft.selected).toBe('b');
    // Highlight the first: the next move goes between the two.
    draft = insertItem(selectItem(draft, 'a'), { kind: 'wait', seconds: 1 }, 'w');
    expect(ids(draft)).toEqual(['a', 'w', 'b']);
    expect(draft.selected).toBe('w');
    // Nothing highlighted: at the end.
    draft = insertItem(selectItem(draft, null), { kind: 'turn', degrees: 90 }, 't');
    expect(ids(draft)).toEqual(['a', 'w', 'b', 't']);
    expect(selectItem(draft, 'gone').selected).toBeNull();
  });

  it('changes, moves and removes a move', () => {
    let draft = ['a', 'b', 'c'].reduce(
      (each, id, index) => insertItem(each, point(index), id),
      EMPTY_DRAFT,
    );
    draft = updateItem(draft, 'b', { kind: 'straight', mm: -40.4 });
    expect(draft.items[1]).toEqual({ id: 'b', item: { kind: 'straight', mm: -40 } });
    expect(ids(moveItem(draft, 'b', -1))).toEqual(['b', 'a', 'c']);
    expect(ids(moveItem(draft, 'c', 1))).toEqual(['a', 'b', 'c']);
    // Removing the highlighted move highlights the one before it.
    const removed = removeItem(selectItem(draft, 'b'), 'b');
    expect(ids(removed)).toEqual(['a', 'c']);
    expect(removed.selected).toBe('a');
    expect(removeItem(selectItem(draft, 'a'), 'a').selected).toBe('b');
  });

  it('holds at most so many moves', () => {
    let draft = EMPTY_DRAFT;
    for (let i = 0; i < MAX_PATH_ITEMS + 3; i += 1) draft = insertItem(draft, point(i));
    expect(draft.items).toHaveLength(MAX_PATH_ITEMS);
  });

  it('is kept for each mat, and read back strictly', () => {
    const items: PathItem[] = [
      { kind: 'point', xMm: 10, yMm: 20, backward: true },
      { kind: 'turn', degrees: -45 },
      { kind: 'straight', mm: 120 },
      { kind: 'wait', seconds: 0.5 },
      { kind: 'speed', percent: 60 },
    ];
    expect(readPaths(pathsData({ m1: items, empty: [] }))).toEqual({ m1: items });
    expect(readPaths(null)).toEqual({});
    expect(readPaths('not json')).toEqual({});
    expect(readPaths('[1, 2]')).toEqual({});
    // Bad moves are left out, numbers outside the limits brought inside.
    expect(
      readPaths(
        JSON.stringify({
          m2: [
            { kind: 'jump' },
            { kind: 'turn', degrees: 'far' },
            { kind: 'speed', percent: 500 },
            null,
          ],
          m3: 'nothing',
        }),
      ),
    ).toEqual({ m2: [{ kind: 'speed', percent: 100 }] });
  });
});
