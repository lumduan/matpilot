/**
 * Putting what a LEGO model says into a robot profile (ADR 0017). A model has no ports: the child
 * picks one for each motor and sensor, starting from the robot's own ports where they match.
 */
import { PORTS, type PortName } from '../blocks/pybricks';
import type { RobotModel, RobotProfile } from '../robots/profile';
import type { ModelRobot } from './robot-from-model';

export interface ModelChoices {
  readonly left: PortName;
  readonly right: PortName;
  /** The motors that do not drive a wheel, in the order of `ModelRobot.motors`. */
  readonly motors: readonly { readonly port: PortName; readonly name: string }[];
  /** One port for each sensor, in the order of `ModelRobot.sensors`. */
  readonly sensors: readonly PortName[];
}

/** Ports to start from: the robot's own where a motor or sensor matches, then free ones. */
export function defaultChoices(found: ModelRobot, robot: RobotProfile): ModelChoices {
  const used = new Set<PortName>([robot.drive.left, robot.drive.right]);
  const free = () => {
    const port = PORTS.find((each) => !used.has(each)) ?? 'F';
    used.add(port);
    return port;
  };
  const sensorsLeft = robot.sensors.map((sensor, index) => ({ sensor, index }));
  const sensors = found.sensors.map((sensor) => {
    const match = sensorsLeft
      .filter((each) => each.sensor.type === sensor.sensor && !used.has(each.sensor.port))
      .sort(
        (p, q) =>
          Math.hypot(p.sensor.xMm - sensor.xMm, p.sensor.yMm - sensor.yMm) -
          Math.hypot(q.sensor.xMm - sensor.xMm, q.sensor.yMm - sensor.yMm),
      )[0];
    if (match) {
      used.add(match.sensor.port);
      sensorsLeft.splice(sensorsLeft.indexOf(match), 1);
      return match.sensor.port;
    }
    return null;
  });
  const others = found.motors.filter((motor) => motor.drives === null);
  const motors = others.map((_, index) => {
    const mine = robot.motors[index];
    if (mine && !used.has(mine.port)) {
      used.add(mine.port);
      return { port: mine.port, name: mine.name };
    }
    return null;
  });
  return {
    left: robot.drive.left,
    right: robot.drive.right,
    sensors: sensors.map((port) => port ?? free()),
    motors: motors.map((motor, index) => motor ?? { port: free(), name: `Motor ${index + 1}` }),
  };
}

/**
 * The robot with the model's numbers and the chosen ports. Its name, notes, speeds, mass and
 * measured drift stay: they belong to the real robot.
 */
export function applyModel(
  robot: RobotProfile,
  found: ModelRobot,
  choices: ModelChoices,
  model: RobotModel,
): RobotProfile {
  return {
    ...robot,
    body: {
      widthMm: found.body.widthMm,
      lengthMm: found.body.lengthMm,
      heightMm: found.body.heightMm,
      axleFromBackMm: found.body.axleFromBackMm,
    },
    wheels: {
      diameterMm: found.wheels.diameterMm,
      widthMm: found.wheels.widthMm,
      trackMm: found.wheels.trackMm,
    },
    drive: {
      left: choices.left,
      right: choices.right,
      mirrored: found.drive.mirrored,
      motor: found.drive.motor ?? robot.drive.motor,
    },
    motors: choices.motors.map((motor) => ({ port: motor.port, name: motor.name })),
    sensors: found.sensors.map((sensor, index) => ({
      type: sensor.sensor,
      port: choices.sensors[index] ?? 'F',
      xMm: sensor.xMm,
      yMm: sensor.yMm,
      facing: sensor.facing,
    })),
    model,
  };
}

/** What changes, for the child to see before using the numbers. */
export function modelChanges(
  robot: RobotProfile,
  next: RobotProfile,
): { readonly label: string; readonly now: string; readonly next: string }[] {
  const mm = (value: number) => `${value} mm`;
  const rows: { label: string; now: string; next: string }[] = [
    { label: 'Width', now: mm(robot.body.widthMm), next: mm(next.body.widthMm) },
    { label: 'Length', now: mm(robot.body.lengthMm), next: mm(next.body.lengthMm) },
    { label: 'Height', now: mm(robot.body.heightMm), next: mm(next.body.heightMm) },
    {
      label: 'Axle from the back',
      now: mm(robot.body.axleFromBackMm),
      next: mm(next.body.axleFromBackMm),
    },
    { label: 'Wheel diameter', now: mm(robot.wheels.diameterMm), next: mm(next.wheels.diameterMm) },
    { label: 'Wheel width', now: mm(robot.wheels.widthMm), next: mm(next.wheels.widthMm) },
    { label: 'Axle track', now: mm(robot.wheels.trackMm), next: mm(next.wheels.trackMm) },
    {
      label: 'Turned-round drive motor',
      now: robot.drive.mirrored,
      next: next.drive.mirrored,
    },
    { label: 'Other motors', now: String(robot.motors.length), next: String(next.motors.length) },
    { label: 'Sensors', now: String(robot.sensors.length), next: String(next.sensors.length) },
  ];
  return rows.filter((row) => row.now !== row.next);
}
