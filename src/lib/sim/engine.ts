/**
 * The robot on the mat, on a virtual clock (ADR 0016, step 7c): the motors and the drive base a
 * program commands, and the pose that follows from the wheels. Everything a program asks of the
 * simulated `pybricks` (./pybricks.ts) lands here; nothing is real time.
 *
 * Two sets of numbers meet here, as on a real robot: the PROGRAM's (its DriveBase wheel diameter
 * and axle track, from its Config) turn distances and angles into motor degrees; the ROBOT's on the
 * mat (its real wheels and axle track, from the Robots page) turn motor degrees into movement. When
 * they differ, the robot goes too far or not far enough, as it would on the mat.
 *
 * Pybricks behaviour this follows, at pybricks-micropython v4.1.3 (FW = https://github.com/pybricks/
 * pybricks-micropython/blob/c860b6a00301fb7c6ecd429da11dcb5a6c557c7a), cited in
 * ../blocks/pybricks.ts and ../robots/motion.ts unless given here:
 * - DriveBase.straight(distance) in mm and turn(angle) in degrees, waiting by default; a positive
 *   turn is clockwise seen from above: the heading is (left − right) / 2 of the wheel angles, scaled
 *   by wheel diameter / axle track: FW lib/pbio/src/drivebase.c#L146-L151 #L349-L355.
 * - Default speeds: 40 % of the top speed straight, a third turning; accelerations 3/4 of the
 *   motors' 2000 °/s²: FW lib/pbio/src/drivebase.c#L65-L108, FW lib/pbio/src/servo.c#L277-L278.
 * - A motor's top speed is its rated speed: FW lib/pbio/src/servo.c#L271.
 * - A motor command also stops the drive base that uses the motor: FW lib/pbio/src/servo.c#L548-L552.
 * - DriveBase.distance_control and heading_control are the drive base's own controls
 *   (FW pybricks/robotics/pb_type_drivebase.c#L84-L85): their top speed is the slower motor's and
 *   their acceleration 3/4 of the motors' (FW lib/pbio/src/drivebase.c#L67 #L76 #L84), scaled to
 *   millimetres and to degrees of turning (drivebase.c#L349-L355); Control.limits() gives them in
 *   those units (FW lib/pbio/src/control_settings.c#L46-L48 #L176-L180), so mm/s and °/s.
 * - Motor.run_angle with a negative speed turns the other way: FW lib/pbio/src/control.c#L622
 *   #L630; with speed 0 it ends at once: FW lib/pbio/src/servo.c#L769-L774.
 *
 * What it leaves out, and says so on the page: slipping, bumping into things, the battery, and
 * the small overshoot of real motors. Stop, brake and hold all stop at once.
 */
import type { PortName } from '../blocks/pybricks';

/** The robot as it is on the mat: what turns motor degrees into movement. */
export interface SimRobot {
  readonly wheelDiameterMm: number;
  readonly trackMm: number;
  readonly left: PortName;
  readonly right: PortName;
  /** The motor mounted turned round: its shaft turns the other way to drive forward. */
  readonly mirrored: 'left' | 'right';
  /** The drive motors' rated top speed, °/s. */
  readonly motorTopSpeedDegS: number;
}

export interface Pose {
  readonly xMm: number;
  readonly yMm: number;
  /** MAT frame: 0° = +x, counter-clockwise positive. */
  readonly headingDeg: number;
}

/** A motor's acceleration, °/s² (FW lib/pbio/src/servo.c#L277-L278). */
const MOTOR_ACCELERATION = 2000;
/** The drive base uses 3/4 of it (FW lib/pbio/src/drivebase.c#L83-L85). */
const DRIVE_SHARE = 3 / 4;

/** A move from standing to standing: up to `speed`, at `acceleration`, over `distance`. */
interface Ramp {
  readonly distance: number;
  readonly speed: number;
  readonly acceleration: number;
}

const rampSeconds = ({ distance, speed, acceleration }: Ramp): number => {
  const d = Math.abs(distance);
  if (d === 0 || speed <= 0 || acceleration <= 0) return 0;
  if (d <= (speed * speed) / acceleration) return 2 * Math.sqrt(d / acceleration);
  return (2 * speed) / acceleration + (d - (speed * speed) / acceleration) / speed;
};

