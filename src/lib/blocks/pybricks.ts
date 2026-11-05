/**
 * The Pybricks names the block editor generates, with their upstream source. Every block maps to
 * one of these calls (ADR 0008); nothing here is guessed.
 *
 * Cited at Pybricks v4.0.1, FW = https://github.com/pybricks/pybricks-micropython/blob/4104553405decb0384bcfb030fbfcb4b5a9854cc/
 * and its MicroPython, MP = https://github.com/pybricks/micropython/blob/13580b6ad057173f62e8b2363e01d6851bcc6699/
 *
 * Classes and modules
 * - pybricks.hubs.PrimeHub: FW pybricks/hubs/pb_module_hubs.c#L14-L21; its attributes light,
 *   display, speaker, buttons, imu: FW pybricks/hubs/pb_type_primehub.c#L89-L102
 * - pybricks.pupdevices Motor, ColorSensor, ForceSensor, UltrasonicSensor:
 *   FW pybricks/pupdevices/pb_module_pupdevices.c#L15 #L20 #L21 #L38
 * - Motor(port, positive_direction=Direction.CLOCKWISE, ...): FW pybricks/common/pb_type_motor.c#L79-L85
 * - pybricks.parameters Button, Color, Direction, Icon, Port, Stop:
 *   FW pybricks/parameters/pb_module_parameters.c#L11-L32
 * - pybricks.tools wait, StopWatch: FW pybricks/tools/pb_module_tools.c#L301 #L311
 * - math and random are built in on SPIKE Prime: FW bricks/_common/mpconfigport.h#L19 #L25,
 *   MP py/modmath.c#L453, MP extmod/modrandom.c#L258 (randint at #L232-L249). There is no
 *   `numbers` module and no sys.exit (FW bricks/_common/mpconfigport.h#L95), which is why the
 *   generator overrides Blockly's `math_change` and stops a program with `raise SystemExit`.
 *
 * Methods (registration line; signature from the argument parser)
 * - Motor.run(speed): FW pybricks/common/pb_type_motor.c#L494
 * - Motor.run_angle(speed, rotation_angle, then=Stop.HOLD, wait=True): #L497, #L374-L396
 * - Motor.run_target(speed, target_angle, then=Stop.HOLD, wait=True): #L498, #L399-L421
 * - Motor.run_time(speed, time, then=Stop.HOLD, wait=True): #L495, #L320-L343
 * - Motor.stop(), brake(), hold(): #L483, #L484 (#L187-L192), #L490 (#L277-L283)
 * - Motor.reset_angle(angle=None): #L493, #L233-L249
 * - Motor.dc(duty): #L482, #L165-L176
 * - Motor.angle(), speed(): #L491, #L492
 * - hub.light.on(color), off(): FW pybricks/common/pb_type_colorlight_internal.c#L35-L55
 * - hub.display.text(text, on=500, off=50), number(number), icon(icon), off():
 *   FW pybricks/common/pb_type_lightmatrix.c#L321-L342 #L226-L235 #L95-L149 #L172-L179
 * - hub.speaker.beep(frequency=500, duration=100): FW pybricks/common/pb_type_speaker.c#L93-L119
 * - hub.buttons.pressed() returns a set of Button: FW pybricks/common/pb_type_keypad.c#L25-L34,
 *   FW pybricks/hubs/pb_type_primehub.c#L45-L62
 * - hub.imu.tilt() returns (pitch, roll) in degrees: FW pybricks/common/pb_type_imu.c#L60-L85
 * - ColorSensor.color(), reflection(), ambient():
 *   FW pybricks/pupdevices/pb_type_pupdevices_colorsensor.c#L142-L153 #L173 #L58-L63
 * - UltrasonicSensor.distance() in mm, 2000 when nothing is in range:
 *   FW pybricks/pupdevices/pb_type_pupdevices_ultrasonicsensor.c#L39-L42
 * - ForceSensor.force() (newtons), pressed(force=3), touched():
 *   FW pybricks/pupdevices/pb_type_pupdevices_forcesensor.c#L119 #L101-L114 #L71-L77
 * - wait(time) in ms: FW pybricks/tools/pb_module_tools.c#L67-L103
 * - StopWatch.time(), reset(): FW pybricks/tools/pb_type_stopwatch.c#L78-L79
 *
 * Behaviour the generator relies on
 * - Stop raises SystemExit in the program, so `finally` runs and the motors stop:
 *   FW bricks/_common/micropython.c#L45-L57 #L79-L83
 * - The centre button is the stop button on SPIKE Prime, so no block reads it:
 *   FW lib/pbio/platform/prime_hub/pbsysconfig.h#L12
 *
 * The simple blocks (ADR 0010, ./simple-generator.ts) also use
 * - pybricks.robotics.DriveBase: FW pybricks/robotics/pb_module_robotics.c#L18, built for SPIKE
 *   Prime with the gyro option: FW bricks/primehub/mpconfigport.h#L58-L59
 * - DriveBase(left_motor, right_motor, wheel_diameter, axle_track), sizes in mm (stored in µm):
 *   FW pybricks/robotics/pb_type_drivebase.c#L61-L80, FW lib/pbio/src/drivebase.c#L269-L279
 * - DriveBase.straight(distance) in mm, turn(angle) in degrees, both waiting by default:
 *   pb_type_drivebase.c#L133-L152 #L155-L175; drive(speed, turn_rate): #L296-L312;
 *   stop() coasts: #L106-L117; brake(): #L315-L326; the method table: #L477-L496
 * - A positive turn is clockwise seen from above (to the right): the heading is
 *   (left - right) / 2 of the wheel angles, FW lib/pbio/src/drivebase.c#L146-L151
 * - DriveBase.settings() returns (straight_speed, straight_acceleration, turn_rate,
 *   turn_acceleration); with keywords it sets them: pb_type_drivebase.c#L404-L447. A speed below
 *   a small minimum (about 5 mm/s or 5 °/s with SPIKE wheels), such as 0, is refused:
 *   FW lib/pbio/src/drivebase.c#L997-L1017, FW lib/pbio/src/trajectory.c#L130-L140
 * - Default speeds: 40 % of the top speed straight, 33 % turning:
 *   FW lib/pbio/src/drivebase.c#L76-L78 #L105-L108
 * - DriveBase.distance_control and heading_control: pb_type_drivebase.c#L468-L471; Motor.control:
 *   FW pybricks/common/pb_type_motor.c#L465; Control.limits() returns (speed, acceleration,
 *   torque), the speed being the top speed: FW pybricks/common/pb_type_control.c#L83-L105
 * - Motor.run_angle(speed, angle) turns the other way for a negative angle:
 *   FW lib/pbio/src/servo.c#L740-L771, FW lib/pbio/src/control.c#L627-L631; with speed 0 it
 *   ends at once: servo.c#L763-L768. Motor.brake(), run_time(): pb_type_motor.c#L484 #L495
 * - A motor command or stop also stops the drive base that uses the motor:
 *   servo.c#L542-L546
 * - hub.display.icon() takes 5 rows of 5 brightness values, 0 to 100:
 *   FW pybricks/common/pb_type_lightmatrix.c#L95-L149; pixel(row, column, brightness=100):
 *   #L270-L282; the method table: #L347 #L352
 * - hub.speaker.volume(volume), 0 to 100: FW pybricks/common/pb_type_speaker.c#L46-L60 #L332
 * - Speeds, angles, distances and times may be floats; they are cut to whole numbers:
 *   FW pybricks/util_mp/pb_obj_helper.c#L18-L24, floats being on for SPIKE Prime:
 *   FW bricks/primehub/mpconfigport.h#L68, FW bricks/_common/mpconfigport.h#L105-L109
 * - min, max and abs are built in: FW bricks/_common/mpconfigport.h#L85,
 *   MP py/modbuiltins.c#L669 #L709-L710; math.pi: MP py/modmath.c#L388, math being on with
 *   floats: FW bricks/_common/mpconfigport.h#L19
 */

