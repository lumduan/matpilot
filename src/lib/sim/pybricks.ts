/**
 * A simulated `pybricks` package (ADR 0016, step 7c), in Python, for MicroPython running in the
 * page: the same names the generated programs import (the list and its citations are in
 * ../blocks/pybricks.ts), each handing its work to the simulation (./bridge.ts, imported as
 * `_sim`). The constant lists come from the blocks' own option lists, so a colour, icon or button a
 * block offers always exists here.
 *
 * Calls that only read (an angle, a sensor, the timer) cost 1 ms of virtual time, so a loop that
 * only reads still moves the clock on, as on the hub. Sensors read the mat (./sensors.ts): the
 * colour sensor its picture, the distance sensor its edges and solid objects, the touch sensor
 * what it is pressed against.
 * Values come back as Pybricks v4.1 gives them: reflection and ambient light with one decimal,
 * the others as whole numbers (./sensors.ts).
 *
 * The package reaches the simulation through `_sim.py` (made by `simModule`), which calls the
 * JavaScript module `_simjs` and, once the simulation has halted (the time limit, or something the
 * mat cannot run), raises SystemExit: what the hub's stop button raises, so the program's
 * `finally` runs and stops its motors (FW bricks/_common/micropython.c#L44-L56, cited in
 * ../blocks/pybricks.ts). A JavaScript exception cannot do this: MicroPython's WebAssembly port
 * ends the whole run on one, without running `finally`.
 */
import { XBOX_BUTTONS } from '../controller/xbox';
import {
  BUTTON_OPTIONS,
  ICON_OPTIONS,
  LIGHT_COLOR_OPTIONS,
  PORTS,
  SENSOR_COLOR_OPTIONS,
} from '../blocks/pybricks';

const unique = (names: readonly string[]) => [...new Set(names)];
const members = (kind: string, names: readonly string[]) =>
  names.map((name) => `    ${name} = _Const('${kind}', '${name}')`).join('\n');

/** Pybricks' colours, and any the blocks offer. */
const COLORS = unique([
  'RED',
  'ORANGE',
  'YELLOW',
  'GREEN',
  'CYAN',
  'BLUE',
  'VIOLET',
  'MAGENTA',
  'WHITE',
  'GRAY',
  'BLACK',
  'NONE',
  ...LIGHT_COLOR_OPTIONS.map(([, value]) => value),
  ...SENSOR_COLOR_OPTIONS.map(([, value]) => value),
]);
const ICONS = unique(['UP', 'DOWN', 'LEFT', 'RIGHT', ...ICON_OPTIONS.map(([, value]) => value)]);
const BUTTONS = unique([
  'LEFT',
  'RIGHT',
  'CENTER',
  'BLUETOOTH',
  ...BUTTON_OPTIONS.map(([, value]) => value),
  ...XBOX_BUTTONS.map((button) => button.python),
]);

const PARAMETERS = `class _Const:
    def __init__(self, kind, name):
        self._kind = kind
        self.name = name

    def __repr__(self):
        return self._kind + '.' + self.name

    def __eq__(self, other):
        return isinstance(other, _Const) and other._kind == self._kind and other.name == self.name

    def __hash__(self):
        return hash(self._kind + '.' + self.name)


class Port:
${members('Port', PORTS)}


class Direction:
${members('Direction', ['CLOCKWISE', 'COUNTERCLOCKWISE'])}


class Stop:
${members('Stop', ['COAST', 'COAST_SMART', 'BRAKE', 'HOLD', 'NONE'])}


class Color:
${members('Color', COLORS)}


class Icon:
${members('Icon', ICONS)}


class Button:
${members('Button', BUTTONS)}


class Side:
${members('Side', ['TOP', 'BOTTOM', 'FRONT', 'BACK', 'LEFT', 'RIGHT'])}
`;

const TOOLS = `import _sim


def wait(time):
    _sim.wait(time)


class StopWatch:
    def __init__(self):
        self._start = _sim.now()
        self._paused = None

    def time(self):
        _sim.tick()
        now = self._paused if self._paused is not None else _sim.now()
        return int(now - self._start)

    def reset(self):
        self._start = _sim.now()
        if self._paused is not None:
            self._paused = self._start

    def pause(self):
        if self._paused is None:
            self._paused = _sim.now()

    def resume(self):
        if self._paused is not None:
            self._start += _sim.now() - self._paused
            self._paused = None
`;

