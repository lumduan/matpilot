/**
 * Running a program on a mat (ADR 0016, step 7c): the program's own Python files run in
 * MicroPython (WebAssembly), with the simulated `pybricks` (./pybricks.ts) calling into the
 * simulation (./engine.ts) through a JavaScript module named `_sim`. The result is a timeline to
 * play back: the robot's pose over time, what the program printed and showed, and how it ended.
 *
 * This file runs inside a Web Worker in the page (./sim.worker.ts), and in Node for the tests;
 * `load` is MicroPython's own loader in both.
 */
import type { PortName } from '../blocks/pybricks';
import { Simulation, type DriveSettings, type Frame, type Pose, type SimRobot } from './engine';
import { PYBRICKS_FILES, simModule } from './pybricks';

export interface SimFile {
  readonly name: string;
  readonly code: string;
}

export interface SimInput {
  /** The program's files; main.py is where it starts. */
  readonly files: readonly SimFile[];
  readonly robot: SimRobot;
  readonly start: Pose;
  readonly timeLimitMs: number;
  /** Speeds measured or typed in on the Robots page, in place of the firmware's defaults. */
  readonly driveSpeed: DriveSettings | null;
}

export interface SimEvent {
  /** Virtual time, ms. */
  readonly t: number;
  readonly kind: 'print' | 'light' | 'display' | 'sound' | 'sensor';
  readonly text: string;
}

export type SimEnd =
  | { readonly reason: 'finished' }
  | { readonly reason: 'time' }
  | { readonly reason: 'unsupported'; readonly what: string }
  | {
      readonly reason: 'error';
      readonly message: string;
      readonly file: string | null;
      readonly line: number | null;
    }
  | { readonly reason: 'busy' };

export interface SimResult {
  readonly frames: readonly Frame[];
  readonly events: readonly SimEvent[];
  readonly end: SimEnd;
  /** Virtual time when it ended, ms. */
  readonly timeMs: number;
  /** Sensors the program read (they read nothing yet). */
  readonly sensorsRead: readonly string[];
  /** The DriveBase the program made: its idea of the wheels, for comparing with the robot. */
  readonly programDrive: {
    readonly wheelDiameterMm: number;
    readonly trackMm: number;
    readonly left: PortName;
    readonly right: PortName;
  } | null;
}

/** MicroPython's loader (@micropython/micropython-webassembly-pyscript). */
export type LoadMicroPython = (options: {
  url?: string;
  heapsize?: number;
  stdout?: (line: string) => void;
  stderr?: (line: string) => void;
  linebuffer?: boolean;
}) => Promise<{
  FS: {
    mkdir(path: string): void;
    writeFile(path: string, data: string): void;
  };
  registerJsModule(name: string, module: object): void;
  runPython(code: string): unknown;
}>;

/** The Python error's last file and line, and its message, from a traceback. */
export function readTraceback(text: string): {
  message: string;
  file: string | null;
  line: number | null;
} {
  const lines = text.trim().split('\n');
  const message = lines.at(-1)?.trim() ?? text;
  let file: string | null = null;
  let line: number | null = null;
  for (const each of lines) {
    const match = /File "([^"]+)", line (\d+)/.exec(each);
    if (match) {
      file = match[1] === '<stdin>' ? 'main.py' : match[1]!.replace(/^\//, '');
      line = Number(match[2]);
    }
  }
  return { message, file, line };
}

const asPort = (value: unknown) => String(value) as PortName;
const asBool = (value: unknown) => value === true || value === 1;

