/**
 * What the program needs plugged in, against what the connected hub sees (asked for after the
 * maintainer's Xbox try on 2026-11-08: the ready-made controller group made a motor on port C,
 * port C was empty, so the program stopped on its first Setup line, before it even looked for
 * the controller, and the page said nothing).
 *
 * Making a device on a port with nothing in it raises OSError (ENODEV) at once, with Pybricks'
 * message "A sensor or motor is not connected to the specified port", at pybricks-micropython
 * v4.1.3 (FW = https://github.com/pybricks/pybricks-micropython/blob/c860b6a00301fb7c6ecd429da11dcb5a6c557c7a/):
 * a motor, FW pybricks/common/pb_type_motor.c#L121-L126; a sensor, FW
 * pybricks/common/pb_type_device.c#L169-L195; the message, FW pybricks/util_pb/pb_error.c#L73-L79 #L115-L117.
 * The Setup section makes every device before anything else runs, so one missing device stops
 * the whole program.
 */
import type { PortHint, PortHints } from './fields/hints';
import type { PortDeviceKind } from './generator-context';
import type { PortName } from './pybricks';

/** One device the program makes on a port. */
export interface HardwareUse {
  readonly port: PortName;
  readonly device: PortDeviceKind;
  /** The block to show; `null` when the robot chosen above the blocks sets it. */
  readonly blockId: string | null;
  readonly tabId: string;
  /** What needs it, for a message: a block's words, a set-up name, or a wheel. */
  readonly what: string;
}

/** A port whose device is not what the program needs. */
export interface HardwareWarning {
  readonly blockId: string | null;
  readonly tabId: string;
  readonly message: string;
}

const KIND: Readonly<Record<PortDeviceKind, PortHint['kind']>> = {
  Motor: 'motor',
  ColorSensor: 'color',
  UltrasonicSensor: 'distance',
  ForceSensor: 'force',
};

const LABEL: Readonly<Record<PortDeviceKind, string>> = {
  Motor: 'a motor',
  ColorSensor: 'a colour sensor',
  UltrasonicSensor: 'a distance sensor',
  ForceSensor: 'a touch sensor',
};

/**
 * The ports where the hub sees nothing, or another device, than the program needs. A port the
 * hub has not reported (no hub, or live values off) is not checked.
 */
export function hardwareWarnings(
  uses: readonly HardwareUse[],
  hints: PortHints,
): HardwareWarning[] {
  const warnings: HardwareWarning[] = [];
  const done = new Set<PortName>();
  for (const use of uses) {
    if (done.has(use.port)) continue;
    const hint = hints[use.port];
    if (hint === undefined) continue;
    const needed = LABEL[use.device];
    if (hint === null) {
      done.add(use.port);
      warnings.push({
        blockId: use.blockId,
        tabId: use.tabId,
        message: `Port ${use.port} is empty, but ${use.what} needs ${needed} there. The program would stop as soon as it starts. Plug ${needed} into ${use.port}, or choose another port.`,
      });
    } else if (hint.kind !== KIND[use.device]) {
      done.add(use.port);
      warnings.push({
        blockId: use.blockId,
        tabId: use.tabId,
        message: `Port ${use.port} has a ${hint.name}, but ${use.what} needs ${needed} there. Plug ${needed} into ${use.port}, or choose another port.`,
      });
    }
  }
  return warnings;
}

/** The device line a program stopped on because its port had nothing, or something else, in it. */
export interface MissingDevice {
  readonly port: PortName;
  readonly device: PortDeviceKind;
  /** The Python name, such as `motor_c`. */
  readonly name: string;
  readonly file: string;
  readonly line: number;
  readonly message: string;
}

const DEVICE_LINE = /^\s*(\w+) = (Motor|ColorSensor|UltrasonicSensor|ForceSensor)\((\w+)\b/;

/**
 * Reads a run's output: when the hub stopped the program with ENODEV on a line that makes a
 * device, says which port. `output` is the run's lines; `files` the program's files. Pybricks
 * prints the traceback's file and line, then `OSError: [Errno 19] ENODEV` (FW
 * pybricks/util_pb/pb_error.c#L115-L117).
 */
export function missingDevice(
  output: readonly string[],
  files: readonly { readonly name: string; readonly code: string }[],
): MissingDevice | null {
  const error = output.findIndex((text) => /\bENODEV\b/.test(text));
  if (error < 0) return null;
  let file: string | null = null;
  let line = 0;
  for (const text of output.slice(0, error)) {
    const match = /File "([^"]+)", line (\d+)/.exec(text);
    if (match) {
      file = match[1]!.replace(/^.*\//, '');
      line = Number(match[2]);
    }
  }
  const source = files.find((each) => each.name === file);
  const code = source?.code.split('\n')[line - 1];
  const made = code === undefined ? null : DEVICE_LINE.exec(code);
  if (!source || !made) return null;
  const [, name, device, constant] = made as unknown as [string, string, PortDeviceKind, string];
  const config = new RegExp(`^${constant} = Port\\.([A-F])$`, 'm');
  const port = files.map((each) => config.exec(each.code)?.[1]).find(Boolean) as
    PortName | undefined;
  if (!port) return null;
  return {
    port,
    device,
    name,
    file: source.name,
    line,
    message: `The program stopped at its start: port ${port} has no ${LABEL[device].slice(2)} (line ${line} of ${source.name}: ${code!.trim()}). Plug ${LABEL[device]} into ${port}, or change the port in the blocks.`,
  };
}
