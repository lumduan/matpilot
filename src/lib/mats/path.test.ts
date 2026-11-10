import { loadMicroPython } from '@micropython/micropython-webassembly-pyscript';
import { describe, expect, it } from 'vitest';
import { newRobot } from '../robots/profile';
import { runProgram, type LoadMicroPython } from '../sim/runner';
import { cleanItem, planPath, pathProgram, stepText, type PathItem } from './path';

const load = loadMicroPython as unknown as LoadMicroPython;
const start = { xMm: 200, yMm: 200, headingDeg: 0 };
const point = (xMm: number, yMm: number, backward = false): PathItem => ({
  kind: 'point',
  xMm,
  yMm,
  ...(backward ? { backward } : {}),
});

async function runOnMat(items: readonly PathItem[]) {
  const plan = planPath(start, items);
  const result = await runProgram(load, {
    files: [{ name: 'main.py', code: pathProgram(newRobot('Rover'), plan.steps) }],
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
  return { plan, result };
}

describe('a path made on the mat', () => {
  it('turns to face each point, then drives to it, in Pybricks’ turns', () => {
    const plan = planPath(start, [point(800, 200), point(800, 500), point(500, 500)]);
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
    expect(plan.items.map((each) => each.steps.length)).toEqual([1, 2, 2]);
    expect(plan.lengthMm).toBe(1200);
    expect(plan.segments.every((segment) => !segment.backward)).toBe(true);
  });

  it('drives to a point backward: its back to the point first, then a negative drive', () => {
    // Facing right at (200, 200); a point behind it needs no turn at all.
    const behind = planPath(start, [point(0, 200, true)]);
    expect(behind.steps).toEqual([{ kind: 'straight', mm: -200 }]);
    expect(behind.end).toEqual({ xMm: 0, yMm: 200, headingDeg: 0 });
    expect(behind.segments).toEqual([
      { from: start, to: { xMm: 0, yMm: 200, headingDeg: 0 }, backward: true },
    ]);
    // A point above it: forward turns left 90°; backward turns right 90° and reverses.
    expect(planPath(start, [point(200, 500)]).steps).toEqual([
      { kind: 'turn', degrees: -90 },
      { kind: 'straight', mm: 300 },
    ]);
    const up = planPath(start, [point(200, 500, true)]);
    expect(up.steps).toEqual([
      { kind: 'turn', degrees: 90 },
      { kind: 'straight', mm: -300 },
    ]);
    expect(up.steps.map(stepText)).toEqual(['turn right 90°', 'move backward 300 mm']);
    expect(up.end.xMm).toBeCloseTo(200, 6);
    expect(up.end.yMm).toBeCloseTo(500, 6);
    expect(up.lengthMm).toBe(300);
  });

  it('takes moves of its own, and works each point out from where they leave the robot', () => {
    const plan = planPath(start, [
      { kind: 'straight', mm: 300 },
      { kind: 'turn', degrees: -90 },
      { kind: 'wait', seconds: 1.5 },
      { kind: 'speed', percent: 70 },
      { kind: 'straight', mm: -100 },
      point(500, 400),
    ]);
    expect(plan.steps.map(stepText)).toEqual([
      'move forward 300 mm',
      'turn left 90°',
      'wait 1.5 seconds',
      'set movement speed to 70 %',
      'move backward 100 mm',
      'move forward 300 mm',
    ]);
    // After a left turn it faces up (90°); 100 mm back puts it at (500, 100), right under the
    // point, so the point needs no turn.
    expect(plan.items[4]!.pose).toEqual({ xMm: 500, yMm: 100, headingDeg: 90 });
    expect(plan.items[5]!.steps).toEqual([{ kind: 'straight', mm: 300 }]);
    expect(plan.segments.map((segment) => segment.backward)).toEqual([false, true, false]);
    expect(plan.lengthMm).toBe(700);
  });

  it('turns the short way, skips points on top of each other, and keeps rounding from adding up', () => {
    const plan = planPath({ xMm: 0, yMm: 0, headingDeg: 170 }, [
      point(-1000, -100),
      point(-1002, -101),
    ]);
    // From 170° to about 185.7°: 16° left (Pybricks −16).
    expect(plan.steps).toEqual([
      { kind: 'turn', degrees: -16 },
      { kind: 'straight', mm: 1005 },
    ]);
    expect(plan.items[1]!.steps).toEqual([]);
    // Twenty segments at an awkward angle end close to the last point, forward or backward.
    for (const backward of [false, true]) {
      const points = Array.from({ length: 20 }, (_, i) =>
        point(200 + (i + 1) * 73.3, 200 + (i + 1) * 31.7 * (i % 2 === 0 ? 1 : 1.2), backward),
      );
      const last = planPath(start, points).end;
      const target = points.at(-1) as { xMm: number; yMm: number };
      expect(Math.hypot(last.xMm - target.xMm, last.yMm - target.yMm)).toBeLessThan(2);
    }
  });

  it('keeps what a child types inside what the blocks take', () => {
    expect(cleanItem({ kind: 'turn', degrees: 400.4 })).toEqual({ kind: 'turn', degrees: 360 });
    expect(cleanItem({ kind: 'turn', degrees: -0.2 })).toEqual({ kind: 'turn', degrees: -1 });
    expect(cleanItem({ kind: 'straight', mm: Number.NaN })).toEqual({ kind: 'straight', mm: 1 });
    expect(cleanItem({ kind: 'straight', mm: -12.6 })).toEqual({ kind: 'straight', mm: -13 });
    expect(cleanItem({ kind: 'wait', seconds: 0 })).toEqual({ kind: 'wait', seconds: 0.1 });
    expect(cleanItem({ kind: 'wait', seconds: 2.345 })).toEqual({ kind: 'wait', seconds: 2.3 });
    expect(cleanItem({ kind: 'speed', percent: 1 })).toEqual({ kind: 'speed', percent: 5 });
    expect(cleanItem({ kind: 'speed', percent: 120 })).toEqual({ kind: 'speed', percent: 100 });
    expect(cleanItem({ kind: 'point', xMm: 1.26, yMm: 2, backward: false })).toEqual({
      kind: 'point',
      xMm: 1.3,
      yMm: 2,
    });
  });

  it('runs on the mat and ends where the path ends', async () => {
    const { plan, result } = await runOnMat([point(700, 350), point(1100, 300)]);
    expect(result.end).toEqual({ reason: 'finished' });
    const end = result.frames.at(-1)!.pose;
    expect(end.xMm).toBeCloseTo(plan.end.xMm, 0);
    expect(end.yMm).toBeCloseTo(plan.end.yMm, 0);
    expect(end.headingDeg).toBeCloseTo(plan.end.headingDeg, 0);
  });

  it('runs backward, a wait and a new speed on the mat as the blocks would', async () => {
    const drive = [point(700, 350), point(300, 600, true)];
    const plain = await runOnMat(drive);
    const slower = await runOnMat([{ kind: 'speed', percent: 20 }, ...drive]);
    const waiting = await runOnMat([...drive.slice(0, 1), { kind: 'wait', seconds: 2 }, drive[1]!]);
    for (const { plan, result } of [plain, slower, waiting]) {
      expect(result.end).toEqual({ reason: 'finished' });
      const end = result.frames.at(-1)!.pose;
      expect(end.xMm).toBeCloseTo(plan.end.xMm, 0);
      expect(end.yMm).toBeCloseTo(plan.end.yMm, 0);
    }
    // 20 % is half the drive base's own 40 %, so the drives take longer.
    expect(slower.result.timeMs).toBeGreaterThan(plain.result.timeMs * 1.5);
    // The wait adds its 2 s.
    expect(waiting.result.timeMs - plain.result.timeMs).toBeGreaterThanOrEqual(1990);
    expect(waiting.result.timeMs - plain.result.timeMs).toBeLessThan(2100);
    expect(pathProgram(newRobot('Rover'), slower.plan.steps)).toContain('set_movement_speed(20)');
  });
});
