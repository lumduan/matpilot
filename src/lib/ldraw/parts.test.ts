import { describe, expect, it } from 'vitest';
import { KNOWN_PARTS, knownPart, partBox, readBoxTable } from './parts';
import { realBoxTable } from './test-models';

const table = realBoxTable();

describe('the size table', () => {
  it('holds every part and primitive of the pinned LDraw release', () => {
    expect(table.release).toBe('ldraw.org Parts Update 2026-10');
    expect(table.parts.size).toBe(27807);
    // A model may place a primitive itself: the unit cube.
    expect(table.parts.get('box')).toEqual({ min: [-1, -1, -1], max: [1, 1, 1], wheel: false });
    // A 2 × 4 brick: 80 × 40 LDU, 24 LDU high plus its studs (4 LDU) above.
    expect(table.parts.get('3001')).toEqual({
      min: [-40, -4, -20],
      max: [40, 24, 20],
      wheel: false,
    });
  });

  it('refuses what is not a size table, and skips damaged rows', () => {
    expect(readBoxTable(null)).toBeNull();
    expect(readBoxTable({ format: 'other', unit: 'LDU', parts: {} })).toBeNull();
    const read = readBoxTable({
      format: 'matpilot-ldraw-boxes',
      unit: 'LDU',
      release: 'r',
      parts: { a: [0, 0, 0, 1, 1, 1, 'wheel'], b: [0, 0], c: [0, 0, 0, 'x', 1, 1] },
    });
    expect([...read!.parts.keys()]).toEqual(['a']);
    expect(read!.parts.get('a')!.wheel).toBe(true);
  });

  it('gives a variant the size of the part it starts with', () => {
    expect(partBox('3001pz99', table)).toEqual(table.parts.get('3001'));
    expect(partBox('54675c99', table)).toEqual(table.parts.get('54675'));
    expect(partBox('nothing-like-it', table)).toBeNull();
  });
});

describe('the SPIKE Prime parts MatPilot knows', () => {
  it('match their shapes in the size table', () => {
    for (const [name, part] of KNOWN_PARTS) {
      const box = table.parts.get(name);
      expect(box, name).toBeDefined();
      if (!box) continue;
      if (part.kind === 'motor') {
        // The shaft's hub is the motor's −Y face (a variant with a cable: its cable reaches past).
        const motor = table.parts.get(name.replace(/c01$/, ''))!;
        expect(motor.min[1], name).toBe(part.shaft.point[1]);
        expect(part.shaft.direction).toEqual([0, -1, 0]);
      }
      if (part.kind === 'sensor') {
        // The front is the part's −Z face.
        expect(box.min[2], name).toBe(part.front.point[2]);
        expect(part.front.direction).toEqual([0, 0, -1]);
      }
      if (part.kind === 'wheel') {
        expect(box.wheel, name).toBe(true);
        // Across: the box is rounded out to whole LDU.
        expect(box.max[0] - box.min[0], name).toBe(Math.ceil(part.diameterLdu / 2) * 2);
        expect(box.max[2] - box.min[2], name).toBe(36);
        expect(part.widthLdu).toBe(35);
      }
    }
  });

  it('knows a variant by the number it starts with, as a guess', () => {
    expect(knownPart('37308')).toEqual({ part: KNOWN_PARTS.get('37308'), guessed: false });
    expect(knownPart('37308p77')).toEqual({ part: KNOWN_PARTS.get('37308'), guessed: true });
    expect(knownPart('3001')).toBeNull();
    expect(knownPart('s/u9363s01')).toBeNull();
  });
});
