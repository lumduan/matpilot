import { loadMicroPython } from '@micropython/micropython-webassembly-pyscript';
import { describe, expect, it } from 'vitest';
import type { SimRobot } from './engine';
import { readTraceback, runProgram, type LoadMicroPython, type SimInput } from './runner';

const ROBOT: SimRobot = {
  wheelDiameterMm: 56,
  trackMm: 112,
  left: 'A',
  right: 'B',
  mirrored: 'left',
  motorTopSpeedDegS: 1000,
};
const load = loadMicroPython as unknown as LoadMicroPython;

const input = (main: string, extra: SimInput['files'] = [], timeLimitMs = 120_000): SimInput => ({
  files: [{ name: 'main.py', code: main }, ...extra],
  robot: ROBOT,
  start: { xMm: 500, yMm: 500, headingDeg: 90 },
  timeLimitMs,
  driveSpeed: null,
});

const DRIVE = `from pybricks.parameters import Direction, Port
from pybricks.pupdevices import Motor
from pybricks.robotics import DriveBase
from pybricks.tools import wait, StopWatch

left = Motor(Port.A, positive_direction=Direction.COUNTERCLOCKWISE)
right = Motor(Port.B)
robot = DriveBase(left, right, 56, 112)
`;

describe('a program on the mat', () => {
  it('runs the Python, moving the robot by its own wheels', async () => {
    const result = await runProgram(
      load,
      input(`${DRIVE}
try:
    robot.straight(200)
    robot.turn(90)
    robot.straight(100)
    print("done", robot.distance(), robot.angle())
finally:
    robot.stop()
`),
    );
    expect(result.end).toEqual({ reason: 'finished' });
    const last = result.frames.at(-1)!.pose;
    // Facing +y (90°): 200 mm up, a right turn to face +x, 100 mm right.
    expect(last.xMm).toBeCloseTo(600, 3);
    expect(last.yMm).toBeCloseTo(700, 3);
    expect(last.headingDeg).toBeCloseTo(0, 3);
    expect(result.events.find((event) => event.kind === 'print')?.text).toBe('done 300 90');
    expect(result.programDrive).toEqual({
      wheelDiameterMm: 56,
      trackMm: 112,
      left: 'A',
      right: 'B',
    });
  });

  it('runs every module of a program in tabs', async () => {
    const result = await runProgram(
      load,
      input(
        `${DRIVE}
import shapes
try:
    shapes.square(robot, 100)
finally:
    robot.stop()
`,
        [
          {
            name: 'shapes.py',
            code: 'def square(robot, side):\n    for i in range(4):\n        robot.straight(side)\n        robot.turn(90)\n',
          },
        ],
      ),
    );
    expect(result.end).toEqual({ reason: 'finished' });
    const last = result.frames.at(-1)!.pose;
    expect(last.xMm).toBeCloseTo(500, 3);
    expect(last.yMm).toBeCloseTo(500, 3);
  });

  it('stops at the time limit, running the program’s finally', async () => {
    const result = await runProgram(
      load,
      input(
        `${DRIVE}
try:
    while True:
        robot.drive(100, 0)
        wait(10)
finally:
    robot.stop()
    print("stopped")
`,
        [],
        3000,
      ),
    );
    expect(result.end).toEqual({ reason: 'time' });
    expect(result.timeMs).toBe(3000);
    expect(result.events.at(-1)?.text).toBe('stopped');
  });

  it('times with the stop watch and reads sensors that see nothing yet', async () => {
    const result = await runProgram(
      load,
      input(`${DRIVE}
from pybricks.pupdevices import ColorSensor, UltrasonicSensor
from pybricks.parameters import Color
eye = ColorSensor(Port.C)
sonar = UltrasonicSensor(Port.D)
timer = StopWatch()
wait(500)
print(timer.time() >= 500, eye.color() == Color.NONE, sonar.distance())
`),
    );
    expect(result.events.map((event) => event.text)).toEqual(['True True 2000']);
    expect(result.sensorsRead).toEqual(['colour sensor on port C', 'distance sensor on port D']);
  });

  it('says where a Python error is', async () => {
    const result = await runProgram(load, input('x = 1\nprint(y)\n'));
    expect(result.end).toMatchObject({ reason: 'error', file: 'main.py', line: 2 });
    expect((result.end as { message: string }).message).toMatch(/NameError/);
  });

  it('says what the mat cannot run yet', async () => {
    const result = await runProgram(
      load,
      input('from pybricks.iodevices import XboxController\npad = XboxController()\n'),
    );
    expect(result.end).toEqual({ reason: 'unsupported', what: 'the Xbox controller' });
  });

  it('reads tracebacks', () => {
    expect(
      readTraceback(
        'Traceback (most recent call last):\n  File "<stdin>", line 5, in <module>\n  File "/shapes.py", line 3, in square\nNameError: name \'x\' isn\'t defined\n',
      ),
    ).toEqual({ message: "NameError: name 'x' isn't defined", file: 'shapes.py', line: 3 });
  });
});
