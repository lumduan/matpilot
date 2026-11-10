import { describe, expect, it } from 'vitest';
import { Simulation, type SimRobot } from './engine';

/** The default robot: SPIKE motors, 56 mm wheels 112 mm apart, the left motor turned round. */
const ROBOT: SimRobot = {
  wheelDiameterMm: 56,
  trackMm: 112,
  left: 'A',
  right: 'B',
  mirrored: 'left',
  motorTopSpeedDegS: 1000,
};

/** As the generated Python makes them: the left motor counts counter-clockwise as forward. */
function withDrive(robot = ROBOT, wheel = 56, track = 112, limit = 120_000) {
  const sim = new Simulation(robot, { xMm: 100, yMm: 100, headingDeg: 0 }, limit);
  sim.addMotor('A', true);
  sim.addMotor('B', false);
  sim.addDrive('A', 'B', wheel, track, null);
  return sim;
}

describe('the simulated robot', () => {
  it('drives straight along its heading, at the firmware’s default speed', () => {
    const sim = withDrive();
    sim.straight(200, true);
    expect(sim.currentPose.xMm).toBeCloseTo(300, 6);
    expect(sim.currentPose.yMm).toBeCloseTo(100, 6);
    expect(sim.driveDistance()).toBeCloseTo(200, 6);
    // 195.5 mm/s with 733 mm/s² ramps: about 1.29 s.
    expect(sim.time).toBeGreaterThan(1200);
    expect(sim.time).toBeLessThan(1400);
  });

  it('gives the drive base’s own limits in mm/s and °/s, of which the default speeds are 40 % and a third', () => {
    const sim = withDrive();
    const [speed, acceleration, torque] = sim.driveLimits('distance');
    // 1000 °/s on 56 mm wheels: 488.7 mm/s.
    expect(speed).toBeCloseTo((1000 * Math.PI * 56) / 360, 6);
    expect(acceleration).toBeCloseTo((1500 * Math.PI * 56) / 360, 6);
    expect(torque).toBe(0);
    expect(sim.settings().straightSpeed).toBeCloseTo(speed * 0.4, 6);
    // Turning: 1000 °/s of the wheels is 500 °/s of the robot with the wheels 112 mm apart.
    const [turn] = sim.driveLimits('heading');
    expect(turn).toBeCloseTo(500, 6);
    expect(sim.settings().turnRate).toBeCloseTo(turn / 3, 6);
  });

  it('turns clockwise for a positive angle, on the spot', () => {
    const sim = withDrive();
    sim.turn(90, true);
    expect(sim.currentPose.headingDeg).toBeCloseTo(-90, 6);
    expect(sim.currentPose.xMm).toBeCloseTo(100, 6);
    expect(sim.driveAngle()).toBeCloseTo(90, 6);
    sim.straight(100, true);
    expect(sim.currentPose.yMm).toBeCloseTo(0, 6); // facing −y now
  });

  it('goes further when the real wheels are bigger than the program thinks', () => {
    const big = withDrive({ ...ROBOT, wheelDiameterMm: 62.4 });
    big.straight(200, true);
    expect(big.currentPose.xMm - 100).toBeCloseTo((200 * 62.4) / 56, 6);
    const wide = withDrive({ ...ROBOT, trackMm: 126 });
    wide.turn(90, true);
    expect(wide.currentPose.headingDeg).toBeCloseTo((-90 * 112) / 126, 6);
  });

  it('drives on with drive() until stopped, and waits move time on', () => {
    const sim = withDrive();
    sim.driveForever(100, 0);
    sim.wait(2000);
    sim.stopDrive();
    // Accelerating to 100 mm/s takes 0.14 s at 733 mm/s²: just under 200 mm.
    expect(sim.currentPose.xMm - 100).toBeGreaterThan(185);
    expect(sim.currentPose.xMm - 100).toBeLessThan(200);
    const x = sim.currentPose.xMm;
    sim.wait(1000);
    expect(sim.currentPose.xMm).toBe(x);
  });

  it('runs other motors without moving the robot, and a negative speed turns them back', () => {
    const sim = withDrive();
    sim.addMotor('C', false);
    sim.runAngle('C', 500, 90, true);
    expect(sim.motorAngle('C')).toBeCloseTo(90, 6);
    sim.runAngle('C', -500, 90, true);
    expect(sim.motorAngle('C')).toBeCloseTo(0, 6);
    sim.runTime('C', 360, 1000, true);
    expect(sim.motorAngle('C')).toBeGreaterThan(300);
    expect(sim.currentPose).toEqual({ xMm: 100, yMm: 100, headingDeg: 0 });
  });

  it('a motor command on a wheel stops the drive base, and moves that wheel only', () => {
    const sim = withDrive();
    sim.driveForever(200, 0);
    sim.wait(500);
    sim.runAngle('B', 360, 360, true);
    expect(sim.driveDone()).toBe(true);
    // The right wheel alone: the robot turns left (counter-clockwise).
    expect(sim.currentPose.headingDeg).toBeGreaterThan(80);
    sim.straight(50, true); // the drive base takes its motors back
    expect(sim.driveDistance()).toBeGreaterThan(0);
  });

  it('stops at the time limit', () => {
    const sim = withDrive(ROBOT, 56, 112, 1000);
    sim.straight(1000, true);
    expect(sim.time).toBe(1000);
    expect(sim.over).toBe(true);
  });

  it('records frames for playback', () => {
    const sim = withDrive();
    sim.straight(100, true);
    sim.finish();
    expect(sim.frames[0]).toEqual({ t: 0, pose: { xMm: 100, yMm: 100, headingDeg: 0 } });
    expect(sim.frames.at(-1)!.t).toBe(sim.time);
    expect(sim.frames.length).toBeGreaterThan(30);
  });
});
