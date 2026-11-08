import { describe, expect, it } from 'vitest';
import {
  newRobot,
  parseRobotFile,
  readRobot,
  robotData,
  robotProblems,
  robotRecord,
  sameRobot,
  serializeRobotFile,
} from '../robots/profile';
import { applyModel, defaultChoices, modelChanges } from './apply-model';
import { readLdraw } from './model';
import { robotFromModel } from './robot-from-model';
import {
  DRIVE_LINES,
  DRIVING_BASE,
  HUB_LINE,
  IDENTITY,
  SENSOR_LINES,
  realBoxTable,
} from './test-models';

const table = realBoxTable();
const found = (text: string) => {
  const model = readLdraw(text, 'base.ldr');
  if (!model.ok) throw new Error(model.message);
  const result = robotFromModel(model.model, table);
  if (!result.ok) throw new Error(result.message);
  return result.robot;
};
const MODEL = { fileName: 'base.ldr', text: DRIVING_BASE, turned: false };

describe('a robot made from a model', () => {
  it('takes the model’s numbers and keeps what belongs to the real robot', () => {
    const robot = {
      ...newRobot('Rover'),
      notes: 'Our robot',
      massG: 640,
      drift: { perMetreMm: 8, per90Deg: 1.5 },
    };
    const base = found(DRIVING_BASE);
    const next = applyModel(robot, base, defaultChoices(base, robot), MODEL);
    expect(next.name).toBe('Rover');
    expect(next.notes).toBe('Our robot');
    expect(next.massG).toBe(640);
    expect(next.drift).toEqual({ perMetreMm: 8, per90Deg: 1.5 });
    expect(next.body).toEqual({ widthMm: 96, lengthMm: 159.6, heightMm: 76, axleFromBackMm: 60 });
    expect(next.wheels).toEqual({ diameterMm: 56, widthMm: 14, trackMm: 112 });
    expect(next.drive).toEqual({ left: 'A', right: 'B', mirrored: 'left', motor: 'spike-medium' });
    expect(next.sensors).toEqual([
      { type: 'color', port: 'C', xMm: 80, yMm: 0, facing: 'down' },
      { type: 'distance', port: 'D', xMm: 99.6, yMm: 0, facing: 'forward' },
    ]);
    expect(next.model).toEqual(MODEL);
    // The Robots page has nothing to correct.
    expect(robotProblems(next)).toEqual([]);
  });

  it('keeps the robot’s ports where its motors and sensors match', () => {
    const robot = {
      ...newRobot(),
      drive: {
        left: 'E' as const,
        right: 'F' as const,
        mirrored: 'left' as const,
        motor: 'spike-large' as const,
      },
      motors: [{ port: 'B' as const, name: 'Arm' }],
      sensors: [
        {
          type: 'distance' as const,
          port: 'A' as const,
          xMm: 90,
          yMm: 0,
          facing: 'forward' as const,
        },
        { type: 'color' as const, port: 'C' as const, xMm: 70, yMm: 10, facing: 'down' as const },
      ],
    };
    const withArm = found(
      [HUB_LINE, ...DRIVE_LINES, ...SENSOR_LINES, `1 16 0 -150 0 ${IDENTITY} 54675.dat`].join('\n'),
    );
    const choices = defaultChoices(withArm, robot);
    expect(choices).toEqual({
      left: 'E',
      right: 'F',
      sensors: ['C', 'A'],
      motors: [{ port: 'B', name: 'Arm' }],
    });
    const next = applyModel(robot, withArm, choices, MODEL);
    expect(next.motors).toEqual([{ port: 'B', name: 'Arm' }]);
    expect(robotProblems(next)).toEqual([]);
    // A new motor gets a free port and a name to change.
    expect(defaultChoices(withArm, newRobot()).motors).toEqual([{ port: 'E', name: 'Motor 1' }]);
  });

  it('lists what changes', () => {
    const robot = newRobot();
    const base = found(DRIVING_BASE);
    const next = applyModel(robot, base, defaultChoices(base, robot), MODEL);
    expect(modelChanges(robot, next)).toEqual([
      { label: 'Width', now: '160 mm', next: '96 mm' },
      { label: 'Length', now: '200 mm', next: '159.6 mm' },
      { label: 'Height', now: '120 mm', next: '76 mm' },
      { label: 'Axle from the back', now: '70 mm', next: '60 mm' },
      { label: 'Sensors', now: '0', next: '2' },
    ]);
  });
});

describe('a robot keeps its model', () => {
  it('in this browser and in its file, but not in the copy a program keeps', () => {
    const robot = { ...newRobot('Rover'), model: MODEL };
    expect(robotRecord(robot).model).toEqual(MODEL);
    expect(robotData(robot).model).toBeUndefined();
    expect(readRobot(robotRecord(robot))).toEqual(robot);
    expect(readRobot(robotData(robot))!.model).toBeNull();
    // A model changes nothing a program uses.
    expect(sameRobot(robot, { ...robot, model: null })).toBe(true);
    const file = parseRobotFile(serializeRobotFile(robot));
    expect(file).toEqual({ ok: true, robot });
  });

  it('drops a model that is not one', () => {
    const data = robotData(newRobot());
    expect(readRobot({ ...data, model: { text: '' } })!.model).toBeNull();
    expect(readRobot({ ...data, model: 'x' })!.model).toBeNull();
    expect(readRobot({ ...data, model: { text: 'x'.repeat(1_000_001) } })!.model).toBeNull();
    expect(
      readRobot({ ...data, model: { text: '1 16 0 0 0 1 0 0 0 1 0 0 0 1 3001.dat' } })!.model,
    ).toEqual({
      fileName: 'model.ldr',
      text: '1 16 0 0 0 1 0 0 0 1 0 0 0 1 3001.dat',
      turned: false,
    });
  });
});
