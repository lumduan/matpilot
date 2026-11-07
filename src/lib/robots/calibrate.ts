/**
 * The calibration helper (ADR 0016, section 3): two short programs measured on the floor
 * correct the wheel diameter and the axle track. A ruler beats a typed guess.
 *
 * 1. **Drive 1000 mm.** The program turns the wheels as far as 1000 mm needs with the wheels it
 *    is told about. If the robot really goes `measured` mm, its wheels are bigger or smaller in
 *    the same proportion: new diameter = diameter × measured / 1000.
 * 2. **Turn ten times.** The program turns the wheels as far as ten turns on the spot need with
 *    the wheels and axle track it is told about. Each wheel's arc is
 *    asked × (track / 2) × (real diameter / told diameter), so the robot turns
 *    asked × (told track / real track) × (real diameter / told diameter); hence
 *    real track = told track × (real diameter / told diameter) × asked / turned. Ten turns make a
 *    small error ten times easier to see.
 *
 * Pybricks behaviour this relies on, at pybricks-micropython v4.0.1
 * (FW = https://github.com/pybricks/pybricks-micropython/blob/4104553405decb0384bcfb030fbfcb4b5a9854cc/):
 * - DriveBase(left_motor, right_motor, wheel_diameter, axle_track), sizes in mm:
 *   FW pybricks/robotics/pb_type_drivebase.c#L61-L80; it steers by the motors' encoders, not
 *   the gyro, unless told otherwise (FW pybricks/robotics/pb_type_drivebase.c#L75), so a wrong
 *   axle track shows in the turn;
 * - DriveBase.straight(distance) and turn(angle), waiting until done: pb_type_drivebase.c
 *   #L133-L152 #L155-L175; stop(): #L106-L117;
 * - a positive turn is clockwise seen from above: FW lib/pbio/src/drivebase.c#L146-L151;
 * - Motor(port, positive_direction): FW pybricks/common/pb_type_motor.c#L79-L85; Motor.stop():
 *   pb_type_motor.c#L483; Port and Direction: FW pybricks/parameters/pb_module_parameters.c
 *   #L11-L32; wait(time) in ms: FW pybricks/tools/pb_module_tools.c#L67-L103.
 */
import { LIMITS, type RobotProfile } from './profile';

/** How far the first program drives, mm. */
export const CALIBRATION_DISTANCE_MM = 1000;
/** How many times the second program turns on the spot. */
export const CALIBRATION_TURNS = 10;

export type CalibrationKind = 'straight' | 'turn';

/** The wheel numbers a calibration program was made with. */
export interface CalibrationBasis {
  readonly wheelDiameterMm: number;
  readonly trackMm: number;
}

export const basisOf = (robot: RobotProfile): CalibrationBasis => ({
  wheelDiameterMm: robot.wheels.diameterMm,
  trackMm: robot.wheels.trackMm,
});

const number = (value: number) => String(Math.round(value * 100) / 100);

/**
 * The program for one test, following the hub code rules (CLAUDE.md): a config block, ports
 * named once, and every motor stopped in `finally`.
 */
export function calibrationProgram(
  robot: RobotProfile,
  kind: CalibrationKind,
  basis: CalibrationBasis = basisOf(robot),
): string {
  const mirrored = (side: 'left' | 'right') =>
    robot.drive.mirrored === side ? ', positive_direction=Direction.COUNTERCLOCKWISE' : '';
  const move =
    kind === 'straight'
      ? ['DISTANCE_MM = ' + CALIBRATION_DISTANCE_MM, 'robot.straight(DISTANCE_MM)']
      : [
          `TURN_DEGREES = ${CALIBRATION_TURNS * 360}  # ${CALIBRATION_TURNS} turns, clockwise`,
          'robot.turn(TURN_DEGREES)',
        ];
  return `# MatPilot calibration: ${
    kind === 'straight'
      ? `drive ${CALIBRATION_DISTANCE_MM} mm`
      : `turn ${CALIBRATION_TURNS} times on the spot`
  }
# Robot: ${robot.name.replace(/[\r\n]+/g, ' ')}
from pybricks.parameters import Direction, Port
from pybricks.pupdevices import Motor
from pybricks.robotics import DriveBase
from pybricks.tools import wait

# --- Config ---------------------------------------------------------------
LEFT_MOTOR_PORT = Port.${robot.drive.left}
RIGHT_MOTOR_PORT = Port.${robot.drive.right}
WHEEL_DIAMETER_MM = ${number(basis.wheelDiameterMm)}
AXLE_TRACK_MM = ${number(basis.trackMm)}
${move[0]}
START_DELAY_MS = 1000  # time to take your hands away

# --- Setup ----------------------------------------------------------------
left = Motor(LEFT_MOTOR_PORT${mirrored('left')})
right = Motor(RIGHT_MOTOR_PORT${mirrored('right')})
robot = DriveBase(left, right, WHEEL_DIAMETER_MM, AXLE_TRACK_MM)

# --- Main -----------------------------------------------------------------
try:
    wait(START_DELAY_MS)
    ${move[1]}
finally:
    robot.stop()
    left.stop()
    right.stop()
`;
}

