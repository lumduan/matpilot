import { loadMicroPython } from '@micropython/micropython-webassembly-pyscript';
import { describe, expect, it, vi } from 'vitest';
import { compilePython } from '@/lib/pybricks/compiler';
import { runProgram, type LoadMicroPython } from '../sim/runner';
import {
  applyCalibration,
  calibrate,
  calibrationProgram,
  turnedDegrees,
  type CalibrationKind,
} from './calibrate';
import { newRobot } from './profile';

const robot = newRobot('Rover'); // 56 mm wheels, 112 mm apart, left motor mirrored
const load = loadMicroPython as unknown as LoadMicroPython;

/** Runs a calibration program on a simulated robot whose real wheels are `real`. */
async function runOn(kind: CalibrationKind, real: { wheelDiameterMm: number; trackMm: number }) {
  const result = await runProgram(load, {
    files: [{ name: 'main.py', code: calibrationProgram(robot, kind) }],
    robot: {
      ...real,
      left: robot.drive.left,
      right: robot.drive.right,
      mirrored: robot.drive.mirrored,
      motorTopSpeedDegS: 1000,
    },
    start: { xMm: 0, yMm: 0, headingDeg: 0 },
    timeLimitMs: 120_000,
    driveSpeed: null,
    sensors: [],
    mat: { widthMm: 3000, heightMm: 3000, pixels: null, objects: [] },
  });
  expect(result.end).toEqual({ reason: 'finished' });
  return result.frames.at(-1)!.pose;
}

describe('the calibration programs', () => {
  it('follow the hub code rules and compile with the real compiler', async () => {
    vi.stubGlobal('fetch', undefined);
    try {
      for (const kind of ['straight', 'turn'] as const) {
        const code = calibrationProgram(robot, kind);
        expect(code).toContain('LEFT_MOTOR_PORT = Port.A');
        expect(code).toContain(
          'left = Motor(LEFT_MOTOR_PORT, positive_direction=Direction.COUNTERCLOCKWISE)',
        );
        expect(code).toContain('robot = DriveBase(left, right, WHEEL_DIAMETER_MM, AXLE_TRACK_MM)');
        expect(code).toMatch(
          /finally:\n {4}robot\.stop\(\)\n {4}left\.stop\(\)\n {4}right\.stop\(\)/,
        );
        const outcome = await compilePython(code);
        expect(outcome.ok, outcome.ok ? '' : outcome.error.message).toBe(true);
      }
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it('drive 1000 mm and turn ten times clockwise on a robot that matches', async () => {
    const real = { wheelDiameterMm: 56, trackMm: 112 };
    const straight = await runOn('straight', real);
    expect(straight.xMm).toBeCloseTo(1000, 0);
    const turn = await runOn('turn', real);
    // Clockwise: the MAT frame counts counter-clockwise.
    expect(turn.headingDeg).toBeCloseTo(-3600, 0);
  });

  it('find the real wheels and axle track from what a ruler measures', async () => {
    const real = { wheelDiameterMm: 62.4, trackMm: 120 };
    const driven = (await runOn('straight', real)).xMm;
    const turned = -(await runOn('turn', real)).headingDeg;
    expect(driven).toBeCloseTo(1114.3, 0);
    const result = calibrate(
      { wheelDiameterMm: 56, trackMm: 112 },
      { drivenMm: Math.round(driven), sidewaysMm: null, turnedDeg: Math.round(turned) },
    );
    expect(result).toEqual({
      ok: true,
      wheelDiameterMm: 62.4,
      trackMm: 120,
      driftPerMetreMm: null,
    });
  });
});

describe('calibrate', () => {
  const basis = { wheelDiameterMm: 56, trackMm: 112 };

  it('counts whole turns, then where it stopped', () => {
    expect(turnedDegrees(10, 'exactly', 30)).toBe(3600);
    expect(turnedDegrees(10, 'before', 30)).toBe(3570);
    expect(turnedDegrees(10, 'past', 30)).toBe(3630);
    expect(turnedDegrees(11, 'before', 90)).toBe(3870);
  });

  it('corrects only what was measured', () => {
    expect(calibrate(basis, { drivenMm: 1020, sidewaysMm: null, turnedDeg: null })).toEqual({
      ok: true,
      wheelDiameterMm: 57.1,
      // Not measured, so kept: the new wheel size alone already corrects the turns.
      trackMm: 112,
      driftPerMetreMm: null,
    });
    // It turned past: wheels further apart turn less, so these are closer than 112 mm.
    expect(calibrate(basis, { drivenMm: null, sidewaysMm: -15, turnedDeg: 3700 })).toEqual({
      ok: true,
      wheelDiameterMm: 56,
      trackMm: 109,
      driftPerMetreMm: 15,
    });
  });

  it('asks again for numbers that cannot be right', () => {
    expect(calibrate(basis, { drivenMm: null, sidewaysMm: null, turnedDeg: null })).toMatchObject({
      ok: false,
    });
    expect(calibrate(basis, { drivenMm: 100, sidewaysMm: null, turnedDeg: null })).toMatchObject({
      ok: false,
      message: expect.stringContaining('about 1000 mm'),
    });
    expect(calibrate(basis, { drivenMm: null, sidewaysMm: null, turnedDeg: 360 })).toMatchObject({
      ok: false,
      message: expect.stringContaining('about 10 times'),
    });
  });

  it('writes the numbers into the robot', () => {
    const result = calibrate(basis, { drivenMm: 1114, sidewaysMm: 8, turnedDeg: 3744 });
    if (!result.ok) throw new Error(result.message);
    const next = applyCalibration(robot, result);
    expect(next.wheels).toEqual({ ...robot.wheels, diameterMm: 62.4, trackMm: 120 });
    expect(next.drift).toEqual({ perMetreMm: 8, per90Deg: null });
    expect(next.name).toBe('Rover');
  });
});