/** How far along a ramp the move is after `t` seconds (signed like the distance). */
function rampAt(ramp: Ramp, t: number): number {
  const d = Math.abs(ramp.distance);
  const sign = Math.sign(ramp.distance);
  const total = rampSeconds(ramp);
  if (t >= total) return ramp.distance;
  if (t <= 0) return 0;
  const a = ramp.acceleration;
  const peak = Math.min(ramp.speed, Math.sqrt(d * a));
  const rise = peak / a;
  const cruise = total - 2 * rise;
  let s: number;
  if (t < rise) s = 0.5 * a * t * t;
  else if (t < rise + cruise) s = 0.5 * a * rise * rise + peak * (t - rise);
  else {
    const left = total - t;
    s = d - 0.5 * a * left * left;
  }
  return sign * s;
}

/** A motor in the program's units: degrees, positive the way the program's Motor counts. */
interface MotorState {
  /** The program made it with positive_direction=COUNTERCLOCKWISE. */
  readonly counterclockwise: boolean;
  /** Angle in the program's units, degrees. */
  angle: number;
  speed: number;
  /** What it is doing, when not driven by a drive base. */
  command:
    | { readonly kind: 'idle' }
    | { readonly kind: 'run'; readonly target: number }
    | { readonly kind: 'move'; readonly start: number; readonly t0: number; readonly ramp: Ramp }
    | { readonly kind: 'timed'; readonly target: number; readonly until: number };
  /** A drive base drives it. */
  driven: boolean;
}

export interface DriveSettings {
  straightSpeed: number;
  straightAcceleration: number;
  turnRate: number;
  turnAcceleration: number;
}

interface DriveState {
  readonly left: PortName;
  readonly right: PortName;
  /** The program's numbers. */
  readonly wheelDiameterMm: number;
  readonly trackMm: number;
  readonly settings: DriveSettings;
  /** Distance (mm) and heading (° clockwise) the drive base counts, from its motors. */
  distanceZero: number;
  headingZero: number;
  command:
    | { readonly kind: 'idle' }
    | {
        readonly kind: 'move';
        readonly t0: number;
        readonly startDistance: number;
        readonly startHeading: number;
        readonly distance: Ramp | null;
        readonly heading: Ramp | null;
      }
    | {
        readonly kind: 'drive';
        /** mm/s and °/s, reached at the drive base's accelerations. */
        readonly speed: number;
        readonly turnRate: number;
      };
  /** For `drive`: the speeds reached so far. */
  speedNow: number;
  turnNow: number;
}

export interface Frame {
  readonly t: number;
  readonly pose: Pose;
}

/** One step of the clock, ms: small enough for smooth turns. */
const STEP_MS = 5;
/** A frame for playback every this many ms. */
const FRAME_MS = 20;

export class Simulation {
  /** Virtual time, ms. */
  time = 0;
  private pose: { x: number; y: number; heading: number };
  private readonly motors = new Map<PortName, MotorState>();
  private drive: DriveState | null = null;
  readonly frames: Frame[] = [];
  private nextFrame = 0;

  constructor(
    private readonly robot: SimRobot,
    start: Pose,
    private readonly timeLimitMs: number,
  ) {
    this.pose = { x: start.xMm, y: start.yMm, heading: start.headingDeg };
    this.record();
  }

  get over(): boolean {
    return this.time >= this.timeLimitMs;
  }

  get currentPose(): Pose {
    return { xMm: this.pose.x, yMm: this.pose.y, headingDeg: this.pose.heading };
  }

  private record() {
    this.frames.push({ t: this.time, pose: this.currentPose });
    this.nextFrame = this.time + FRAME_MS;
  }

  // --- Motors ---------------------------------------------------------------------------------

  /** The program made a Motor on this port. */
  addMotor(port: PortName, counterclockwise: boolean): void {
    this.motors.set(port, {
      counterclockwise,
      angle: 0,
      speed: 0,
      command: { kind: 'idle' },
      driven: false,
    });
  }

  private motor(port: PortName): MotorState {
    const motor = this.motors.get(port);
    if (!motor) throw new Error(`No motor on port ${port}.`);
    return motor;
  }

  private topSpeed(port: PortName): number {
    // The drive motors are the robot's; other motors are taken to be the same kind.
    void port;
    return this.robot.motorTopSpeedDegS;
  }

