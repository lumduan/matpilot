import { describe, expect, it } from 'vitest';
import { newRobot, type RobotProfile } from './profile';
import { WRO_2026_ROBOMISSION_ELEMENTARY as WRO, robotChecks, turnedSize } from './rules';
import { footprint, turningRadius } from './shape';

const robot = newRobot(); // body 160 × 200 × 120, axle 70 mm from the back, wheels 56 mm, track 112

describe('a robot’s shape', () => {
  it('measures the body and wheels together', () => {
    expect(footprint(robot)).toEqual({ minX: -70, maxX: 130, minY: -80, maxY: 80 });
    const wide: RobotProfile = { ...robot, wheels: { ...robot.wheels, trackMm: 170, widthMm: 20 } };
    expect(footprint(wide)).toMatchObject({ minY: -95, maxY: 95 });
  });

  it('finds the room it needs to turn on the spot', () => {
    expect(turningRadius(robot)).toBeCloseTo(Math.hypot(130, 80), 9);
  });
});

describe('the WRO 2026 RoboMission checks', () => {
  it('quote their rules', () => {
    expect(WRO.quotes.map((quote) => quote.rule)).toEqual(['5.1', '5.2.1', '5.2.8', '7.8', '10.1']);
  });

  it('pass a robot that fits, and say which do not', () => {
    const at = (heading: number, profile = robot) =>
      Object.fromEntries(robotChecks(profile, WRO, heading).map((check) => [check.id, check.ok]));
    expect(at(0)).toEqual({ envelope: true, start: true, mass: null, motors: true });
    // Turned 45°, 160 × 200 mm needs 254.6 mm each way.
    expect(at(45).start).toBe(false);
    const big: RobotProfile = {
      ...robot,
      body: { ...robot.body, heightMm: 260 },
      massG: 1600,
      motors: [
        { port: 'C', name: 'arm' },
        { port: 'D', name: 'claw' },
        { port: 'E', name: 'lift' },
      ],
    };
    expect(at(0, big)).toEqual({ envelope: false, start: true, mass: false, motors: false });
  });

  it('turn a footprint like the start-area rule of wro-2026', () => {
    const turned = turnedSize(250, 250, 45);
    expect(turned.across).toBeCloseTo(250 * Math.SQRT2, 9);
    expect(turnedSize(160, 200, 0)).toEqual({ across: 160, along: 200 });
  });
});
