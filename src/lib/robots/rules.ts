/**
 * Rules profiles (ADR 0016, D9): the limits a competition puts on a robot, checked on the Robots
 * page. Each value is quoted from its rule book, with the rule number and page.
 *
 * WRO 2026 RoboMission: the "WRO 2026 RoboMission General Rules", version January 15th 2026
 * (https://wro-association.org/wp-content/uploads/WRO-2026-RoboMission-General-Rules.pdf,
 * sha256 90a28d8bf77f628227e5f544ec57b5230d620f3ae581f092bed1fda23de9e795), as quoted in
 * lumduan/wro-2026 (commit 46d8f28, docs/citations.json). The start area's size is measured on
 * the WRO 2026 Elementary mat, not given by a rule (wro-2026 docs/PHASE7_CONSTRAINTS.md §2).
 */
import { toRadians } from '../geometry/rect';
import type { RobotProfile } from './profile';
import { boxLength, boxWidth, footprint, overallHeight } from './shape';

export interface RuleQuote {
  readonly rule: string;
  readonly page: number;
  readonly text: string;
}

export interface RulesProfile {
  readonly id: string;
  readonly name: string;
  /** The largest the robot may be before the start: width, length, height (mm). */
  readonly envelopeMm: number | null;
  /** The start area, mm (a square), when the game has one. */
  readonly startAreaMm: number | null;
  readonly maxMassG: number | null;
  readonly maxMotors: number | null;
  /** How long a run lasts, seconds. */
  readonly runSeconds: number | null;
  readonly quotes: readonly RuleQuote[];
  readonly note: string;
}

export const WRO_2026_ROBOMISSION_ELEMENTARY: RulesProfile = {
  id: 'wro-2026-robomission-elementary',
  name: 'WRO 2026 RoboMission, Elementary',
  envelopeMm: 250,
  startAreaMm: 250.02,
  maxMassG: 1500,
  maxMotors: 4,
  runSeconds: 120,
  quotes: [
    {
      rule: '5.1',
      page: 6,
      text: 'maximum robot dimensions before the robot starts a run are 250mm x 250mm x 250mm',
    },
    { rule: '5.2.1', page: 6, text: 'Total weight <= 1,5 kg' },
    { rule: '5.2.8', page: 7, text: 'Elementary: 4 motors Junior: 5 motors Senior: 6 motors' },
    {
      rule: '7.8',
      page: 10,
      text: 'start area of the robot is exclusively the white area within a coloured border',
    },
    { rule: '10.1', page: 13, text: 'Each robot attempt is 2 minutes' },
  ],
  note: 'The start area on the WRO 2026 Elementary mat measures 250.02 × 250.02 mm, so a robot at the full 250 mm has 0.01 mm to spare on each side.',
};

export const RULES_PROFILES: readonly RulesProfile[] = [WRO_2026_ROBOMISSION_ELEMENTARY];

export interface RobotCheck {
  readonly id: 'envelope' | 'start' | 'mass' | 'motors';
  readonly ok: boolean | null;
  readonly label: string;
  readonly detail: string;
}

const mm = (value: number) => `${Math.round(value * 10) / 10} mm`;

/** How wide and long the footprint is when the robot is turned `degrees` from square. */
export function turnedSize(width: number, length: number, degrees: number) {
  const a = toRadians(degrees);
  const cos = Math.abs(Math.cos(a));
  const sin = Math.abs(Math.sin(a));
  return { across: width * cos + length * sin, along: width * sin + length * cos };
}

/** The checks of a rules profile for this robot, standing at `headingDeg` in the start area. */
export function robotChecks(
  robot: RobotProfile,
  rules: RulesProfile,
  headingDeg = 0,
): RobotCheck[] {
  const box = footprint(robot);
  const width = boxWidth(box);
  const length = boxLength(box);
  const height = overallHeight(robot);
  const checks: RobotCheck[] = [];
  if (rules.envelopeMm !== null) {
    const limit = rules.envelopeMm;
    const largest = Math.max(width, length, height);
    checks.push({
      id: 'envelope',
      ok: largest <= limit,
      label: `Fits a ${limit} mm cube before the start`,
      detail: `${mm(width)} wide, ${mm(length)} long, ${mm(height)} high (rule 5.1).`,
    });
  }
  if (rules.startAreaMm !== null) {
    const area = rules.startAreaMm;
    const turned = turnedSize(width, length, headingDeg);
    const ok = turned.across <= area && turned.along <= area;
    checks.push({
      id: 'start',
      ok,
      label: `Fits the start area turned ${Math.round(headingDeg)}°`,
      detail: `Takes ${mm(turned.across)} × ${mm(turned.along)} of the ${mm(area)} square.`,
    });
  }
  if (rules.maxMassG !== null) {
    checks.push({
      id: 'mass',
      ok: robot.massG === null ? null : robot.massG <= rules.maxMassG,
      label: `Weighs at most ${rules.maxMassG / 1000} kg`,
      detail:
        robot.massG === null
          ? 'Not weighed yet: type its mass to check (rule 5.2.1).'
          : `${robot.massG} g (rule 5.2.1).`,
    });
  }
  if (rules.maxMotors !== null) {
    const motors = 2 + robot.motors.length;
    checks.push({
      id: 'motors',
      ok: motors <= rules.maxMotors,
      label: `At most ${rules.maxMotors} motors`,
      detail: `${motors}: 2 drive motors and ${robot.motors.length} more (rule 5.2.8).`,
    });
  }
  return checks;
}
