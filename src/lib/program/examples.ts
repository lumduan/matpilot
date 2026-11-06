/**
 * Example programs for the Program and Monitor page.
 *
 * They use the maintainer's bench layout (no robot, loose motors): A = L-motor, B = L-motor,
 * C = M-motor, D = Color Sensor, E = Ultrasonic Sensor, F = Force (touch) Sensor. Each follows the
 * hub code rules in CLAUDE.md: one config block, ports assigned once, and every motor stopped in
 * `finally`.
 *
 * Pybricks names used, cited at v4.0.1 (FW = https://github.com/pybricks/pybricks-micropython/blob/4104553405decb0384bcfb030fbfcb4b5a9854cc/):
 * - pybricks.parameters.Port: FW pybricks/parameters/pb_module_parameters.c#L29;
 *   Port.A-F: FW pybricks/parameters/pb_type_port.c#L98-L113
 * - pybricks.pupdevices Motor, ColorSensor, ForceSensor, UltrasonicSensor:
 *   FW pybricks/pupdevices/pb_module_pupdevices.c#L15 #L20 #L21 #L38
 * - Motor.stop / angle / speed / run: FW pybricks/common/pb_type_motor.c#L483 #L491 #L492 #L494
 * - UltrasonicSensor.distance: FW pybricks/pupdevices/pb_type_pupdevices_ultrasonicsensor.c#L59
 * - ColorSensor.reflection: FW pybricks/pupdevices/pb_type_pupdevices_colorsensor.c#L173
 * - ForceSensor.force: FW pybricks/pupdevices/pb_type_pupdevices_forcesensor.c#L119
 * - pybricks.tools wait, StopWatch: FW pybricks/tools/pb_module_tools.c#L301 #L311;
 *   StopWatch.time: FW pybricks/tools/pb_type_stopwatch.c#L79
 *
 * The Xbox controller check (milestone 5's first hardware question, docs/roadmap.md) also uses:
 * - pybricks.hubs.PrimeHub: FW pybricks/hubs/pb_module_hubs.c#L14-L21
 * - hub.light.on(color): FW pybricks/common/pb_type_colorlight_internal.c#L35-L55;
 *   Color members: FW pybricks/parameters/pb_type_color.c#L118-L135
 * - hub.display.off(), pixel(row, column, brightness=100): FW pybricks/common/pb_type_lightmatrix.c
 *   #L349 #L352, arguments #L271-L282
 * - pybricks.parameters Button, Color: FW pybricks/parameters/pb_module_parameters.c#L11-L32;
 *   Button.MENU: FW pybricks/parameters/pb_type_button.c#L46
 * - pybricks.iodevices.XboxController, enabled on SPIKE Prime: FW
 *   pybricks/iodevices/pb_module_iodevices.c#L91-L92, FW bricks/primehub/mpconfigport.h#L41
 * - XboxController(joystick_deadzone=10, name=None, timeout=10000, connect=True), timeout in ms:
 *   FW pybricks/iodevices/pb_type_iodevices_xbox_controller.c#L425-L435, #L451
 * - joystick_left() returns (x, y), each -100 to 100: same file #L539-L563; buttons.pressed()
 *   returns a set of Button: #L674-L677 (the buttons attribute), FW
 *   pybricks/common/pb_type_keypad.c#L25-L29
 * - a read after the controller disconnects raises OSError: same file #L168-L177
 * - round(x) with one argument returns an int, so it can index a pixel: MP py/modbuiltins.c
 *   #L499-L500, MP = https://github.com/pybricks/micropython/blob/13580b6ad057173f62e8b2363e01d6851bcc6699/
 */

export interface ExampleProgram {
  readonly id: string;
  readonly title: string;
  /** What to plug in, and what to expect. */
  readonly description: string;
  readonly source: string;
}