const PUPDEVICES = `import _sim
from pybricks.parameters import Color, Direction, Stop


class _Control:
    def __init__(self, port):
        self._port = port

    def limits(self, *args):
        return (round(_sim.limit_speed(self._port)), round(_sim.limit_acceleration(self._port)), 0)


class _Lights:
    def on(self, *args):
        pass

    def off(self):
        pass


class Motor:
    def __init__(self, port, positive_direction=Direction.CLOCKWISE, gears=None, reset_angle=True, profile=None):
        self._port = port.name
        _sim.motor_new(self._port, positive_direction == Direction.COUNTERCLOCKWISE)
        self.control = _Control(self._port)

    def angle(self):
        _sim.tick()
        return round(_sim.motor_angle(self._port))

    def speed(self, window=100):
        _sim.tick()
        return round(_sim.motor_speed(self._port))

    def reset_angle(self, angle=None):
        _sim.motor_reset(self._port, 0 if angle is None else angle)

    def run(self, speed):
        _sim.motor_run(self._port, speed)

    def run_time(self, speed, time, then=Stop.HOLD, wait=True):
        _sim.motor_run_time(self._port, speed, time, wait)

    def run_angle(self, speed, rotation_angle, then=Stop.HOLD, wait=True):
        _sim.motor_run_angle(self._port, speed, rotation_angle, wait)

    def run_target(self, speed, target_angle, then=Stop.HOLD, wait=True):
        _sim.motor_run_target(self._port, speed, target_angle, wait)

    def track_target(self, target_angle):
        _sim.motor_run_target(self._port, _sim.limit_speed(self._port), target_angle, False)

    def run_until_stalled(self, speed, then=Stop.COAST, duty_limit=None):
        _sim.unsupported('run until stalled (the robot does not stop at walls or objects)')

    def dc(self, duty):
        _sim.motor_dc(self._port, duty)

    def stop(self):
        _sim.motor_stop(self._port)

    def brake(self):
        _sim.motor_stop(self._port)

    def hold(self):
        _sim.motor_stop(self._port)

    def done(self):
        _sim.tick()
        return bool(_sim.motor_done(self._port))

    def stalled(self):
        return False

    def load(self):
        return 0


class _HSV:
    def __init__(self, h, s, v):
        self.h = h
        self.s = s
        self.v = v

    def __repr__(self):
        return 'Color(h=' + str(self.h) + ', s=' + str(self.s) + ', v=' + str(self.v) + ')'


class ColorSensor:
    def __init__(self, port):
        self._port = port.name
        _sim.sensor_new(self._port, 'color')
        self._colors = None
        self.lights = _Lights()

    def color(self, surface=True):
        _sim.tick()
        names = '' if self._colors is None else ','.join(each.name for each in self._colors)
        return getattr(Color, _sim.sensor_color(self._port, names))

    def reflection(self):
        _sim.tick()
        return round(_sim.sensor_value(self._port, 'reflection'), 1)

    def ambient(self):
        _sim.tick()
        return round(_sim.sensor_value(self._port, 'ambient'), 1)

    def hsv(self, surface=True):
        _sim.tick()
        return _HSV(round(_sim.sensor_hsv(self._port, 0)), round(_sim.sensor_hsv(self._port, 1)), round(_sim.sensor_hsv(self._port, 2)))

    def detectable_colors(self, colors=None):
        if colors is None:
            if self._colors is None:
                return (Color.RED, Color.YELLOW, Color.GREEN, Color.BLUE, Color.WHITE, Color.NONE)
            return self._colors
        self._colors = tuple(colors)


class UltrasonicSensor:
    def __init__(self, port):
        self._port = port.name
        _sim.sensor_new(self._port, 'distance')
        self.lights = _Lights()

    def distance(self):
        _sim.tick()
        return round(_sim.sensor_value(self._port, 'distance'))

    def presence(self):
        _sim.tick()
        return False


class ForceSensor:
    def __init__(self, port):
        self._port = port.name
        _sim.sensor_new(self._port, 'force')

    def force(self):
        _sim.tick()
        return _sim.sensor_value(self._port, 'force')

    def distance(self):
        _sim.tick()
        return _sim.sensor_value(self._port, 'travel')

    def pressed(self, force=3):
        _sim.tick()
        return _sim.sensor_value(self._port, 'force') > force

    def touched(self):
        _sim.tick()
        return _sim.sensor_value(self._port, 'force') > 0
`;

const ROBOTICS = `import _sim
from pybricks.parameters import Stop


class _DriveControl:
    def __init__(self, control):
        self._control = control

    def limits(self, *args):
        return (round(_sim.drive_limit(self._control, 0)), round(_sim.drive_limit(self._control, 1)), 0)


class DriveBase:
    def __init__(self, left_motor, right_motor, wheel_diameter, axle_track):
        self._left = left_motor._port
        _sim.drive_new(left_motor._port, right_motor._port, wheel_diameter, axle_track)
        self.distance_control = _DriveControl('distance')
        self.heading_control = _DriveControl('heading')

    def straight(self, distance, then=Stop.HOLD, wait=True):
        _sim.drive_straight(distance, wait)

    def turn(self, angle, then=Stop.HOLD, wait=True):
        _sim.drive_turn(angle, wait)

    def curve(self, radius, angle, then=Stop.HOLD, wait=True):
        _sim.unsupported('curve')

    def drive(self, speed, turn_rate):
        _sim.drive_drive(speed, turn_rate)

    def stop(self):
        _sim.drive_stop()

    def brake(self):
        _sim.drive_stop()

    def settings(self, straight_speed=None, straight_acceleration=None, turn_rate=None, turn_acceleration=None):
        values = (straight_speed, straight_acceleration, turn_rate, turn_acceleration)
        if all(value is None for value in values):
            return tuple(round(_sim.drive_setting(i)) for i in range(4))
        for i in range(4):
            if values[i] is not None:
                _sim.drive_set(i, values[i])

    def distance(self):
        _sim.tick()
        return round(_sim.drive_distance())

    def angle(self):
        _sim.tick()
        return round(_sim.drive_angle())

    def state(self):
        _sim.tick()
        return (round(_sim.drive_distance()), 0, round(_sim.drive_angle()), 0)

    def reset(self, distance=0, angle=0):
        _sim.drive_reset()

    def done(self):
        _sim.tick()
        return bool(_sim.drive_done())

    def stalled(self):
        return False

    def use_gyro(self, use_gyro):
        pass
`;

