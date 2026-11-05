/**
 * The live device values reader: a small MicroPython program that MatPilot pastes into the hub's
 * REPL (docs/adr/0009-live-device-values.md). It finds what is plugged into ports A to F, reads
 * each device about six times a second, and prints one line per reading. It never writes to a
 * device: it moves no motor and changes no light.
 *
 * It runs in the REPL, so the program the user downloaded stays in its slot and still starts from
 * the hub's button. It ends by itself when MatPilot stops sending its keep-alive byte for
 * KEEPALIVE_TIMEOUT_MS (for example when the Bluetooth link is lost), so it never keeps the hub
 * busy unattended.
 *
 * Every Pybricks name is cited at v4.0.1,
 * FW = https://github.com/pybricks/pybricks-micropython/blob/4104553405decb0384bcfb030fbfcb4b5a9854cc/
 * and its MicroPython, MP = https://github.com/pybricks/micropython/blob/13580b6ad057173f62e8b2363e01d6851bcc6699/
 *
 * - pybricks.iodevices.PUPDevice: FW pybricks/iodevices/pb_module_iodevices.c#L86. Its info()
 *   returns a dict whose "id" is the device type id: FW pybricks/iodevices/pb_type_iodevices_pupdevice.c#L91-L128.
 *   On an empty port the constructor raises OSError (ENODEV) at once, without waiting: the LEGO
 *   UART device reports "no device" (FW lib/pbio/src/port_lump.c#L1089-L1093), which
 *   FW pybricks/common/pb_type_device.c#L145-L170 raises.
 * - Device type ids (61 colour, 62 ultrasonic, 63 force; the motors): FW lib/lego/lego/lump.h#L428-L486
 * - Motor(port) raises OSError for a device that is not a motor with rotation sensors:
 *   FW pybricks/common/pb_type_motor.c#L120-L126. It resets the angle to the absolute position
 *   (reset_angle=True): #L84, #L129-L134.
 * - Motor.angle(), speed(); ColorSensor.color(), reflection(); UltrasonicSensor.distance();
 *   ForceSensor.force(), pressed(); PrimeHub().imu.tilt(): cited in src/lib/blocks/pybricks.ts.
 *   ColorSensor.color() and reflection() use the same sensor mode (RGB_I), so reading both does
 *   not switch modes: FW pybricks/pupdevices/pb_type_pupdevices_colorsensor.c#L49-L55 #L109-L116
 * - color() returns one of the default colours, in this order: FW pybricks/util_pb/pb_color_map.c#L45-L56
 * - Keep-alive: select.poll() on sys.stdin. Prime has `select` and sys.stdin
 *   (FW bricks/_common/mpconfigport.h#L22 #L26 #L97; level 1 on Prime: bricks/primehub/mpconfigport.h#L70),
 *   and the hub reports stdin as readable when bytes are waiting: FW bricks/_common/mphalport.c#L34-L42.
 *   MP extmod/modselect.c#L674, MP py/modsys.c#L344.
 * - `raise SystemExit` at the end makes the REPL itself exit, so the hub reports that no program
 *   runs: MP shared/runtime/pyexec.c#L142-L145 and #L671-L674. MatPilot's STOP does the same
 *   (FW bricks/_common/micropython.c#L45-L57).
 */

/** Device type ids from FW lib/lego/lego/lump.h#L428-L486. */
export const TYPE_ID = {
  COLOR_SENSOR: 61,
  ULTRASONIC_SENSOR: 62,
  FORCE_SENSOR: 63,
} as const;

/** Colours that ColorSensor.color() reports by default, in the order of pb_color_map.c. */
export const LIVE_COLORS = ['RED', 'YELLOW', 'GREEN', 'BLUE', 'WHITE', 'NONE'] as const;
export type LiveColor = (typeof LIVE_COLORS)[number];

/** Every line the reader prints starts with this word. */
export const LIVE_PREFIX = '@mpv';