  /** A motor command: it takes the motor from its drive base, which stops (FW servo.c#L542-L546). */
  private claim(port: PortName): MotorState {
    const motor = this.motor(port);
    if (motor.driven && this.drive) {
      this.stopDrive();
      for (const each of [this.drive.left, this.drive.right]) this.motor(each).driven = false;
    }
    return motor;
  }

  /** A drive base command takes its motors back. */
  private takeMotors(drive: DriveState): void {
    for (const port of [drive.left, drive.right]) {
      const motor = this.motor(port);
      motor.driven = true;
      motor.command = { kind: 'idle' };
    }
  }

  run(port: PortName, speed: number): void {
    const motor = this.claim(port);
    motor.command = { kind: 'run', target: this.clampSpeed(port, speed) };
  }

  runTime(port: PortName, speed: number, ms: number, wait: boolean): void {
    const motor = this.claim(port);
    motor.command = {
      kind: 'timed',
      target: this.clampSpeed(port, speed),
      until: this.time + Math.max(0, ms),
    };
    if (wait) this.advanceUntil(() => motor.command.kind === 'idle');
  }

  /** Turns `angle` degrees at `speed` (a negative angle or speed turns the other way). */
  runAngle(port: PortName, speed: number, angle: number, wait: boolean): void {
    const motor = this.claim(port);
    const signed = Math.sign(speed || 1) * angle;
    motor.command = {
      kind: 'move',
      start: motor.angle,
      t0: this.time,
      ramp: {
        distance: signed,
        speed: Math.abs(this.clampSpeed(port, speed)),
        acceleration: MOTOR_ACCELERATION,
      },
    };
    if (speed === 0) motor.command = { kind: 'idle' };
    if (wait) this.advanceUntil(() => motor.command.kind === 'idle');
  }

  runTarget(port: PortName, speed: number, target: number, wait: boolean): void {
    const motor = this.motor(port);
    this.runAngle(port, Math.abs(speed), target - motor.angle, wait);
  }

  /** Power in % of full: taken as that share of the top speed. */
  dc(port: PortName, duty: number): void {
    this.run(port, (Math.max(-100, Math.min(100, duty)) / 100) * this.topSpeed(port));
  }

  stopMotor(port: PortName): void {
    const motor = this.claim(port);
    motor.command = { kind: 'idle' };
    motor.speed = 0;
  }

  motorAngle(port: PortName): number {
    return this.motor(port).angle;
  }

  motorSpeed(port: PortName): number {
    return this.motor(port).speed;
  }

  resetAngle(port: PortName, angle: number): void {
    this.motor(port).angle = angle;
  }

  motorDone(port: PortName): boolean {
    const command = this.motor(port).command;
    return command.kind === 'idle' || command.kind === 'run';
  }

  /** Control.limits(): (speed, acceleration, torque); torque is not modelled. */
  limits(port: PortName): [number, number, number] {
    return [this.topSpeed(port), MOTOR_ACCELERATION, 0];
  }

  private clampSpeed(port: PortName, speed: number): number {
    const top = this.topSpeed(port);
    return Math.max(-top, Math.min(top, speed));
  }

  // --- Drive base ----------------------------------------------------------------------------

  /** The program made a DriveBase, with its own idea of the wheels. */
  addDrive(
    left: PortName,
    right: PortName,
    wheelDiameterMm: number,
    trackMm: number,
    speed: DriveSettings | null,
  ): void {
    const perMm = 360 / (Math.PI * wheelDiameterMm);
    const perTurn = trackMm / wheelDiameterMm;
    const top = this.robot.motorTopSpeedDegS;
    const acceleration = MOTOR_ACCELERATION * DRIVE_SHARE;
    const settings: DriveSettings = speed ?? {
      straightSpeed: (top / perMm) * 0.4,
      straightAcceleration: acceleration / perMm,
      turnRate: top / perTurn / 3,
      turnAcceleration: acceleration / perTurn,
    };
    this.drive = {
      left,
      right,
      wheelDiameterMm,
      trackMm,
      settings: { ...settings },
      distanceZero: 0,
      headingZero: 0,
      command: { kind: 'idle' },
      speedNow: 0,
      turnNow: 0,
    };
    this.takeMotors(this.drive);
  }

