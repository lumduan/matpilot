import { describe, expect, it } from 'vitest';
import { driveFromHandle, turnOnDial } from './path-handles';

describe('the Path tab’s handles', () => {
  it('turn with the dial: left is negative in Pybricks, in steps, past 180° and round again', () => {
    // Facing right (0°); the pointer up (90°) is a quarter turn left.
    expect(turnOnDial(90, 0, 0)).toEqual({ turn: 90, degrees: -90 });
    expect(turnOnDial(-44, 0, 0)).toEqual({ turn: -44, degrees: 45 });
    // Followed round: just past straight behind, from a turn of 170° left, is 190° left.
    expect(turnOnDial(-170, 0, 170).degrees).toBe(-190);
    // Never more than a full turn, and never nothing.
    expect(turnOnDial(-1, 0, 358).degrees).toBe(-360);
    expect(turnOnDial(2, 0, 0).degrees).toBeNull();
    expect(turnOnDial(93, 90, 0, 1).degrees).toBe(-3);
  });

  it('stretch a drive with its handle, keeping its way', () => {
    // The handle sits 150 mm past the end; dragged to 400 mm along: a 250 mm drive.
    expect(driveFromHandle(400, 150, false)).toBe(250);
    expect(driveFromHandle(404, 150, false, 1)).toBe(254);
    // Dragged back past the start: still forward, the smallest step.
    expect(driveFromHandle(-300, 150, false)).toBe(10);
    // Backward: the handle is behind the robot.
    expect(driveFromHandle(-400, -150, true)).toBe(-250);
    expect(driveFromHandle(300, -150, true)).toBe(-10);
  });
});