export const READ_INTERVAL_MS = 150;
export const KEEPALIVE_INTERVAL_MS = 1000;
export const KEEPALIVE_TIMEOUT_MS = 4000;
/** Empty ports are checked again every this many readings (about once a second). */
const RESCAN_EVERY = 8;

/** The reader as readable Python (4-space indents). Tests compile it with the real compiler. */
export const LIVE_VIEW_SOURCE = `import select
import sys
from pybricks.hubs import PrimeHub
from pybricks.iodevices import PUPDevice
from pybricks.parameters import Color, Port
from pybricks.pupdevices import ColorSensor, ForceSensor, Motor, UltrasonicSensor
from pybricks.tools import StopWatch, wait

PORTS = (Port.A, Port.B, Port.C, Port.D, Port.E, Port.F)
COLORS = (${LIVE_COLORS.map((name) => `Color.${name}`).join(', ')})


def detect(port):
    try:
        kind = PUPDevice(port).info()["id"]
    except OSError:
        return None
    try:
        if kind == ${TYPE_ID.COLOR_SENSOR}:
            return (kind, ColorSensor(port))
        if kind == ${TYPE_ID.ULTRASONIC_SENSOR}:
            return (kind, UltrasonicSensor(port))
        if kind == ${TYPE_ID.FORCE_SENSOR}:
            return (kind, ForceSensor(port))
        return (kind, Motor(port))
    except OSError:
        return (kind, None)


def read(kind, device):
    if device is None:
        return ""
    if kind == ${TYPE_ID.COLOR_SENSOR}:
        color = device.color()
        index = COLORS.index(color) if color in COLORS else -1
        return "%d,%d" % (index, device.reflection())
    if kind == ${TYPE_ID.ULTRASONIC_SENSOR}:
        return "%d" % device.distance()
    if kind == ${TYPE_ID.FORCE_SENSOR}:
        return "%d,%d" % (int(device.force() * 10), 1 if device.pressed() else 0)
    return "%d,%d" % (device.angle(), device.speed())


def main():
    hub = PrimeHub()
    devices = [None] * 6
    poller = select.poll()
    poller.register(sys.stdin)
    clock = StopWatch()
    heard = 0
    count = 0
    print("${LIVE_PREFIX} start 1")
    while clock.time() - heard < ${KEEPALIVE_TIMEOUT_MS}:
        while poller.poll(0):
            sys.stdin.read(1)
            heard = clock.time()
        parts = []
        for i in range(6):
            if devices[i] is None and count % ${RESCAN_EVERY} == 0:
                devices[i] = detect(PORTS[i])
            entry = devices[i]
            if entry is None:
                parts.append("-")
                continue
            try:
                parts.append("%d:%s" % (entry[0], read(entry[0], entry[1])))
            except OSError:
                devices[i] = None
                parts.append("-")
        pitch, roll = hub.imu.tilt()
        parts.append("%d,%d" % (pitch, roll))
        print("${LIVE_PREFIX}", " ".join(parts))
        count += 1
        wait(${READ_INTERVAL_MS})
    print("${LIVE_PREFIX} end timeout")


try:
    main()
except Exception as error:
    print("${LIVE_PREFIX} error", repr(error))
raise SystemExit
`;

/**
 * The text actually pasted: blank lines dropped and each 4-space indent as one tab, which makes it
 * about a quarter shorter to send. MicroPython's lexer advances a tab to the next tab stop, so
 * consistent tabs indent exactly like consistent spaces (MP py/lexer.c#L139-L141).
 */
export function compactSource(source: string): string {
  return (
    source
      .split('\n')
      .filter((line) => line.trim() !== '')
      .map((line) => {
        const indent = /^ */.exec(line)?.[0].length ?? 0;
        return '\t'.repeat(Math.floor(indent / 4)) + line.slice(indent - (indent % 4));
      })
      .join('\n') + '\n'
  );
}

export const LIVE_VIEW_PASTE = compactSource(LIVE_VIEW_SOURCE);