export type Option = readonly [label: string, value: string];

/** Port.A-F: FW pybricks/parameters/pb_type_port.c#L98-L113 */
export const PORTS = ['A', 'B', 'C', 'D', 'E', 'F'] as const;
export type PortName = (typeof PORTS)[number];

/** Direction members: FW pybricks/parameters/pb_type_direction.c#L27-L28 */
export const DIRECTION_OPTIONS: readonly Option[] = [
  ['clockwise', 'CLOCKWISE'],
  ['counterclockwise', 'COUNTERCLOCKWISE'],
];

/**
 * What a motor does when a move ends. Stop members: FW pybricks/parameters/pb_type_stop.c#L51-L56
 */
export const THEN_OPTIONS: readonly Option[] = [
  ['hold', 'HOLD'],
  ['brake', 'BRAKE'],
  ['coast', 'COAST'],
];

/** Colour names for the hub light. Color members: FW pybricks/parameters/pb_type_color.c#L118-L135 */
export const LIGHT_COLOR_OPTIONS: readonly Option[] = [
  ['red', 'RED'],
  ['orange', 'ORANGE'],
  ['yellow', 'YELLOW'],
  ['green', 'GREEN'],
  ['cyan', 'CYAN'],
  ['blue', 'BLUE'],
  ['violet', 'VIOLET'],
  ['magenta', 'MAGENTA'],
  ['white', 'WHITE'],
];

