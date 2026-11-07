import { describe, expect, it } from 'vitest';
import {
  newRobot,
  parseRobotFile,
  readRobot,
  robotData,
  robotFileName,
  robotProblems,
  sameRobot,
  serializeRobotFile,
  type RobotProfile,
} from './profile';

const rover = (): RobotProfile => ({ ...newRobot('Rover'), id: 'r-1' });

describe('a robot profile', () => {
  it('starts as the drive base the blocks assume without one', () => {
    const robot = newRobot();
    expect(robot.drive).toMatchObject({ left: 'A', right: 'B', mirrored: 'left' });
    expect(robot.wheels).toMatchObject({ diameterMm: 56, trackMm: 112 });
    expect(robot.speed).toEqual({ mode: 'auto' });
    expect(robotProblems(robot)).toEqual([]);
  });

  it('round-trips through its file', () => {
    const robot: RobotProfile = {
      ...rover(),
      motors: [{ port: 'C', name: 'arm' }],
      sensors: [{ type: 'color', port: 'E', xMm: 40, yMm: 0, facing: 'down' }],
      speed: {
        mode: 'set',
        straightMmS: 250,
        straightAccelerationMmS2: 600,
        turnRateDegS: 120,
        turnAccelerationDegS2: 500,
      },
      massG: 820,
      drift: { perMetreMm: 12, per90Deg: null },
    };
    const text = serializeRobotFile(robot);
    expect(JSON.parse(text)).toMatchObject({ format: 'matpilot-robot', version: 1 });
    expect(parseRobotFile(text)).toEqual({ ok: true, robot });
    expect(sameRobot(robot, readRobot(robotData(robot)))).toBe(true);
  });

  it('explains files it cannot open', () => {
    expect(parseRobotFile('nope')).toMatchObject({ ok: false, message: /not JSON/ });
    expect(parseRobotFile('{"format":"matpilot-blocks"}')).toMatchObject({ ok: false });
    expect(parseRobotFile('{"format":"matpilot-robot","version":2,"robot":{}}')).toMatchObject({
      ok: false,
      message: /newer MatPilot/,
    });
    expect(
      parseRobotFile('{"format":"matpilot-robot","version":1,"robot":{"name":"x"}}'),
    ).toMatchObject({
      ok: false,
      message: /damaged/,
    });
  });

  it('keeps unknown values out and unsafe characters out of the name', () => {
    const robot = readRobot({
      ...robotData(rover()),
      name: '  a/b:c  ',
      drive: { left: 'Z', right: 'B', mirrored: 'up', motor: 'v8' },
      sensors: [{ type: 'camera', port: 'C', xMm: 'x', facing: 'sideways' }],
    })!;
    expect(robot.name).toBe('a b c');
    expect(robot.drive).toEqual({ left: 'A', right: 'B', mirrored: 'left', motor: 'spike-medium' });
    expect(robot.sensors).toEqual([{ type: 'color', port: 'C', xMm: 0, yMm: 0, facing: 'down' }]);
    expect(robotFileName('Rover 1')).toBe('Rover 1.matpilot-robot.json');
  });

  it('says what is wrong, field by field', () => {
    const base = rover();
    const robot: RobotProfile = {
      ...base,
      body: { ...base.body, axleFromBackMm: 300 },
      wheels: { ...base.wheels, diameterMm: 5, trackMm: 10, widthMm: 14 },
      drive: { ...base.drive, right: 'A' },
      motors: [{ port: 'A', name: '' }],
    };
    expect(robotProblems(robot).map((problem) => problem.field)).toEqual([
      'body.axleFromBackMm',
      'wheels.diameterMm',
      'wheels.trackMm',
      'drive.right',
      'motors.0.port',
      'motors.0.name',
    ]);
    // Wheels that overlap, with sizes in range.
    const overlapping: RobotProfile = {
      ...base,
      wheels: { ...base.wheels, trackMm: 30, widthMm: 40 },
    };
    expect(robotProblems(overlapping)).toEqual([
      { field: 'wheels.trackMm', message: expect.stringContaining('overlap') as string },
    ]);
  });
});
