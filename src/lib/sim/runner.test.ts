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

/** A 1000 × 1000 mm mat at 1 px/mm: white, with a black line across at y 600 to 620. */
function linePixels() {
  const data = new Uint8ClampedArray(1000 * 1000 * 4).fill(255);
  for (let row = 1000 - 620; row < 1000 - 600; row += 1) {
    for (let col = 0; col < 1000; col += 1) {
      const i = (row * 1000 + col) * 4;
      data[i] = data[i + 1] = data[i + 2] = 20;
    }
  }
  return { width: 1000, height: 1000, data };
}

const input = (main: string, extra: SimInput['files'] = [], timeLimitMs = 120_000): SimInput => ({
  files: [{ name: 'main.py', code: main }, ...extra],
  robot: ROBOT,
  start: { xMm: 500, yMm: 500, headingDeg: 90 },
  timeLimitMs,
  driveSpeed: null,
  sensors: [
    { type: 'color', port: 'C', xMm: 60, yMm: 0, facing: 'down' },
    { type: 'distance', port: 'D', xMm: 80, yMm: 0, facing: 'forward' },
  ],
  mat: { widthMm: 1000, heightMm: 1000, pixels: linePixels(), objects: [] },
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

  it('times with the stop watch, and reads the mat with its sensors', async () => {
    const result = await runProgram(
      load,
      input(`${DRIVE}
from pybricks.pupdevices import ColorSensor, UltrasonicSensor, ForceSensor
from pybricks.parameters import Color
eye = ColorSensor(Port.C)
sonar = UltrasonicSensor(Port.D)
bump = ForceSensor(Port.E)
timer = StopWatch()
wait(500)
print(timer.time() >= 500, eye.color(), eye.reflection(), sonar.distance(), bump.pressed())
`),
    );
    // The robot at (500, 500) facing up: the colour sensor 60 mm ahead sees white; the
    // distance sensor 80 mm ahead sees the wall at y 1000; no touch sensor on E.
    expect(result.events.map((event) => event.text)).toEqual(['True Color.WHITE 100 420 False']);
    expect(result.sensorsMissing).toEqual(['touch sensor on port E']);
  });

  it('sees a solid object, drives up to it and feels it with a touch sensor', async () => {
    const base = input(`${DRIVE}
from pybricks.pupdevices import UltrasonicSensor, ForceSensor
sonar = UltrasonicSensor(Port.D)
bump = ForceSensor(Port.E)
try:
    print("first", sonar.distance())
    robot.drive(150, 0)
    while not bump.pressed():
        wait(10)
    robot.stop()
    print("pressed at", robot.distance(), sonar.distance())
finally:
    robot.stop()
`);
    const result = await runProgram(load, {
      ...base,
      sensors: [...base.sensors, { type: 'force', port: 'E', xMm: 100, yMm: 0, facing: 'forward' }],
      // A box from y 800 up, across the robot's way.
      mat: { ...base.mat, objects: [{ xMm: 400, yMm: 800, widthMm: 200, heightMm: 100 }] },
    });
    const printed = result.events.filter((event) => event.kind === 'print').map((e) => e.text);
    expect(printed[0]).toBe('first 220');
    // The touch sensor 100 mm ahead presses 5 mm before the box: the wheels stop near 195 mm.
    const [, , distance, sonar] = printed[1]!.split(' ');
    expect(Number(distance)).toBeGreaterThanOrEqual(193);
    expect(Number(distance)).toBeLessThanOrEqual(200);
    expect(Number(sonar)).toBeLessThanOrEqual(30);
    expect(result.sensorsMissing).toEqual([]);
  });

  it('picks only from the colours the program allows, and says which sensor is missing', async () => {
    const base = input(`${DRIVE}
from pybricks.pupdevices import ColorSensor, UltrasonicSensor
from pybricks.parameters import Color
eye = ColorSensor(Port.C)
print(eye.detectable_colors() == (Color.RED, Color.YELLOW, Color.GREEN, Color.BLUE, Color.WHITE, Color.NONE))
eye.detectable_colors([Color.BLACK, Color.WHITE])
robot.straight(50)
print(eye.color(), eye.hsv().v < 30)
side = UltrasonicSensor(Port.F)
print(side.distance())
`);
    const result = await runProgram(load, {
      ...base,
      sensors: [...base.sensors, { type: 'distance', port: 'F', xMm: 0, yMm: 0, facing: 'down' }],
    });
    expect(result.events.map((event) => event.text)).toEqual(['True', 'Color.BLACK True', '2000']);
    expect(result.sensorsMissing).toEqual([
      'distance sensor looking forward, back, left or right on port F',
    ]);
  });

  it('follows a line: drives until the colour sensor sees black', async () => {
    const result = await runProgram(
      load,
      input(`${DRIVE}
from pybricks.pupdevices import ColorSensor
eye = ColorSensor(Port.C)
try:
    robot.drive(100, 0)
    while eye.reflection() > 50:
        wait(10)
    robot.stop()
    print("black at", robot.distance())
finally:
    robot.stop()
`),
    );
    // The sensor is 60 mm ahead of the wheels and the line starts at y 600: about 40 mm on.
    const printed = result.events.find((event) => event.kind === 'print')!.text;
    const distance = Number(printed.split(' ').at(-1));
    expect(distance).toBeGreaterThanOrEqual(38);
    expect(distance).toBeLessThanOrEqual(44);
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
