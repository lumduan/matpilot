import { describe, expect, it } from 'vitest';
import { readLdraw } from './model';
import { robotFromModel } from './robot-from-model';
import {
  DRIVE_LINES,
  DRIVING_BASE,
  DRIVING_BASE_MPD,
  HUB_LINE,
  IDENTITY,
  LOOK_DOWN,
  SENSOR_LINES,
  SHAFT_MINUS_X,
  SHAFT_PLUS_X,
  WHEEL,
  realBoxTable,
} from './test-models';

const table = realBoxTable();

const robotOf = (text: string, turned = false) => {
  const model = readLdraw(text, 'robot.ldr');
  if (!model.ok) throw new Error(model.message);
  const result = robotFromModel(model.model, table, { turned });
  if (!result.ok) throw new Error(result.message);
  return result.robot;
};

describe('a robot from a LEGO model', () => {
  it('measures the driving base: body, wheels, axle track and drive motors', () => {
    const robot = robotOf(DRIVING_BASE);
    // Worked out by hand from the parts' boxes (test-models.ts): the motors reach 150 LDU back,
    // the distance sensor 249 LDU ahead; the motors 120 LDU to each side; the hub's top is
    // 120 LDU up from the wheels' middle, which is 70 LDU above the floor.
    expect(robot.body).toEqual({
      widthMm: 96,
      lengthMm: 159.6,
      heightMm: 76,
      axleFromBackMm: 60,
      leftMm: 48,
      rightMm: 48,
    });
    expect(robot.wheels).toEqual({
      label: 'Wheel 56 mm',
      diameterMm: 56,
      widthMm: 14,
      trackMm: 112,
    });
    // Both shafts point out: the left motor is the one turned round, as on MatPilot's default robot.
    expect(robot.drive).toEqual({ motor: 'spike-medium', mirrored: 'left' });
    expect(robot.motors.map((motor) => [motor.drives, motor.yMm > 0])).toEqual([
      ['left', true],
      ['right', false],
    ]);
    expect(robot.hub).toBe('SPIKE Prime hub');
    expect(robot.front.reason).toBe('The distance sensor looks this way.');
    expect(robot.notes).toEqual([]);
    expect(robot.partCount).toBe(7);
    expect(robot.parts.map((part) => part.kind)).toEqual([
      'hub',
      'drive-wheel',
      'drive-wheel',
      'motor',
      'motor',
      'sensor',
      'sensor',
    ]);
  });

  it('finds each sensor, where its front is and which way it looks', () => {
    const robot = robotOf(DRIVING_BASE);
    expect(robot.sensors).toEqual([
      {
        label: 'Colour sensor',
        sensor: 'color',
        guessed: false,
        xMm: 80,
        yMm: 0,
        zMm: 10,
        facing: 'down',
        tiltDeg: 0,
      },
      {
        label: 'Distance sensor',
        sensor: 'distance',
        guessed: false,
        xMm: 99.6,
        yMm: 0,
        zMm: 52,
        facing: 'forward',
        tiltDeg: 0,
      },
    ]);
  });

  it('reads a .mpd with submodels the same as one flat model', () => {
    expect(robotOf(DRIVING_BASE_MPD)).toEqual(robotOf(DRIVING_BASE));
  });

  it('turns the front round when asked: left and right swap, the sensors go behind', () => {
    const robot = robotOf(DRIVING_BASE, true);
    expect(robot.body.axleFromBackMm).toBe(99.6);
    expect(robot.body.lengthMm).toBe(159.6);
    expect(robot.sensors.map((sensor) => [sensor.xMm, sensor.facing])).toEqual([
      [-80, 'down'],
      [-99.6, 'backward'],
    ]);
    // Still symmetric: the motor on the new left points left.
    expect(robot.drive.mirrored).toBe('left');
    expect(robot.front).toEqual({ turned: true, reason: 'You turned it round.' });
  });

  it('guesses the front from the colour sensor, then from the longer side', () => {
    const colourOnly = [HUB_LINE, ...DRIVE_LINES, SENSOR_LINES[0]!].join('\n');
    const byColour = robotOf(colourOnly);
    expect(byColour.front.reason).toBe('The colour sensor is on this side.');
    expect(byColour.sensors[0]!.xMm).toBe(80);
    // A long beam behind the wheels: that side is the front.
    const longer = [...DRIVE_LINES, `1 16 0 -30 300 ${IDENTITY} 32524.dat`].join('\n');
    const byBody = robotOf(longer);
    expect(byBody.front.reason).toBe('The body is longer on this side of the wheels.');
    expect(byBody.body.axleFromBackMm).toBeLessThan(byBody.body.lengthMm / 2);
  });

  it('marks the right motor turned round when both shafts point in', () => {
    const inward = [
      `1 0 140 0 0 ${WHEEL} 39367p01.dat`,
      `1 0 -140 0 0 ${WHEEL} 39367p01.dat`,
      // Shafts on the axle line, pointing to the middle.
      `1 16 170 0 0 ${SHAFT_MINUS_X} 54675.dat`,
      `1 16 -170 0 0 ${SHAFT_PLUS_X} 54675.dat`,
      SENSOR_LINES[1]!,
    ].join('\n');
    const robot = robotOf(inward);
    expect(robot.drive).toEqual({ motor: 'spike-large', mirrored: 'right' });
    expect(robot.motors.map((motor) => motor.drives)).toEqual(['left', 'right']);
  });

  it('says what it cannot tell', () => {
    const sameWay = [
      `1 0 140 0 0 ${WHEEL} 39367p01.dat`,
      `1 0 -140 0 0 ${WHEEL} 39367p01.dat`,
      `1 16 70 0 0 ${SHAFT_PLUS_X} 54696p01.dat`,
      `1 16 -190 0 0 ${SHAFT_PLUS_X} 54696p01.dat`,
      `1 16 0 -60 -180 ${IDENTITY} 37316.dat`,
      `1 16 300 -20 0 ${IDENTITY} 99999zz.dat`,
      `1 16 0 -20 0 ${LOOK_DOWN} 37308p05.dat`,
    ].join('\n');
    const robot = robotOf(sameWay);
    expect(robot.notes).toEqual([
      'The body reaches 120 mm to the left of the middle and 88 mm to the right. MatPilot draws it as wide on both sides, 240 mm.',
      'Both drive motors face the same way, so MatPilot cannot tell which one must turn the other way round. Check that the robot drives forward.',
      'MatPilot knows one part (colour sensor) only by its number, not its exact version: check where it is.',
      'MatPilot found no hub in this model.',
      'MatPilot does not know one part in this model, so the size counts only where it is, not how big.',
    ]);
    expect(robot.unknown).toEqual([{ name: '99999zz', count: 1 }]);
    expect(robot.motors[0]!.drives).toBe('left');
  });

  it('finds a wheel made of a rim and a tyre from the size table', () => {
    // Technic rim 56145 with its tyre 55976 (the library calls them a wheel and a tyre): the
    // table's boxes show they turn about their Z, so they are placed like the SPIKE wheels.
    const rim = table.parts.get('56145')!;
    const tyre = table.parts.get('55976')!;
    expect(rim.wheel && tyre.wheel).toBe(true);
    const lines = [
      `1 71 150 0 0 ${WHEEL} 56145.dat`,
      `1 0 150 0 0 ${WHEEL} 55976.dat`,
      `1 71 -150 0 0 ${WHEEL} 56145.dat`,
      `1 0 -150 0 0 ${WHEEL} 55976.dat`,
      `1 16 0 -40 0 ${IDENTITY} 45601.dat`,
    ].join('\n');
    const robot = robotOf(lines);
    expect(robot.wheels.diameterMm).toBeCloseTo((tyre.max[1] - tyre.min[1]) * 0.4, 0);
    expect(robot.wheels.trackMm).toBe(120);
    expect(robot.parts.filter((part) => part.kind === 'drive-wheel')).toHaveLength(4);
    expect(robot.notes).toContain(
      'MatPilot found no motor for each drive wheel: choose the drive motors’ type on the Robots page.',
    );
  });

  it('refuses a model without a pair of wheels', () => {
    const model = readLdraw(HUB_LINE, 'hub.ldr');
    if (!model.ok) throw new Error(model.message);
    expect(robotFromModel(model.model, table)).toEqual({
      ok: false,
      message:
        'MatPilot found no wheels in this model. A robot that drives needs a wheel on each side, turning on one line.',
    });
    const one = readLdraw([HUB_LINE, DRIVE_LINES[0]!].join('\n'), 'one.ldr');
    if (!one.ok) throw new Error(one.message);
    expect(robotFromModel(one.model, table)).toEqual({
      ok: false,
      message:
        'MatPilot found no two wheels on one axle. A robot that drives needs a wheel on each side, turning on one line.',
    });
  });
});
