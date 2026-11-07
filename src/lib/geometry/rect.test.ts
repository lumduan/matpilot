import { describe, expect, it } from 'vitest';
import { contains, overlaps, place, rectCorners } from './rect';

const square = (x: number, y: number, size: number, degrees = 0) =>
  rectCorners({ minX: -size / 2, maxX: size / 2, minY: -size / 2, maxY: size / 2 }, degrees, {
    x,
    y,
  });

describe('rectangles', () => {
  it('turn counter-clockwise', () => {
    const p = place({ x: 10, y: 0 }, 90);
    expect(p.x).toBeCloseTo(0, 9);
    expect(p.y).toBeCloseTo(10, 9);
  });

  it('know when one lies inside another, turned or not', () => {
    const area = square(0, 0, 250);
    expect(contains(area, square(0, 0, 250))).toBe(true);
    expect(contains(area, square(0, 0, 200, 30))).toBe(false);
    expect(contains(area, square(0, 0, 170, 45))).toBe(true);
    expect(contains(area, square(10, 0, 240))).toBe(false);
  });

  it('know when two overlap, and that touching is not overlapping', () => {
    expect(overlaps(square(0, 0, 100), square(90, 0, 100))).toBe(true);
    expect(overlaps(square(0, 0, 100), square(100, 0, 100))).toBe(false);
    expect(overlaps(square(0, 0, 100), square(120, 0, 100, 45))).toBe(true);
    expect(overlaps(square(0, 0, 100), square(130, 0, 100, 45))).toBe(false);
  });
});
