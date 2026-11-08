/**
 * How fast a robot drives and turns (ADR 0016, D3): worked out from its motors and wheels by the
 * firmware's own rules ("auto"), or as typed in or measured.
 *
 * The firmware facts, at pybricks-micropython v4.1.3 (commit
 * c860b6a00301fb7c6ecd429da11dcb5a6c557c7a; FW = https://github.com/pybricks/pybricks-micropython/blob/c860b6a00301fb7c6ecd429da11dcb5a6c557c7a):
 * - A motor's top speed is its type's rated maximum speed: FW lib/pbio/src/servo.c#L271. SPIKE's
 *   medium and large motors are treated as the Technic M and L angular motors:
 *   FW lib/pbio/src/motor/servo_settings.c#L340-L346, rated 1000 °/s: #L300-L315. SPIKE's small
 *   motor is rated 620 °/s: #L292-L299.
 * - A motor accelerates and slows down at 2000 °/s²: FW lib/pbio/src/servo.c#L277-L278.
 * - The drive base takes the slower motor's limits, makes its acceleration 3/4 of the motors',
 *   and its default speed 40 % of its top speed: FW lib/pbio/src/drivebase.c#L65-L85. Turning
 *   uses the same limits, with a default of a third of the top speed: #L102-L108.
 * - One millimetre forward turns the motors 360 / (π × wheel diameter) degrees, and one degree of
 *   the robot's turn turns them axle track / wheel diameter degrees (each motor, opposite ways):
 *   FW lib/pbio/src/drivebase.c#L267 #L349-L355.
 *
 * The firmware works in whole numbers, so the hub's own figures can be a little lower (a few
 * tenths of a per cent); the page rounds what it shows.
 */
import type { MotorType, RobotProfile, RobotSpeed } from './profile';

/** Rated top speed of each drive motor type, °/s (see above). */
export const MOTOR_TOP_SPEED_DEG_S: Readonly<Record<MotorType, number>> = {
  'spike-large': 1000,
  'spike-medium': 1000,
  'spike-small': 620,
};

/** A motor's acceleration and deceleration, °/s² (see above). */
export const MOTOR_ACCELERATION_DEG_S2 = 2000;

/** The drive base uses this much of the motors' acceleration. */
const DRIVEBASE_ACCELERATION_SHARE = 3 / 4;
/** Default straight speed: this much of the top speed. */
const DEFAULT_STRAIGHT_SHARE = 10 / 25;
/** Default turn rate: this much of the top turn rate. */
const DEFAULT_TURN_SHARE = 1 / 3;

/** Motor degrees for each millimetre the robot drives. */
export const motorDegreesPerMm = (wheelDiameterMm: number) => 360 / (Math.PI * wheelDiameterMm);

/** Motor degrees (each wheel) for each degree the robot turns on the spot. */
export const motorDegreesPerTurnDegree = (wheelDiameterMm: number, trackMm: number) =>
  trackMm / wheelDiameterMm;

export interface RobotMotion extends RobotSpeed {
  /** The fastest the drive base can go straight, mm/s. */
  readonly topStraightMmS: number;
  /** The fastest it can turn on the spot, °/s. */
  readonly topTurnRateDegS: number;
  /** How far one motor degree moves the robot, mm. */
  readonly mmPerMotorDegree: number;
  /** Where the speeds come from. */
  readonly source: 'auto' | 'set';
}

/** The drive base's speeds as the firmware would set them, for these motors and wheels. */
export function autoSpeed(robot: RobotProfile): RobotSpeed & {
  readonly topStraightMmS: number;
  readonly topTurnRateDegS: number;
} {
  const perMm = motorDegreesPerMm(robot.wheels.diameterMm);
  const perTurnDegree = motorDegreesPerTurnDegree(robot.wheels.diameterMm, robot.wheels.trackMm);
  const top = MOTOR_TOP_SPEED_DEG_S[robot.drive.motor];
  const acceleration = MOTOR_ACCELERATION_DEG_S2 * DRIVEBASE_ACCELERATION_SHARE;
  const topStraightMmS = top / perMm;
  const topTurnRateDegS = top / perTurnDegree;
  return {
    topStraightMmS,
    topTurnRateDegS,
    straightMmS: topStraightMmS * DEFAULT_STRAIGHT_SHARE,
    straightAccelerationMmS2: acceleration / perMm,
    turnRateDegS: topTurnRateDegS * DEFAULT_TURN_SHARE,
    turnAccelerationDegS2: acceleration / perTurnDegree,
  };
}

/** The speeds this robot drives at: auto, or as typed in. */
export function robotMotion(robot: RobotProfile): RobotMotion {
  const auto = autoSpeed(robot);
  const speed: RobotSpeed =
    robot.speed.mode === 'set'
      ? {
          straightMmS: robot.speed.straightMmS,
          straightAccelerationMmS2: robot.speed.straightAccelerationMmS2,
          turnRateDegS: robot.speed.turnRateDegS,
          turnAccelerationDegS2: robot.speed.turnAccelerationDegS2,
        }
      : auto;
  return {
    ...speed,
    topStraightMmS: auto.topStraightMmS,
    topTurnRateDegS: auto.topTurnRateDegS,
    mmPerMotorDegree: 1 / motorDegreesPerMm(robot.wheels.diameterMm),
    source: robot.speed.mode,
  };
}

/**
 * The time to drive `distanceMm` (or turn `degrees`) from standing to standing, with this top
 * speed and acceleration: a trapezoid, or a triangle when the move is too short to reach full
 * speed. The firmware plans its moves this way; the exact plan is cited where a run on a mat
 * uses it (ADR 0016, step 7c).
 */
export function moveSeconds(distance: number, speed: number, acceleration: number): number {
  const d = Math.abs(distance);
  if (d === 0) return 0;
  const rampDistance = (speed * speed) / acceleration; // speeding up and slowing down together
  if (d <= rampDistance) return 2 * Math.sqrt(d / acceleration);
  return (2 * speed) / acceleration + (d - rampDistance) / speed;
}
