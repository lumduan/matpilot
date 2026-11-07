/**
 * What a run on the mat shows (ADR 0016, step 7c): when the robot first left the mat or touched a
 * keep-out area, which targets it ended inside, and where the program and the robot disagree (the
 * program's wheel sizes or drive ports are not the robot's), which explains a run that goes too
 * far, not far enough, or nowhere.
 */
import { overlaps } from '../geometry/rect';
import type { Mat, MatPlacement } from '../mats/mat';
import { areaPolygon, matPolygon, normalHeading, robotInside, robotOnMat } from '../mats/pose';
import type { RobotProfile } from '../robots/profile';
import type { Pose } from './engine';
import type { SimResult } from './runner';

export interface RunReview {
  /** When the robot first went (partly) off the mat, ms; `null` if it never did. */
  readonly leftMatAt: number | null;
  /** Keep-out areas touched, with when they were first touched. */
  readonly touched: readonly { readonly name: string; readonly at: number }[];
  /** Targets the robot ended wholly inside. */
  readonly endedIn: readonly string[];
  readonly targets: number;
  readonly final: Pose;
  /** Differences between the program's drive base and the robot. */
  readonly differences: readonly string[];
}

const asPlacement = (pose: Pose): MatPlacement => ({ robotId: null, ...pose });
const round = (value: number) => Math.round(value * 10) / 10;

export function reviewRun(result: SimResult, robot: RobotProfile, mat: Mat): RunReview {
  const matShape = matPolygon(mat);
  const avoid = mat.areas.filter((area) => area.kind === 'avoid');
  const targets = mat.areas.filter((area) => area.kind === 'target');
  let leftMatAt: number | null = null;
  const touched = new Map<string, number>();
  for (const frame of result.frames) {
    const placement = asPlacement(frame.pose);
    if (leftMatAt === null && !robotInside(robot, placement, matShape)) leftMatAt = frame.t;
    const outline = robotOnMat(robot, placement).outline;
    for (const area of avoid) {
      const name = area.name || 'Keep out';
      if (!touched.has(name) && overlaps(areaPolygon(area), outline)) touched.set(name, frame.t);
    }
  }
  const last = result.frames.at(-1)?.pose ?? { xMm: 0, yMm: 0, headingDeg: 0 };
  // The heading as a person reads it: a full turn round is facing the same way again.
  const final = { ...last, headingDeg: normalHeading(last.headingDeg) };
  const endedIn = targets
    .filter((area) => robotInside(robot, asPlacement(final), areaPolygon(area)))
    .map((area) => area.name || 'Target');

  const differences: string[] = [];
  const drive = result.programDrive;
  if (drive) {
    if (drive.left !== robot.drive.left || drive.right !== robot.drive.right) {
      differences.push(
        `The program drives ports ${drive.left} and ${drive.right}, but the robot’s wheels are on ${robot.drive.left} and ${robot.drive.right}.`,
      );
    }
    if (Math.abs(drive.wheelDiameterMm - robot.wheels.diameterMm) > 0.05) {
      differences.push(
        `The program counts ${round(drive.wheelDiameterMm)} mm wheels; the robot’s are ${round(robot.wheels.diameterMm)} mm, so it goes ${drive.wheelDiameterMm < robot.wheels.diameterMm ? 'further' : 'less far'} than the program asks.`,
      );
    }
    if (Math.abs(drive.trackMm - robot.wheels.trackMm) > 0.05) {
      differences.push(
        `The program counts ${round(drive.trackMm)} mm between the wheels; the robot has ${round(robot.wheels.trackMm)} mm, so it turns ${drive.trackMm > robot.wheels.trackMm ? 'more' : 'less'} than the program asks.`,
      );
    }
  }
  return {
    leftMatAt,
    touched: [...touched].map(([name, at]) => ({ name, at })),
    endedIn,
    targets: targets.length,
    final,
    differences,
  };
}