export async function runProgram(
  load: LoadMicroPython,
  input: SimInput,
  options: { readonly wasmUrl?: string } = {},
): Promise<SimResult> {
  const sim = new Simulation(input.robot, input.start, input.timeLimitMs);
  const events: SimEvent[] = [];
  const errors: string[] = [];
  const sensors = new Map<string, string>();
  const sensorsRead = new Set<string>();
  let unsupported: string | null = null;
  let programDrive: SimResult['programDrive'] = null;

  const mp = await load({
    ...(options.wasmUrl ? { url: options.wasmUrl } : {}),
    heapsize: 8 * 1024 * 1024,
    linebuffer: true,
    stdout: (line) => events.push({ t: sim.time, kind: 'print', text: line }),
    stderr: (line) => errors.push(line),
  });

  const hubEvent = (kind: SimEvent['kind'], text: string) =>
    events.push({ t: sim.time, kind, text });
  const bridge = {
    now: () => sim.time,
    halted: () => sim.over || unsupported !== null,
    tick: () => sim.tick(),
    wait: (ms: unknown) => sim.wait(Number(ms)),
    unsupported: (what: unknown) => {
      unsupported = String(what);
    },
    motor_new: (port: unknown, counterclockwise: unknown) =>
      sim.addMotor(asPort(port), asBool(counterclockwise)),
    motor_angle: (port: unknown) => sim.motorAngle(asPort(port)),
    motor_speed: (port: unknown) => sim.motorSpeed(asPort(port)),
    motor_reset: (port: unknown, angle: unknown) => sim.resetAngle(asPort(port), Number(angle)),
    motor_run: (port: unknown, speed: unknown) => sim.run(asPort(port), Number(speed)),
    motor_run_time: (port: unknown, speed: unknown, ms: unknown, wait: unknown) =>
      sim.runTime(asPort(port), Number(speed), Number(ms), asBool(wait)),
    motor_run_angle: (port: unknown, speed: unknown, angle: unknown, wait: unknown) =>
      sim.runAngle(asPort(port), Number(speed), Number(angle), asBool(wait)),
    motor_run_target: (port: unknown, speed: unknown, target: unknown, wait: unknown) =>
      sim.runTarget(asPort(port), Number(speed), Number(target), asBool(wait)),
    motor_dc: (port: unknown, duty: unknown) => sim.dc(asPort(port), Number(duty)),
    motor_stop: (port: unknown) => sim.stopMotor(asPort(port)),
    motor_done: (port: unknown) => sim.motorDone(asPort(port)),
    limit_speed: (port: unknown) => sim.limits(asPort(port))[0],
    limit_acceleration: (port: unknown) => sim.limits(asPort(port))[1],
    drive_new: (left: unknown, right: unknown, wheel: unknown, track: unknown) => {
      programDrive = {
        wheelDiameterMm: Number(wheel),
        trackMm: Number(track),
        left: asPort(left),
        right: asPort(right),
      };
      sim.addDrive(asPort(left), asPort(right), Number(wheel), Number(track), input.driveSpeed);
    },
    drive_straight: (distance: unknown, wait: unknown) =>
      sim.straight(Number(distance), asBool(wait)),
    drive_turn: (angle: unknown, wait: unknown) => sim.turn(Number(angle), asBool(wait)),
    drive_drive: (speed: unknown, rate: unknown) => sim.driveForever(Number(speed), Number(rate)),
    drive_stop: () => sim.stopDrive(),
    drive_done: () => sim.driveDone(),
    drive_setting: (index: unknown) => {
      const s = sim.settings();
      return (
        [s.straightSpeed, s.straightAcceleration, s.turnRate, s.turnAcceleration][Number(index)] ??
        0
      );
    },
    drive_set: (index: unknown, value: unknown) => {
      const key = (
        ['straightSpeed', 'straightAcceleration', 'turnRate', 'turnAcceleration'] as const
      )[Number(index)];
      if (key) sim.setSettings({ [key]: Number(value) });
    },
    drive_distance: () => sim.driveDistance(),
    drive_angle: () => sim.driveAngle(),
    drive_reset: () => sim.resetDrive(),
    sensor_new: (port: unknown, kind: unknown) => sensors.set(String(port), String(kind)),
    sensor_color: (port: unknown) => {
      sensorsRead.add(`colour sensor on port ${String(port)}`);
      return 'NONE';
    },
    sensor_value: (port: unknown, what: unknown) => {
      const kind = sensors.get(String(port)) ?? 'sensor';
      sensorsRead.add(
        `${kind === 'color' ? 'colour' : kind === 'force' ? 'touch' : kind} sensor on port ${String(port)}`,
      );
      // Nothing seen yet (step 7d): no light back, nothing in range, no press.
      return what === 'distance' ? 2000 : 0;
    },
    hub_event: (kind: unknown, text: unknown) =>
      hubEvent(String(kind) as SimEvent['kind'], String(text)),
  };
  mp.registerJsModule('_simjs', bridge);
  mp.FS.writeFile('/_sim.py', simModule(Object.keys(bridge)));

  mp.FS.mkdir('/pybricks');
  for (const [path, code] of Object.entries(PYBRICKS_FILES)) mp.FS.writeFile(`/${path}`, code);
  const main = input.files.find((file) => file.name === 'main.py') ?? input.files[0];
  for (const file of input.files) {
    if (file !== main) mp.FS.writeFile(`/${file.name}`, file.code);
  }

  let end: SimEnd = { reason: 'finished' };
  try {
    mp.runPython(main?.code ?? '');
  } catch (error) {
    const text = error instanceof Error ? error.message : String(error);
    end = /SystemExit/.test(text)
      ? { reason: 'finished' }
      : { reason: 'error', ...readTraceback(text) };
  }
  if (unsupported !== null) end = { reason: 'unsupported', what: unsupported };
  else if (sim.over && end.reason !== 'error') end = { reason: 'time' };
  sim.finish();
  return {
    frames: sim.frames,
    events,
    end,
    timeMs: sim.time,
    sensorsRead: [...sensorsRead],
    programDrive,
  };
}