/** How far the robot turned in all: whole turns, then where it stopped against the start way. */
export function turnedDegrees(
  turns: number,
  stopped: 'exactly' | 'before' | 'past',
  degrees: number,
): number {
  const off = stopped === 'exactly' ? 0 : stopped === 'before' ? -degrees : degrees;
  return turns * 360 + off;
}

export interface CalibrationInput {
  /** How far the robot drove in the first test, mm; `null` if not done. */
  readonly drivenMm: number | null;
  /** How far to the side of the straight line it ended, mm (either side); `null` if not measured. */
  readonly sidewaysMm: number | null;
  /** How far it turned in all in the second test, degrees; `null` if not done. */
  readonly turnedDeg: number | null;
}

export type CalibrationResult =
  | {
      readonly ok: true;
      readonly wheelDiameterMm: number;
      readonly trackMm: number;
      /** For the robot's drift per metre, when the sideways distance was measured. */
      readonly driftPerMetreMm: number | null;
    }
  | { readonly ok: false; readonly message: string };

const roundTo = (value: number, places: number) => {
  const factor = 10 ** places;
  return Math.round(value * factor) / factor;
};

/** The corrected wheel diameter and axle track from what was measured. */
export function calibrate(basis: CalibrationBasis, input: CalibrationInput): CalibrationResult {
  const { drivenMm, turnedDeg, sidewaysMm } = input;
  if (drivenMm === null && turnedDeg === null) {
    return { ok: false, message: 'Run a test and type what you measured.' };
  }
  if (drivenMm !== null && !(drivenMm >= 500 && drivenMm <= 2000)) {
    return {
      ok: false,
      message: `It should have driven about ${CALIBRATION_DISTANCE_MM} mm. Measure again: from the mark at the start to the same point on the robot at the end, in mm.`,
    };
  }
  const asked = CALIBRATION_TURNS * 360;
  if (turnedDeg !== null && !(turnedDeg >= asked / 2 && turnedDeg <= asked * 1.5)) {
    return {
      ok: false,
      message: `It should have turned about ${CALIBRATION_TURNS} times. Count the turns again.`,
    };
  }
  const wheelDiameterMm =
    drivenMm === null
      ? basis.wheelDiameterMm
      : (basis.wheelDiameterMm * drivenMm) / CALIBRATION_DISTANCE_MM;
  const trackMm =
    turnedDeg === null
      ? basis.trackMm
      : ((basis.trackMm * wheelDiameterMm) / basis.wheelDiameterMm) * (asked / turnedDeg);
  const inRange = (value: number, limit: { min: number; max: number }) =>
    value >= limit.min && value <= limit.max;
  if (!inRange(wheelDiameterMm, LIMITS.wheelDiameterMm) || !inRange(trackMm, LIMITS.trackMm)) {
    return { ok: false, message: 'These numbers give an impossible robot. Measure again.' };
  }
  const drift =
    sidewaysMm === null ? null : Math.min(LIMITS.driftMm.max, roundTo(Math.abs(sidewaysMm), 0));
  return {
    ok: true,
    wheelDiameterMm: roundTo(wheelDiameterMm, 1),
    trackMm: roundTo(trackMm, 1),
    driftPerMetreMm: drift,
  };
}

/** The robot with the corrected numbers. */
export function applyCalibration(
  robot: RobotProfile,
  result: Extract<CalibrationResult, { ok: true }>,
): RobotProfile {
  return {
    ...robot,
    wheels: { ...robot.wheels, diameterMm: result.wheelDiameterMm, trackMm: result.trackMm },
    drift:
      result.driftPerMetreMm === null
        ? robot.drift
        : { ...robot.drift, perMetreMm: result.driftPerMetreMm },
  };
}
