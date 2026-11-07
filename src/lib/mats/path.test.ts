import { loadMicroPython } from '@micropython/micropython-webassembly-pyscript';
import { describe, expect, it } from 'vitest';
import { newRobot } from '../robots/profile';
import { runProgram, type LoadMicroPython } from '../sim/runner';
import { planPath, pathProgram, stepText } from './path';

const load = loadMicroPython as unknown as LoadMicroPython;
const start = { xMm: 200, yMm: 200, headingDeg: 0 };

describe('a path drawn on the mat', () => {
  it('turns to face each point, then drives to it, in Pybricks’ turns', () => {
    const plan = planPath(start, [
      { xMm: 800, yMm: 200 },
      { xMm: 800, yMm: 500 },
      { xMm: 500, yMm: 500 },
    ]);
    expect(plan.steps).toEqual([
      { kind: 'straight', mm: 600 },
      { kind: 'turn', degrees: -90 },
      { kind: 'straight', mm: 300 },
      { kind: 'turn', degrees: -90 },
      { kind: 'straight', mm: 300 },
    ]);
    expect(plan.steps.map(stepText)).toEqual([
      'move forward 600 mm',
      'turn left 90°',
      'move forward 300 mm',
      'turn left 90°',
      'move forward 300 mm',
    ]);
    expect(plan.lengthMm).toBe(1200);
  });

  it('turns the short way, skips points on top of each other, and keeps rounding from adding up', () => {
    const plan = planPath({ xMm: 0, yMm: 0, headingDeg: 170 }, [
      { xMm: -1000, yMm: -100 },
      { xMm: -1002, yMm: -101 },
    ]);
    // From 170° to about 185.7°: 16° left (Pybricks −16).
    expect(plan.steps).toEqual([
      { kind: 'turn', degrees: -16 },
      { kind: 'straight', mm: 1005 },
    ]);
    // Twenty segments at an awkward angle end close to the last point.
    const points = Array.from({ length: 20 }, (_, i) => ({
      xMm: 200 + (i + 1) * 73.3,
      yMm: 200 + (i + 1) * 31.7 * (i % 2 === 0 ? 1 : 1.2),
    }));
    const long = planPath(start, points);
    const last = long.poses.at(-1)!;
    expect(Math.hypot(last.xMm - points.at(-1)!.xMm, last.yMm - points.at(-1)!.yMm)).toBeLessThan(
      2,
    );
  });

  it('runs on the mat and ends where the path ends', async () => {
    const robot = newRobot('Rover');
    const plan = planPath(start, [
      { xMm: 700, yMm: 350 },
      { xMm: 1100, yMm: 300 },
    ]);
    const result = await runProgram(load, {
      files: [{ name: 'main.py', code: pathProgram(robot, plan.steps) }],
      robot: {
        wheelDiameterMm: 56,
        trackMm: 112,
        left: 'A',
        right: 'B',
        mirrored: 'left',
        motorTopSpeedDegS: 1000,
      },
      start,
      timeLimitMs: 120_000,
      driveSpeed: null,
      sensors: [],
      mat: { widthMm: 2000, heightMm: 1000, pixels: null, objects: [] },
    });
    expect(result.end).toEqual({ reason: 'finished' });
    const end = result.frames.at(-1)!.pose;
    const planned = plan.poses.at(-1)!;
    expect(end.xMm).toBeCloseTo(planned.xMm, 0);
    expect(end.yMm).toBeCloseTo(planned.yMm, 0);
    expect(end.headingDeg).toBeCloseTo(planned.headingDeg, 0);
  });
});
