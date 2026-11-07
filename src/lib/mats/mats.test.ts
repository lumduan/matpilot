import { describe, expect, it } from 'vitest';
import { newRobot } from '../robots/profile';
import {
  matData,
  matNameFromFileName,
  parseMatFile,
  readMat,
  serializeMatFile,
  type Mat,
} from './mat';
import { MM_PER_PT, pageSize, pixelsPerMm, trimBoxesInBytes } from './pdf-box';
import {
  normalHeading,
  poseInArea,
  robotInside,
  robotOnMat,
  areaPolygon,
  matPolygon,
} from './pose';

const MAT: Mat = {
  id: 'm-1',
  name: 'WRO 2026 Elementary',
  widthMm: 2362,
  heightMm: 1143,
  source: { kind: 'pdf', fileName: 'mat.pdf', page: 1, pageCount: 1, sizeFrom: 'trim' },
  rulesId: 'wro-2026-robomission-elementary',
  areas: [
    {
      id: 'a-1',
      name: 'Start',
      kind: 'start',
      xMm: 10,
      yMm: 10,
      widthMm: 250.02,
      heightMm: 250.02,
    },
  ],
  placement: { robotId: 'r-1', xMm: 135, yMm: 135, headingDeg: 0 },
};

describe('a mat PDF’s size', () => {
  it('converts points to millimetres like wro-2026 measured the WRO 2026 mat', () => {
    const size = pageSize([0, 0, 6695.43, 3240], 0, [0, 0, 6695.43, 3240]);
    expect(size.widthMm).toBeCloseTo(2361.999, 3);
    expect(size.heightMm).toBeCloseTo(1143.0, 3);
    expect(size).toMatchObject({ sizeFrom: 'trim', crop: null });
    expect(MM_PER_PT * 72).toBeCloseTo(25.4, 12);
  });

  it('keeps the trim box when the page has a bleed around it', () => {
    const bleed = 3 / MM_PER_PT;
    const size = pageSize([0, 0, 6695.43 + 2 * bleed, 3240 + 2 * bleed], 0, [
      bleed,
      bleed,
      6695.43 + bleed,
      3240 + bleed,
    ]);
    expect(size.widthMm).toBeCloseTo(2361.999, 3);
    expect(size.crop!.x).toBeCloseTo(bleed, 6);
    expect(size.crop!.y).toBeCloseTo(bleed, 6);
    expect(size.crop!.width).toBeCloseTo(6695.43, 6);
  });

  it('uses the page when there is no trim box, or the page is turned', () => {
    expect(pageSize([0, 0, 595.28, 841.89], 0, null)).toMatchObject({
      sizeFrom: 'page',
      crop: null,
    });
    const turned = pageSize([0, 0, 595.28, 841.89], 90, [0, 0, 595.28, 841.89]);
    expect(turned.sizeFrom).toBe('page');
    expect(turned.widthMm).toBeCloseTo(297, 0);
    expect(turned.heightMm).toBeCloseTo(210, 0);
  });

  it('finds a trim box written as plain text in the file', () => {
    const bytes = new TextEncoder().encode(
      '%PDF-1.3\n1 0 obj << /Type /Page /TrimBox [ 8.5 8.5 6703.93 3248.5 ] >>',
    );
    expect(trimBoxesInBytes(bytes)).toEqual([[8.5, 8.5, 6703.93, 3248.5]]);
    expect(trimBoxesInBytes(new TextEncoder().encode('%PDF-1.7 no boxes'))).toEqual([]);
  });

  it('chooses a picture resolution a phone can hold', () => {
    expect(pixelsPerMm(2362, 1143)).toBe(2);
    expect(pixelsPerMm(5000, 5000)).toBeCloseTo(Math.sqrt(16_000_000 / 25_000_000), 9);
  });
});

describe('a mat', () => {
  it('round-trips through its file, with the source it was drawn from', () => {
    const text = serializeMatFile(MAT, 'JVBERi0=', 'application/pdf');
    expect(parseMatFile(text)).toEqual({
      ok: true,
      mat: MAT,
      mediaType: 'application/pdf',
      base64: 'JVBERi0=',
    });
    expect(readMat(matData(MAT))).toEqual(MAT);
  });

  it('refuses files it cannot use', () => {
    expect(parseMatFile('x')).toMatchObject({ ok: false, message: /not JSON/ });
    expect(parseMatFile('{"format":"matpilot-mat","version":9}')).toMatchObject({
      message: /newer/,
    });
    expect(parseMatFile('{"format":"matpilot-mat","version":1,"mat":{}}')).toMatchObject({
      message: /damaged/,
    });
    expect(readMat({ ...matData(MAT), widthMm: 20 })).toBeNull();
  });

  it('names a mat from its file', () => {
    expect(matNameFromFileName('C:\\mats\\WRO-2026-GameMat.pdf')).toBe('WRO-2026-GameMat');
  });
});

describe('a robot on a mat', () => {
  const robot = newRobot(); // 160 × 200 mm, axle 70 mm from the back
  it('turns counter-clockwise from +x', () => {
    const front = robotOnMat(robot, { robotId: null, xMm: 0, yMm: 0, headingDeg: 90 }).front;
    expect(front.x).toBeCloseTo(0, 9);
    expect(front.y).toBeCloseTo(130, 9);
  });

  it('is centred in an area by its outline, and fits a 250.02 mm start area facing +x', () => {
    const area = MAT.areas[0]!;
    const pose = poseInArea(robot, area, 0);
    expect(pose.xMm).toBeCloseTo(10 + 125.01 - 30, 9); // outline from −70 to 130: middle 30 ahead
    expect(robotInside(robot, pose, areaPolygon(area))).toBe(true);
    // Turned 45°, 160 × 200 mm does not fit 250 mm.
    expect(robotInside(robot, poseInArea(robot, area, 45), areaPolygon(area))).toBe(false);
    expect(robotInside(robot, { ...pose, xMm: 5 }, matPolygon(MAT))).toBe(false);
  });

  it('keeps headings between −180° and 180°', () => {
    expect(normalHeading(270)).toBe(-90);
    expect(normalHeading(-190)).toBe(170);
    expect(normalHeading(180)).toBe(-180);
    expect(normalHeading(0)).toBe(0);
  });
});