/**
 * The colours ColorSensor.color() reports by default:
 * FW pybricks/util_pb/pb_color_map.c#L45-L61
 */
export const SENSOR_COLOR_OPTIONS: readonly Option[] = [
  ['red', 'RED'],
  ['yellow', 'YELLOW'],
  ['green', 'GREEN'],
  ['blue', 'BLUE'],
  ['white', 'WHITE'],
  ['no colour', 'NONE'],
];

/** A subset of the built-in icons. Icon names: FW pybricks/parameters/pb_type_icon.c#L19-L238 */
export const ICON_OPTIONS: readonly Option[] = [
  ['happy', 'HAPPY'],
  ['sad', 'SAD'],
  ['heart', 'HEART'],
  ['arrow up', 'ARROW_UP'],
  ['arrow down', 'ARROW_DOWN'],
  ['arrow left', 'ARROW_LEFT'],
  ['arrow right', 'ARROW_RIGHT'],
  ['tick', 'TRUE'],
  ['cross', 'FALSE'],
  ['square', 'SQUARE'],
  ['circle', 'CIRCLE'],
  ['full', 'FULL'],
];

/**
 * Hub buttons a program may read. The centre button is the stop button (see the header), so it is
 * left out. Prime Hub buttons: FW pybricks/hubs/pb_type_primehub.c#L45-L62
 */
export const BUTTON_OPTIONS: readonly Option[] = [
  ['left', 'LEFT'],
  ['right', 'RIGHT'],
  ['Bluetooth', 'BLUETOOTH'],
];

/** The pitch and roll of hub.imu.tilt(), by index. */
export const TILT_OPTIONS: readonly Option[] = [
  ['pitch', '0'],
  ['roll', '1'],
];

/** Device kinds. Each is a Blockly variable type, a Python class, and a setup block. */
export const DEVICES = {
  Motor: {
    pythonClass: 'Motor',
    setupBlock: 'mp_setup_motor',
    defaultName: 'motor',
    label: 'motor',
    /** Ports tried first for a new device: the maintainer's bench layout. */
    preferredPorts: ['A', 'B', 'C'],
  },
  ColorSensor: {
    pythonClass: 'ColorSensor',
    setupBlock: 'mp_setup_color_sensor',
    defaultName: 'colour sensor',
    label: 'colour sensor',
    preferredPorts: ['D'],
  },
  UltrasonicSensor: {
    pythonClass: 'UltrasonicSensor',
    setupBlock: 'mp_setup_ultrasonic_sensor',
    defaultName: 'distance sensor',
    label: 'distance sensor',
    preferredPorts: ['E'],
  },
  ForceSensor: {
    pythonClass: 'ForceSensor',
    setupBlock: 'mp_setup_force_sensor',
    defaultName: 'touch sensor',
    label: 'touch sensor',
    preferredPorts: ['F'],
  },
} as const satisfies Record<
  string,
  {
    pythonClass: string;
    setupBlock: string;
    defaultName: string;
    label: string;
    preferredPorts: readonly PortName[];
  }
>;

export type DeviceType = keyof typeof DEVICES;
export const DEVICE_TYPES = Object.keys(DEVICES) as DeviceType[];

export function isDeviceType(type: string): type is DeviceType {
  return type in DEVICES;
}