const HUBS = `import _sim
from pybricks.parameters import Side


class _Light:
    def on(self, color):
        _sim.hub_event('light', repr(color))

    def off(self):
        _sim.hub_event('light', 'off')

    def blink(self, color, durations):
        _sim.hub_event('light', repr(color) + ' (blinking)')

    def animate(self, colors, interval):
        _sim.hub_event('light', 'colours in turn')


class _Display:
    def icon(self, icon):
        _sim.hub_event('display', repr(icon) if hasattr(icon, '_kind') else 'a picture')

    def text(self, text, on=500, off=50):
        _sim.hub_event('display', str(text))
        _sim.wait(len(str(text)) * (on + off))

    def number(self, number):
        _sim.hub_event('display', str(number))

    def char(self, char):
        _sim.hub_event('display', str(char))

    def pixel(self, row, column, brightness=100):
        _sim.hub_event('display', 'a light at row ' + str(row) + ', column ' + str(column))

    def off(self):
        _sim.hub_event('display', 'off')

    def orientation(self, up):
        pass


class _Speaker:
    def beep(self, frequency=500, duration=100):
        _sim.hub_event('sound', 'beep ' + str(frequency) + ' Hz')
        if duration > 0:
            _sim.wait(duration)

    def play_notes(self, notes, tempo=120):
        _sim.hub_event('sound', 'notes')

    def volume(self, volume=None):
        if volume is None:
            return 100


class _IMU:
    def tilt(self):
        _sim.tick()
        return (0, 0)

    def up(self):
        return Side.TOP

    def heading(self):
        _sim.tick()
        return 0

    def reset_heading(self, angle=0):
        pass

    def ready(self):
        return True

    def stationary(self):
        return True

    def acceleration(self, axis=None):
        return 0 if axis is not None else (0, 0, 9810)

    def angular_velocity(self, axis=None):
        return 0 if axis is not None else (0, 0, 0)


class _Buttons:
    def pressed(self):
        _sim.tick()
        return set()


class _Battery:
    def voltage(self):
        return 8000

    def current(self):
        return 100


class _System:
    def set_stop_button(self, button):
        pass

    def name(self):
        return 'MatPilot mat'

    def shutdown(self):
        raise SystemExit


class PrimeHub:
    def __init__(self, top_side=None, front_side=None, broadcast_channel=None, observe_channels=None):
        self.light = _Light()
        self.display = _Display()
        self.speaker = _Speaker()
        self.imu = _IMU()
        self.buttons = _Buttons()
        self.battery = _Battery()
        self.system = _System()
`;

const IODEVICES = `import _sim


class XboxController:
    def __init__(self, *args, **kwargs):
        _sim.unsupported('the Xbox controller')
`;

/** Calls that may run after the halt, while the program's `finally` stops its motors. */
const SAFE_AFTER_HALT = new Set([
  'now',
  'halted',
  'motor_stop',
  'drive_stop',
  'hub_event',
  'motor_new',
  'drive_new',
  'sensor_new',
]);

/** `_sim.py`: each JavaScript call, then SystemExit once the simulation has halted. */
export function simModule(names: readonly string[]): string {
  const lines = ['import _simjs', ''];
  for (const name of names) {
    lines.push(`def ${name}(*args):`, `    result = _simjs.${name}(*args)`);
    if (!SAFE_AFTER_HALT.has(name))
      lines.push('    if _simjs.halted():', '        raise SystemExit');
    lines.push('    return result', '', '');
  }
  return lines.join('\n');
}

/** The package's files, by path in MicroPython's file system. */
export const PYBRICKS_FILES: Readonly<Record<string, string>> = {
  'pybricks/__init__.py': '',
  'pybricks/parameters.py': PARAMETERS,
  'pybricks/tools.py': TOOLS,
  'pybricks/pupdevices.py': PUPDEVICES,
  'pybricks/robotics.py': ROBOTICS,
  'pybricks/hubs.py': HUBS,
  'pybricks/iodevices.py': IODEVICES,
};