  private driveBase(): DriveState {
    if (!this.drive) throw new Error('No drive base.');
    return this.drive;
  }

  /** The distance (mm) and heading (° clockwise) the drive base counts from its motors' angles. */
  private counted(drive: DriveState) {
    const left = this.motor(drive.left).angle;
    const right = this.motor(drive.right).angle;
    const perMm = 360 / (Math.PI * drive.wheelDiameterMm);
    const perTurn = drive.trackMm / drive.wheelDiameterMm;
    return { distance: (left + right) / 2 / perMm, heading: (left - right) / 2 / perTurn };
  }

  straight(distance: number, wait: boolean): void {
    const drive = this.driveBase();
    this.takeMotors(drive);
    const now = this.counted(drive);
    drive.command = {
      kind: 'move',
      t0: this.time,
      startDistance: now.distance,
      startHeading: now.heading,
      distance: {
        distance,
        speed: drive.settings.straightSpeed,
        acceleration: drive.settings.straightAcceleration,
      },
      heading: null,
    };
    if (wait) this.advanceUntil(() => drive.command.kind !== 'move');
  }

  turn(angle: number, wait: boolean): void {
    const drive = this.driveBase();
    this.takeMotors(drive);
    const now = this.counted(drive);
    drive.command = {
      kind: 'move',
      t0: this.time,
      startDistance: now.distance,
      startHeading: now.heading,
      distance: null,
      heading: {
        distance: angle,
        speed: drive.settings.turnRate,
        acceleration: drive.settings.turnAcceleration,
      },
    };
    if (wait) this.advanceUntil(() => drive.command.kind !== 'move');
  }

  driveForever(speed: number, turnRate: number): void {
    const drive = this.driveBase();
    this.takeMotors(drive);
    if (drive.command.kind !== 'drive') {
      drive.speedNow = 0;
      drive.turnNow = 0;
    }
    drive.command = { kind: 'drive', speed, turnRate };
  }

  stopDrive(): void {
    const drive = this.driveBase();
    drive.command = { kind: 'idle' };
    drive.speedNow = 0;
    drive.turnNow = 0;
    for (const port of [drive.left, drive.right]) this.motor(port).speed = 0;
  }

  driveDone(): boolean {
    return this.driveBase().command.kind !== 'move';
  }

  settings(): DriveSettings {
    return { ...this.driveBase().settings };
  }

  /**
   * The drive base's distance_control or heading_control limits(): (speed, acceleration,
   * torque) in mm/s and mm/s², or °/s and °/s² of turning; torque is not modelled.
   */
  driveLimits(control: 'distance' | 'heading'): [number, number, number] {
    const drive = this.driveBase();
    const perMm = 360 / (Math.PI * drive.wheelDiameterMm);
    const perTurn = drive.trackMm / drive.wheelDiameterMm;
    const per = control === 'distance' ? perMm : perTurn;
    return [this.robot.motorTopSpeedDegS / per, (MOTOR_ACCELERATION * DRIVE_SHARE) / per, 0];
  }

  setSettings(next: Partial<DriveSettings>): void {
    Object.assign(this.driveBase().settings, next);
  }

  driveDistance(): number {
    const drive = this.driveBase();
    return this.counted(drive).distance - drive.distanceZero;
  }

  driveAngle(): number {
    const drive = this.driveBase();
    return this.counted(drive).heading - drive.headingZero;
  }

  resetDrive(): void {
    const drive = this.driveBase();
    const now = this.counted(drive);
    drive.distanceZero = now.distance;
    drive.headingZero = now.heading;
  }

  // --- The clock -----------------------------------------------------------------------------

  /** Moves time on by `ms`, stopping at the time limit (then `over` is true). */
  wait(ms: number): void {
    const until = this.time + Math.max(0, ms);
    this.advanceUntil(() => this.time >= until);
  }

  /** A little time for a call that only reads, so a loop that only reads still moves time on. */
  tick(ms = 1): void {
    this.wait(ms);
  }

  /**
   * Runs the clock until `done`, or to the time limit. It never throws: a program stopped by the
   * time limit is stopped by the simulated pybricks, which raises SystemExit as the hub's stop
   * button does, so the program's `finally` still stops its motors (./pybricks.ts).
   */
  private advanceUntil(done: () => boolean): void {
    while (!done() && !this.over) {
      this.step(Math.min(STEP_MS, this.timeLimitMs - this.time));
    }
  }

