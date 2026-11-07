/**
 * A short program that drives a robot's drive base, for the hub or for the mat: the calibration
 * helper's two tests (./calibrate.ts) and a path drawn on the mat (../mats/path.ts). It follows
 * the hub code rules (CLAUDE.md): a config block, ports named once, every motor stopped in
 * `finally`.
 *
 * Pybricks names it uses, at pybricks-micropython v4.0.1
 * (FW = https://github.com/pybricks/pybricks-micropython/blob/4104553405decb0384bcfb030fbfcb4b5a9854cc/):
 * - DriveBase(left_motor, right_motor, wheel_diameter, axle_track), sizes in mm:
 *   FW pybricks/robotics/pb_type_drivebase.c#L61-L80; DriveBase.straight(distance) and
 *   turn(angle), waiting until done: pb_type_drivebase.c#L133-L152 #L155-L175; stop():
 *   #L106-L117; a positive turn is clockwise seen from above: FW lib/pbio/src/drivebase.c
 *   #L146-L151;
 * - Motor(port, positive_direction): FW pybricks/common/pb_type_motor.c#L79-L85; Motor.stop():
 *   pb_type_motor.c#L483; Port and Direction: FW pybricks/parameters/pb_module_parameters.c
 *   #L11-L32; wait(time) in ms: FW pybricks/tools/pb_module_tools.c#L67-L103.
 */
import type { RobotProfile } from './profile';

const number = (value: number) => String(Math.round(value * 100) / 100);

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
  return `# ${options.title.replace(/[\r\n]+/g, ' ')}
# Robot: ${robot.name.replace(/[\r\n]+/g, ' ')}
from pybricks.parameters import Direction, Port
from pybricks.pupdevices import Motor
from pybricks.robotics import DriveBase
${delay > 0 ? 'from pybricks.tools import wait\n' : ''}
# --- Config ---------------------------------------------------------------
${config.join('\n')}

# --- Setup ----------------------------------------------------------------
left = Motor(LEFT_MOTOR_PORT${mirrored('left')})
right = Motor(RIGHT_MOTOR_PORT${mirrored('right')})
robot = DriveBase(left, right, WHEEL_DIAMETER_MM, AXLE_TRACK_MM)

# --- Main -----------------------------------------------------------------
try:
${(main.length > 0 ? main : ['pass']).map((line) => `    ${line}`).join('\n')}
finally:
    robot.stop()
    left.stop()
    right.stop()
`;
}
