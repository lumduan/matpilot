import { describe, expect, it } from 'vitest';
import { autoSpeed, moveSeconds, robotMotion } from './motion';
import { newRobot } from './profile';

describe('a robot’s speed', () => {
  it('follows the firmware’s rules for SPIKE motors and 56 mm wheels 112 mm apart', () => {
    const speed = autoSpeed(newRobot());
    expect(speed.topStraightMmS).toBeCloseTo(488.69, 2); // 1000 °/s × π × 56 / 360
    expect(speed.straightMmS).toBeCloseTo(195.48, 2); // 40 %
    expect(speed.straightAccelerationMmS2).toBeCloseTo(733.04, 2); // 2000 × 3/4 °/s²
    expect(speed.topTurnRateDegS).toBeCloseTo(500, 6); // 1000 × 56 / 112
    expect(speed.turnRateDegS).toBeCloseTo(166.67, 2); // a third
    expect(speed.turnAccelerationDegS2).toBeCloseTo(750, 6);
  });

  it('is slower with SPIKE’s small motor', () => {
    const robot = newRobot();
    const small = autoSpeed({ ...robot, drive: { ...robot.drive, motor: 'spike-small' } });
    expect(small.topStraightMmS).toBeCloseTo(488.69 * 0.62, 1);
  });

  it('uses typed-in speeds when set, keeping the top speeds for reference', () => {
    const robot = newRobot();
    const motion = robotMotion({
      ...robot,
      speed: {
        mode: 'set',
        straightMmS: 300,
        straightAccelerationMmS2: 500,
        turnRateDegS: 90,
        turnAccelerationDegS2: 400,
      },
    });
    expect(motion).toMatchObject({ source: 'set', straightMmS: 300, turnRateDegS: 90 });
    expect(motion.topStraightMmS).toBeCloseTo(488.69, 2);
    expect(motion.mmPerMotorDegree).toBeCloseTo((Math.PI * 56) / 360, 9);
  });

  it('times a move with speeding up and slowing down', () => {
    // Reaches 200 mm/s: 2 × 200/500 s ramping, plus (1000 − 80) / 200 s at speed.
    expect(moveSeconds(1000, 200, 500)).toBeCloseTo(0.8 + 4.6, 9);
    // Too short to reach full speed: a triangle.
    expect(moveSeconds(40, 200, 500)).toBeCloseTo(2 * Math.sqrt(40 / 500), 9);
    expect(moveSeconds(-40, 200, 500)).toBeCloseTo(moveSeconds(40, 200, 500), 9);
    expect(moveSeconds(0, 200, 500)).toBe(0);
  });
});