  private step(ms: number): void {
    const dt = ms / 1000;
    const t1 = this.time + ms;
    const before = new Map([...this.motors].map(([port, motor]) => [port, motor.angle]));

    for (const motor of this.motors.values()) {
      if (motor.driven) continue;
      const command = motor.command;
      if (command.kind === 'run' || command.kind === 'timed') {
        const target = command.kind === 'timed' && t1 >= command.until ? 0 : command.target;
        const change = MOTOR_ACCELERATION * dt;
        motor.speed += Math.max(-change, Math.min(change, target - motor.speed));
        motor.angle += motor.speed * dt;
        if (command.kind === 'timed' && t1 >= command.until && motor.speed === 0)
          motor.command = { kind: 'idle' };
      } else if (command.kind === 'move') {
        const elapsed = (t1 - command.t0) / 1000;
        const angle = command.start + rampAt(command.ramp, elapsed);
        motor.speed = (angle - motor.angle) / dt;
        motor.angle = angle;
        if (elapsed >= rampSeconds(command.ramp)) {
          motor.command = { kind: 'idle' };
          motor.speed = 0;
        }
      } else {
        motor.speed = 0;
      }
    }

    const drive = this.drive;
    if (drive && drive.command.kind !== 'idle') {
      const perMm = 360 / (Math.PI * drive.wheelDiameterMm);
      const perTurn = drive.trackMm / drive.wheelDiameterMm;
      const now = this.counted(drive);
      let distance = now.distance;
      let heading = now.heading;
      const command = drive.command;
      if (command.kind === 'move') {
        const elapsed = (t1 - command.t0) / 1000;
        if (command.distance) distance = command.startDistance + rampAt(command.distance, elapsed);
        if (command.heading) heading = command.startHeading + rampAt(command.heading, elapsed);
        const total = Math.max(
          command.distance ? rampSeconds(command.distance) : 0,
          command.heading ? rampSeconds(command.heading) : 0,
        );
        if (elapsed >= total) drive.command = { kind: 'idle' };
      } else {
        const s = drive.settings;
        const ds = s.straightAcceleration * dt;
        const dh = s.turnAcceleration * dt;
        drive.speedNow += Math.max(-ds, Math.min(ds, command.speed - drive.speedNow));
        drive.turnNow += Math.max(-dh, Math.min(dh, command.turnRate - drive.turnNow));
        distance += drive.speedNow * dt;
        heading += drive.turnNow * dt;
      }
      const left = this.motor(drive.left);
      const right = this.motor(drive.right);
      const newLeft = distance * perMm + heading * perTurn;
      const newRight = distance * perMm - heading * perTurn;
      left.speed = (newLeft - left.angle) / dt;
      right.speed = (newRight - right.angle) / dt;
      left.angle = newLeft;
      right.angle = newRight;
      if (drive.command.kind === 'idle') {
        left.speed = 0;
        right.speed = 0;
      }
    }

    // The robot moves by what its own wheels did.
    const travel = (port: PortName) => {
      const motor = this.motors.get(port);
      if (!motor) return 0;
      const turned = motor.angle - (before.get(port) ?? motor.angle);
      // The program's degrees to the shaft's, then to the wheel's forward.
      const shaft = motor.counterclockwise ? -turned : turned;
      const mirrored = (port === this.robot.left ? 'left' : 'right') === this.robot.mirrored;
      const forward = mirrored ? -shaft : shaft;
      return (forward * Math.PI * this.robot.wheelDiameterMm) / 360;
    };
    const sLeft = travel(this.robot.left);
    const sRight = travel(this.robot.right);
    const forward = (sLeft + sRight) / 2;
    const turn = (sRight - sLeft) / this.robot.trackMm; // radians, counter-clockwise
    const mid = (this.pose.heading * Math.PI) / 180 + turn / 2;
    this.pose.x += forward * Math.cos(mid);
    this.pose.y += forward * Math.sin(mid);
    this.pose.heading += (turn * 180) / Math.PI;
    this.time = t1;
    if (this.time >= this.nextFrame) this.record();
  }

  /** The last frame, so playback ends where the robot did. */
  finish(): void {
    if (this.frames.at(-1)?.t !== this.time) this.record();
  }
}
