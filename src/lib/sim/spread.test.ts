import { describe, expect, it } from 'vitest';
import type { Mat } from '../mats/mat';
import { newRobot } from '../robots/profile';
import type { Frame } from './engine';
import { SPREAD_DRAWN, runSpread } from './spread';

const MAT: Mat = {
  id: 'm',
  name: 'Test',
  widthMm: 2000,
  heightMm: 1000,
  source: { kind: 'image', fileName: 'm.png', page: 1, pageCount: 1, sizeFrom: 'typed' },
  rulesId: null,
  areas: [
    { id: '1', name: 'Garage', kind: 'target', xMm: 1100, yMm: 340, widthMm: 320, heightMm: 320 },
    { id: '2', name: 'Box', kind: 'object', xMm: 1450, yMm: 0, widthMm: 100, heightMm: 1000 },
  ],
  placement: null,
};

/** Straight from (250, 500) along +x for `mm`, 10 mm a frame. */
const straight = (mm: number): Frame[] =>
  Array.from({ length: mm / 10 + 1 }, (_, i) => ({
    t: i * 20,
    pose: { xMm: 250 + i * 10, yMm: 500, headingDeg: 0 },
  }));

/** A turn on the spot at (500, 500) from 0° to `deg`, 1° a frame. */
const turn = (deg: number): Frame[] =>
  Array.from({ length: Math.abs(deg) + 1 }, (_, i) => ({
    t: i * 20,
    pose: { xMm: 500, yMm: 500, headingDeg: Math.sign(deg) * i },
  }));

const robotWith = (perMetreMm: number | null, per90Deg: number | null) => ({
  ...newRobot(),
  drift: { perMetreMm, per90Deg },
});

const spreadOf = (values: number[]) => {
  const mean = values.reduce((sum, value) => sum + value, 0) / values.length;
  return Math.sqrt(values.reduce((sum, value) => sum + (value - mean) ** 2, 0) / values.length);
};

describe('how sure is the robot', () => {
  it('says nothing for a robot whose drift was never measured', () => {
    expect(runSpread(straight(1000), robotWith(null, null), MAT)).toBeNull();
  });

  it('after 1 metre, ends about the drift per metre forward or back and to the side', () => {
    const spread = runSpread(straight(1000), robotWith(10, null), MAT, { runs: 4000 })!;
    const along = spreadOf(spread.ends.map((end) => end.xMm));
    const side = spreadOf(spread.ends.map((end) => end.yMm));
    expect(along).toBeGreaterThan(9);
    expect(along).toBeLessThan(11);
    expect(side).toBeGreaterThan(9);
    expect(side).toBeLessThan(11);
    // 9 in 10 within about 2.1 spreads of a round normal distribution.
    expect(spread.radiusMm).toBeGreaterThan(19);
    expect(spread.radiusMm).toBeLessThan(24);
    expect(spread.drift).toEqual({ perMetreMm: 10, per90Deg: null });
  });

  it('a 90° turn ends about the drift per 90° off, in the same place', () => {
    const spread = runSpread(turn(90), robotWith(null, 2), MAT, { runs: 4000 })!;
    const heading = spreadOf(spread.ends.map((end) => end.headingDeg));
    expect(heading).toBeGreaterThan(1.8);
    expect(heading).toBeLessThan(2.2);
    expect(spread.radiusMm).toBeLessThan(0.001);
    // 9 in 10 within about 1.64 spreads either way.
    expect(spread.headingDeg).toBeGreaterThan(3);
    expect(spread.headingDeg).toBeLessThan(3.6);
  });

  it('counts the pretend runs that end in a target, run into an object or leave the mat', () => {
    // 1010 mm to x 1260, the middle of the Garage; a sloppy robot ends outside some times.
    const spread = runSpread(straight(1010), robotWith(40, 3), MAT)!;
    expect(spread.runs).toBe(100);
    expect(spread.paths).toHaveLength(SPREAD_DRAWN);
    const garage = spread.targets.find((each) => each.name === 'Garage')!.count;
    expect(garage).toBeGreaterThan(10);
    expect(garage).toBeLessThan(100);
    // The robot's front stops 60 mm short of the box: about 1.5 spreads, so a few reach it.
    const box = spread.touched.find((each) => each.name === 'Box')!.count;
    expect(box).toBeGreaterThan(0);
    expect(box).toBeLessThan(20);
    expect(spread.leftMat).toBe(0);
    // The same run shows the same spread.
    expect(runSpread(straight(1010), robotWith(40, 3), MAT)).toEqual(spread);
    // Driving on into the box: every pretend run hits it.
    const far = runSpread(straight(1250), robotWith(40, 3), MAT)!;
    expect(far.touched).toEqual([{ name: 'Box', count: 100 }]);
  });
});