export const EXAMPLE_PROGRAMS: readonly ExampleProgram[] = [
  {
    id: 'hello',
    title: 'Hello monitor',
    description: 'Needs nothing plugged in. Prints a counter twice a second; the plotter draws it.',
    source: `from pybricks.tools import wait

# --- Config ---------------------------------------------------------------
COUNT = 20
INTERVAL_MS = 500

# --- Main -----------------------------------------------------------------
for i in range(COUNT):
    print("count:", i)
    wait(INTERVAL_MS)
print("done")
`,
  },
  {
    id: 'motor-angle',
    title: 'Plot a motor angle (port A)',
    description: 'L-motor on port A. Turn it by hand and watch the angle in the plotter.',
    source: `from pybricks.parameters import Port
from pybricks.pupdevices import Motor
from pybricks.tools import wait

# --- Config ---------------------------------------------------------------
MOTOR_PORT = Port.A
SAMPLE_MS = 50

# --- Setup ----------------------------------------------------------------
motor = Motor(MOTOR_PORT)

# --- Main -----------------------------------------------------------------
try:
    while True:
        print("angle:", motor.angle())
        wait(SAMPLE_MS)
finally:
    motor.stop()
`,
  },
  {
    id: 'motor-spin',
    title: 'Spin a motor for 3 seconds (port A)',
    description:
      'L-motor on port A, lying loose. Runs at 360 deg/s for 3 s, plotting angle and speed.',
    source: `from pybricks.parameters import Port
from pybricks.pupdevices import Motor
from pybricks.tools import StopWatch, wait

# --- Config ---------------------------------------------------------------
MOTOR_PORT = Port.A
SPEED_DEG_S = 360
RUN_MS = 3000
SAMPLE_MS = 50

# --- Setup ----------------------------------------------------------------
motor = Motor(MOTOR_PORT)
watch = StopWatch()

# --- Main -----------------------------------------------------------------
try:
    motor.run(SPEED_DEG_S)
    while watch.time() < RUN_MS:
        print("angle:", motor.angle(), "speed:", motor.speed())
        wait(SAMPLE_MS)
finally:
    motor.stop()
`,
  },
  {
    id: 'distance',
    title: 'Plot distance (port E)',
    description:
      'Ultrasonic Sensor on port E. Move your hand towards it; distance is in millimetres.',
    source: `from pybricks.parameters import Port
from pybricks.pupdevices import UltrasonicSensor
from pybricks.tools import wait

# --- Config ---------------------------------------------------------------
DISTANCE_PORT = Port.E
SAMPLE_MS = 100

# --- Setup ----------------------------------------------------------------
sensor = UltrasonicSensor(DISTANCE_PORT)

# --- Main -----------------------------------------------------------------
while True:
    print("distance_mm:", sensor.distance())
    wait(SAMPLE_MS)
`,
  },
  {
    id: 'sensors',
    title: 'Colour reflection and force (ports D, F)',
    description:
      'Color Sensor on port D, Force Sensor on port F. Plots reflection (%) and force (N).',
    source: `from pybricks.parameters import Port
from pybricks.pupdevices import ColorSensor, ForceSensor
from pybricks.tools import wait

# --- Config ---------------------------------------------------------------
COLOR_PORT = Port.D
FORCE_PORT = Port.F
SAMPLE_MS = 100

# --- Setup ----------------------------------------------------------------
color = ColorSensor(COLOR_PORT)
force = ForceSensor(FORCE_PORT)

# --- Main -----------------------------------------------------------------
while True:
    print("reflection:", color.reflection(), "force:", force.force())
    wait(SAMPLE_MS)
`,
  },
  {
    id: 'xbox-check',
    title: 'Xbox controller check (no motors)',
    description:
      'Nothing plugged in. Turn the controller on and hold its pair button until the Xbox logo flashes fast, then Run. While it searches, the hub light is blue and the top row of lights is lit. Connected: green, and one light follows the left stick. Menu ends it.',
    source: `from pybricks.hubs import PrimeHub
from pybricks.iodevices import XboxController
from pybricks.parameters import Button, Color
from pybricks.tools import wait

# --- Config ---------------------------------------------------------------
SEARCH_TIMEOUT_MS = 30000
SAMPLE_MS = 100

# --- Setup ----------------------------------------------------------------
hub = PrimeHub()
hub.light.on(Color.BLUE)
# The top row (row 0) shows which side of the hub is "up" on its lights.
for column in range(5):
    hub.display.pixel(0, column)
print("Searching for the Xbox controller...")
controller = XboxController(timeout=SEARCH_TIMEOUT_MS)
hub.light.on(Color.GREEN)
print("Connected. Push the left stick; press Menu to end.")

# --- Main -----------------------------------------------------------------
try:
    while True:
        try:
            x, y = controller.joystick_left()
            pressed = controller.buttons.pressed()
        except OSError:
            # The controller was switched off or went out of range.
            hub.light.on(Color.RED)
            print("The controller disconnected.")
            break
        if Button.MENU in pressed:
            break
        print("left_x:", x, "left_y:", y)
        # One light follows the stick: if pushing the stick up moves it towards
        # the side the top row was on, "up" is a positive y.
        hub.display.off()
        hub.display.pixel(2 - round(y / 50), 2 + round(x / 50))
        wait(SAMPLE_MS)
finally:
    hub.display.off()
`,
  },
];

export const DEFAULT_PROGRAM_SOURCE: string = EXAMPLE_PROGRAMS[0]?.source ?? '';

/** What the example picker shows for the program in the editor. */
export interface ExampleSelection {
  /** The example the editor holds unchanged, or `null`. */
  readonly current: ExampleProgram | null;
  /** When the editor holds something else: the example it was loaded from, if any. */
  readonly editedFrom: ExampleProgram | null;
}

/**
 * Works out which example the editor holds. A program matches an example only when it is
 * character-for-character the same; anything else is an edited copy of the last loaded example
 * (`lastExampleId`), or the user's own program.
 */
export function describeExampleSelection(
  source: string,
  lastExampleId: string | null,
): ExampleSelection {
  const current = EXAMPLE_PROGRAMS.find((example) => example.source === source) ?? null;
  if (current) return { current, editedFrom: null };
  const editedFrom = EXAMPLE_PROGRAMS.find((example) => example.id === lastExampleId) ?? null;
  return { current: null, editedFrom };
}
