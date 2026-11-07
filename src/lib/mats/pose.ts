/**
 * A robot standing on a mat (ADR 0016, section 5): its outline in the MAT frame, whether it is
 * inside an area, whether it is on the mat, and a pose that puts it in the middle of an area.
 */
import { contains, place, rectCorners, type Point, type Polygon } from '../geometry/rect';
import { bodyBox, footprint, wheelBoxes, type Box } from '../robots/shape';
import type { RobotProfile } from '../robots/profile';
import type { Mat, MatArea, MatPlacement } from './mat';

/** A box in the ROBOT frame, placed at the pose in the MAT frame. */
const placed = (box: Box, pose: MatPlacement): Polygon =>
  rectCorners(box, pose.headingDeg, { x: pose.xMm, y: pose.yMm });

/** The robot's body, wheels and whole outline on the mat. */
export function robotOnMat(robot: RobotProfile, pose: MatPlacement) {
  const wheels = wheelBoxes(robot);
  return {
    body: placed(bodyBox(robot), pose),
    left: placed(wheels.left, pose),
    right: placed(wheels.right, pose),
    outline: placed(footprint(robot), pose),
    /** A point ahead of the robot, for the arrow and the turning handle. */
    front: place({ x: footprint(robot).maxX, y: 0 }, pose.headingDeg, { x: pose.xMm, y: pose.yMm }),
  };
}

/** A robot's sensor on the mat. */
export const sensorOnMat = (
  sensor: { readonly xMm: number; readonly yMm: number },
  pose: MatPlacement,
): Point => place({ x: sensor.xMm, y: sensor.yMm }, pose.headingDeg, { x: pose.xMm, y: pose.yMm });

export const areaPolygon = (area: MatArea): Polygon => [
  { x: area.xMm, y: area.yMm },
  { x: area.xMm + area.widthMm, y: area.yMm },
  { x: area.xMm + area.widthMm, y: area.yMm + area.heightMm },
  { x: area.xMm, y: area.yMm + area.heightMm },
];

export const matPolygon = (mat: Pick<Mat, 'widthMm' | 'heightMm'>): Polygon =>
  areaPolygon({
    id: '',
    name: '',
    kind: 'other',
    xMm: 0,
    yMm: 0,
    widthMm: mat.widthMm,
    heightMm: mat.heightMm,
  });

/** The whole robot (body and wheels) is inside the area: the start-area rule. */
export const robotInside = (robot: RobotProfile, pose: MatPlacement, area: Polygon) =>
  contains(area, robotOnMat(robot, pose).outline);

/** Headings kept between −180° and 180°. */
export function normalHeading(degrees: number): number {
  const turned = ((((degrees + 180) % 360) + 360) % 360) - 180;
  return Object.is(turned, -0) ? 0 : turned;
}

/**
 * The pose that puts the robot's outline in the middle of the area, facing `headingDeg`: its
 * turning point moves so that the outline, not the point, is centred.
 */
export function poseInArea(robot: RobotProfile, area: MatArea, headingDeg: number): MatPlacement {
  const box = footprint(robot);
  const middle = place({ x: (box.minX + box.maxX) / 2, y: (box.minY + box.maxY) / 2 }, headingDeg);
  return {
    robotId: robot.id,
    xMm: area.xMm + area.widthMm / 2 - middle.x,
    yMm: area.yMm + area.heightMm / 2 - middle.y,
    headingDeg: normalHeading(headingDeg),
  };
}
