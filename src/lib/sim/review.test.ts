import { describe, expect, it } from 'vitest';
import type { Mat } from '../mats/mat';
import { newRobot } from '../robots/profile';
import type { SimResult } from './runner';
import { reviewRun } from './review';

const robot = newRobot(); // 160 × 200 mm, axle 70 mm from the back
const MAT: Mat = {
  id: 'm',
  name: 'Test',
  widthMm: 1000,
  heightMm: 600,
  source: { kind: 'image', fileName: 'm.png', page: 1, pageCount: 1, sizeFrom: 'typed' },
  rulesId: null,
  areas: [
    { id: '1', name: 'Ditch', kind: 'avoid', xMm: 500, yMm: 0, widthMm: 50, heightMm: 100 },
    { id: '2', name: 'Garage', kind: 'target', xMm: 700, yMm: 200, widthMm: 300, heightMm: 300 },
  ],
  placement: null,
};

const run = (
  poses: [number, number, number][],
  programDrive: SimResult['programDrive'] = null,
): SimResult => ({
  frames: poses.map(([x, y, h], i) => ({ t: i * 1000, pose: { xMm: x, yMm: y, headingDeg: h } })),
  events: [],
  end: { reason: 'finished' },
  timeMs: (poses.length - 1) * 1000,
  sensorsRead: [],
  programDrive,
});

describe('reviewing a run', () => {
  it('finds the target the robot ended in', () => {
    const review = reviewRun(
      run([
        [200, 300, 0],
        [500, 300, 0],
        [820, 350, 0],
      ]),
      robot,
      MAT,
    );
    expect(review).toMatchObject({ leftMatAt: null, touched: [], endedIn: ['Garage'], targets: 1 });
  });

  it('says when the robot left the mat and touched a keep-out area', () => {
    const review = reviewRun(
      run([
        [200, 300, 0],
        [520, 80, 0],
        [950, 300, 0],
      ]),
      robot,
      MAT,
    );
    expect(review.touched).toEqual([{ name: 'Ditch', at: 1000 }]);
    expect(review.leftMatAt).toBe(2000);
    expect(review.endedIn).toEqual([]);
  });

  it('explains how the program and the robot differ', () => {
    const review = reviewRun(
      run([[200, 300, 0]], { wheelDiameterMm: 56, trackMm: 120, left: 'C', right: 'D' }),
      { ...robot, wheels: { ...robot.wheels, diameterMm: 62.4 } },
      MAT,
    );
    expect(review.differences).toEqual([
      'The program drives ports C and D, but the robot’s wheels are on A and B.',
      'The program counts 56 mm wheels; the robot’s are 62.4 mm, so it goes further than the program asks.',
      'The program counts 120 mm between the wheels; the robot has 112 mm, so it turns more than the program asks.',
    ]);
  });
});
