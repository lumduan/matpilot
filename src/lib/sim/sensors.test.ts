import { describe, expect, it } from 'vitest';
import {
  hsvReflected,
  matchColor,
  rawFromColor,
  rayDistance,
  reflection,
  spotColor,
  touching,
  type MatPixels,
} from './sensors';

const sense = (r: number, g: number, b: number) => {
  const raw = rawFromColor({ r, g, b });
  const hsv = hsvReflected(raw);
  return { reflection: reflection(raw), hsv, color: matchColor(hsv) };
};

describe('the colour sensor, as the firmware works it out', () => {
  it('reads white as WHITE at 100 %, and black as NONE (black is not in the default list)', () => {
    expect(sense(255, 255, 255)).toEqual({
      reflection: 100,
      hsv: { h: 10, s: 0, v: 100 },
      color: 'WHITE',
    });
    expect(sense(0, 0, 0)).toMatchObject({ reflection: 0, color: 'NONE' });
    expect(matchColor(sense(20, 20, 20).hsv, ['BLACK', 'WHITE', 'NONE'])).toBe('BLACK');
  });

  it('reads printed colours by hue', () => {
    expect(sense(230, 30, 40).color).toBe('RED');
    expect(sense(250, 220, 30).color).toBe('YELLOW');
    expect(sense(20, 160, 70).color).toBe('GREEN');
    expect(sense(30, 80, 200).color).toBe('BLUE');
    // Grey paper is not saturated: it is matched by value, here to white.
    expect(sense(200, 200, 200).color).toBe('WHITE');
  });

  it('follows the firmware’s whole-number steps', () => {
    // Pure red: hue 0 shifted to 10, saturation 100, value 101 × 255 / 256 = 100.
    expect(sense(255, 0, 0).hsv).toEqual({ h: 10, s: 100, v: 100 });
    // 1024 → 255 and 512 → 128: saturation 100 × 127 / 255 = 49, then 49 × 151 / 100 = 73.
    expect(hsvReflected({ r: 1024, g: 512, b: 512 }).s).toBe(73);
    // reflection: (r + g + b) × 100 / 3072, cut to a whole number.
    expect(reflection({ r: 1000, g: 0, b: 0 })).toBe(32);
  });
});

describe('the mat under a sensor', () => {
  // 10 × 10 mm, white with a black square at x 0-4, y 0-4 (bottom-left).
  const data = new Uint8ClampedArray(10 * 10 * 4).fill(255);
  for (let row = 5; row < 10; row += 1) {
    for (let col = 0; col < 5; col += 1) {
      const i = (row * 10 + col) * 4;
      data[i] = data[i + 1] = data[i + 2] = 0;
    }
  }
  const pixels: MatPixels = { width: 10, height: 10, data };

  it('averages a spot, with y up from the mat’s bottom', () => {
    expect(spotColor(pixels, { x: 2.5, y: 2.5 }, 1).r).toBe(0);
    expect(spotColor(pixels, { x: 7.5, y: 7.5 }, 1).r).toBe(255);
    const edge = spotColor(pixels, { x: 5, y: 2.5 }, 2).r;
    expect(edge).toBeGreaterThan(0);
    expect(edge).toBeLessThan(255);
  });
});

describe('the distance and touch sensors', () => {
  const mat = { widthMm: 1000, heightMm: 500 };
  const box = { xMm: 600, yMm: 200, widthMm: 100, heightMm: 100 };

  it('measures to the wall at the mat’s edge, or to a solid object', () => {
    expect(rayDistance({ x: 100, y: 250 }, 0, mat, [])).toBeCloseTo(900, 9);
    expect(rayDistance({ x: 100, y: 250 }, 0, mat, [box])).toBeCloseTo(500, 9);
    expect(rayDistance({ x: 100, y: 250 }, 90, mat, [box])).toBeCloseTo(250, 9);
    expect(rayDistance({ x: 100, y: 100 }, 0, { widthMm: 3000, heightMm: 500 }, [])).toBe(2000);
  });

  it('is pressed against a wall or an object', () => {
    expect(touching({ x: 997, y: 250 }, 0, mat, [])).toBe(true);
    expect(touching({ x: 597, y: 250 }, 0, mat, [box])).toBe(true);
    expect(touching({ x: 500, y: 250 }, 0, mat, [box])).toBe(false);
  });
});
