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
];

export const DEFAULT_PROGRAM_SOURCE: string = EXAMPLE_PROGRAMS[0]?.source ?? '';
