/**
 * A robot's shape seen from above, in the ROBOT frame (ADR 0016 section 2: the origin between
 * the drive wheels, +x forward, +y left): the body, the wheels, the whole footprint, and the room
 * it needs to turn on the spot.
 */
import type { Point } from '../geometry/rect';
import type { RobotProfile } from './profile';

export interface Box {
  readonly minX: number;
  readonly maxX: number;
  readonly minY: number;
  readonly maxY: number;
}

export const boxWidth = (box: Box) => box.maxY - box.minY;
export const boxLength = (box: Box) => box.maxX - box.minX;

/** The body's rectangle. */
export function bodyBox(robot: RobotProfile): Box {
  const back = -robot.body.axleFromBackMm;
  return {
    minX: back,
    maxX: back + robot.body.lengthMm,
    minY: -robot.body.widthMm / 2,
    maxY: robot.body.widthMm / 2,
  };
}

/** Each drive wheel's rectangle as seen from above: as long as its diameter, as wide as it is. */
export function wheelBoxes(robot: RobotProfile): { readonly left: Box; readonly right: Box } {
  const r = robot.wheels.diameterMm / 2;
  const half = robot.wheels.widthMm / 2;
  const y = robot.wheels.trackMm / 2;
  return {
    left: { minX: -r, maxX: r, minY: y - half, maxY: y + half },
    right: { minX: -r, maxX: r, minY: -y - half, maxY: -y + half },
  };
}

/** The smallest rectangle around the body and the wheels: what a ruler measures. */
export function footprint(robot: RobotProfile): Box {
  const parts = [bodyBox(robot), wheelBoxes(robot).left, wheelBoxes(robot).right];
  return {
    minX: Math.min(...parts.map((p) => p.minX)),
    maxX: Math.max(...parts.map((p) => p.maxX)),
    minY: Math.min(...parts.map((p) => p.minY)),
    maxY: Math.max(...parts.map((p) => p.maxY)),
  };
}

/** The robot's whole height: the body, or the wheels when they are taller. */
export const overallHeight = (robot: RobotProfile) =>
  Math.max(robot.body.heightMm, robot.wheels.diameterMm);

const corners = (box: Box): Point[] => [
  { x: box.minX, y: box.minY },
  { x: box.maxX, y: box.minY },
  { x: box.maxX, y: box.maxY },
  { x: box.minX, y: box.maxY },
];

/**
 * The turning circle: the farthest point of the body or the wheels from the point the robot
 * turns around. Turning on the spot, the robot sweeps a circle this big.
 */
export function turningRadius(robot: RobotProfile): number {
  const wheels = wheelBoxes(robot);
  return Math.max(
    ...[bodyBox(robot), wheels.left, wheels.right]
      .flatMap(corners)
      .map((p) => Math.hypot(p.x, p.y)),
  );
}
