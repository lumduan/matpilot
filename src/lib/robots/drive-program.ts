/**
 * A short program that drives a robot's drive base, for the hub or for the mat: the calibration
 * helper's two tests (./calibrate.ts) and a path drawn on the mat (../mats/path.ts). It follows
 * the hub code rules (CLAUDE.md): a config block, ports named once, every motor stopped in
 * `finally`.
 *
 * Pybricks names it uses, at pybricks-micropython v4.1.3
 * (FW = https://github.com/pybricks/pybricks-micropython/blob/c860b6a00301fb7c6ecd429da11dcb5a6c557c7a/):
 * - DriveBase(left_motor, right_motor, wheel_diameter, axle_track), sizes in mm:
 *   FW pybricks/robotics/pb_type_drivebase.c#L61-L80; DriveBase.straight(distance) and
 *   turn(angle), waiting until done: pb_type_drivebase.c#L133-L152 #L155-L175; stop():
 *   #L106-L117; a positive turn is clockwise seen from above: FW lib/pbio/src/drivebase.c
 *   #L146-L151;
 * - Motor(port, positive_direction): FW pybricks/common/pb_type_motor.c#L79-L85; Motor.stop():
 *   pb_type_motor.c#L483; Port and Direction: FW pybricks/parameters/pb_module_parameters.c
 *   #L11-L32; wait(time) in ms: FW pybricks/tools/pb_module_tools.c#L69-L105.
 * - For "set movement speed" (movementSpeedHelper): DriveBase.settings() with keywords sets
 *   straight_speed and turn_rate: pb_type_drivebase.c#L404-L447; a speed below a small minimum
 *   (about 5 mm/s or 5 °/s with SPIKE wheels), such as 0, is refused: FW lib/pbio/src/drivebase.c
 *   #L997-L1017, FW lib/pbio/src/trajectory.c#L130-L140; DriveBase.distance_control and
 *   heading_control: pb_type_drivebase.c#L468-L471; Control.limits() returns (speed,
 *   acceleration, torque), the speed being the top speed: FW pybricks/common/pb_type_control.c
 *   #L83-L105.
 */
import type { RobotProfile } from './profile';

const number = (value: number) => String(Math.round(value * 100) / 100);

/** The function "set movement speed" calls (the simple blocks and a path drawn on the mat). */
export const MOVEMENT_SPEED_FUNCTION = 'set_movement_speed';

/**
 * Sets straight speed and turn rate as a share of the drive base's top speeds. The hub refuses a
 * speed below a small minimum (cited above), so the share is at least 5 %. `robot` is the drive
 * base's name in the program.
 */
export function movementSpeedHelper(robot: string): string {
  return `def ${MOVEMENT_SPEED_FUNCTION}(percent):
    # A share of the top speed, at least 5 %: the hub refuses a speed of 0.
    percent = max(5, min(100, percent))
    ${robot}.settings(
        straight_speed=${robot}.distance_control.limits()[0] * percent // 100,
        turn_rate=${robot}.heading_control.limits()[0] * percent // 100,
    )`;
}

export function driveBaseProgram(options: {
  readonly robot: RobotProfile;
  /** The first comment line. */
  readonly title: string;
  /** The drive base's numbers, if not the robot's. */
  readonly wheelDiameterMm?: number;
  readonly trackMm?: number;
  /** More lines for the config block. */
  readonly config?: readonly string[];
  /** The main part's lines, run after the start delay. */
  readonly main: readonly string[];
  /** A wait first, so hands can come away (ms); 0 for none. */
  readonly startDelayMs?: number;
  /** The main part calls `wait()`. */
  readonly waits?: boolean;
  /** Functions the main part calls, after the setup. */
  readonly helpers?: readonly string[];
}): string {
  const { robot } = options;
  const mirrored = (side: 'left' | 'right') =>
    robot.drive.mirrored === side ? ', positive_direction=Direction.COUNTERCLOCKWISE' : '';
  const delay = options.startDelayMs ?? 0;
  const config = [
    `LEFT_MOTOR_PORT = Port.${robot.drive.left}`,
    `RIGHT_MOTOR_PORT = Port.${robot.drive.right}`,
    `WHEEL_DIAMETER_MM = ${number(options.wheelDiameterMm ?? robot.wheels.diameterMm)}`,
    `AXLE_TRACK_MM = ${number(options.trackMm ?? robot.wheels.trackMm)}`,
    ...(options.config ?? []),
    ...(delay > 0 ? [`START_DELAY_MS = ${delay}  # time to take your hands away`] : []),
  ];
  const main = [...(delay > 0 ? ['wait(START_DELAY_MS)'] : []), ...options.main];
  const helpers = options.helpers ?? [];
  return `# ${options.title.replace(/[\r\n]+/g, ' ')}
# Robot: ${robot.name.replace(/[\r\n]+/g, ' ')}
from pybricks.parameters import Direction, Port
from pybricks.pupdevices import Motor
from pybricks.robotics import DriveBase
${delay > 0 || options.waits ? 'from pybricks.tools import wait\n' : ''}
# --- Config ---------------------------------------------------------------
${config.join('\n')}

# --- Setup ----------------------------------------------------------------
left = Motor(LEFT_MOTOR_PORT${mirrored('left')})
right = Motor(RIGHT_MOTOR_PORT${mirrored('right')})
robot = DriveBase(left, right, WHEEL_DIAMETER_MM, AXLE_TRACK_MM)
${helpers.length > 0 ? `\n# --- Helpers --------------------------------------------------------------\n${helpers.join('\n\n\n')}\n` : ''}
# --- Main -----------------------------------------------------------------
try:
${(main.length > 0 ? main : ['pass']).map((line) => `    ${line}`).join('\n')}
finally:
    robot.stop()
    left.stop()
    right.stop()
`;
}
