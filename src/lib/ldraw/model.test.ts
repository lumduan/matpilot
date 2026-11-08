import { describe, expect, it } from 'vitest';
import { MAX_MODEL_BYTES, modelFileKind, partKey, readLdraw } from './model';
import { DRIVING_BASE, DRIVING_BASE_MPD } from './test-models';

describe('reading an LDraw model', () => {
  it('places every part of a .ldr', () => {
    const result = readLdraw(DRIVING_BASE, 'base.ldr');
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.model.name).toBe('base.ldr');
    expect(result.model.parts.map((part) => part.name)).toEqual([
      '45601',
      '39367p01',
      '39367p01',
      '54696p01',
      '54696p01',
      '37308',
      '37316',
    ]);
    expect(result.model.parts[1]!.t).toEqual([140, 0, 0]);
    expect(result.model.submodels).toBe(0);
  });

  it('reads submodels in a file named .ldr, as Studio writes them', () => {
    // Studio's help: the extension does not matter; a model with submodels is written as MPD.
    const result = readLdraw(DRIVING_BASE_MPD, 'my robot.ldr');
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.model.name).toBe('base.ldr');
    expect(result.model.submodels).toBe(1);
    expect(result.model.parts.filter((part) => part.name === '39367p01')).toHaveLength(2);
  });

  it('goes through the submodels of a .mpd, placing and colouring their parts', () => {
    const shifted = DRIVING_BASE_MPD.replace('1 4 0 0 0 ', '1 4 10 -20 30 ');
    const result = readLdraw(shifted, 'base.mpd');
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.model.name).toBe('base.ldr');
    expect(result.model.submodels).toBe(1);
    const wheels = result.model.parts.filter((part) => part.name === '39367p01');
    expect(wheels.map((part) => part.t)).toEqual([
      [150, -20, 30],
      [-130, -20, 30],
    ]);
    // Colour 16 takes the colour of what placed it; a colour of its own stays.
    expect(wheels[0]!.colour).toBe(0);
    expect(result.model.parts.find((part) => part.name === '54696p01')!.colour).toBe(4);
    expect(result.model.parts.find((part) => part.name === '45601')!.colour).toBe(16);
  });

  it('turns a placed submodel with its parts', () => {
    // The submodel turned half round about Y: x → −x, z → −z.
    const turned = DRIVING_BASE_MPD.replace(
      '1 4 0 0 0 1 0 0 0 1 0 0 0 1 drive.ldr',
      '1 4 0 0 0 -1 0 0 0 1 0 0 0 -1 drive.ldr',
    );
    const result = readLdraw(turned, 'base.mpd');
    if (!result.ok) throw new Error(result.message);
    const motor = result.model.parts.find((part) => part.name === '54696p01')!;
    expect(motor.t).toEqual([-70, 0, 0]);
    expect(motor.m).toEqual([0, 1, 0, 1, 0, 0, 0, 0, -1]);
  });

  it('keeps the shape of a part the document carries itself', () => {
    const text = [
      '0 FILE robot.ldr',
      '1 16 0 0 0 1 0 0 0 1 0 0 0 1 custom.dat',
      '0 FILE custom.dat',
      '0 A part Studio carries',
      '0 !LDRAW_ORG Unofficial_Part',
      '3 16 -10 0 0 10 0 0 0 -8 4',
      '1 16 0 0 0 2 0 0 0 1 0 0 0 1 s\\inner.dat',
      '0 FILE s\\inner.dat',
      '0 !LDRAW_ORG Unofficial_Subpart',
      '2 24 0 0 0 0 0 -30',
    ].join('\n');
    const result = readLdraw(text, 'robot.mpd');
    if (!result.ok) throw new Error(result.message);
    expect(result.model.parts).toHaveLength(1);
    expect(result.model.parts[0]!.name).toBe('custom');
    expect(result.model.parts[0]!.ownPoints).toEqual([
      -10, 0, 0, 10, 0, 0, 0, -8, 4, 0, 0, 0, 0, 0, -30,
    ]);
  });

  it('refuses what is not a model', () => {
    expect(readLdraw('hello', 'notes.ldr')).toEqual({
      ok: false,
      message: 'MatPilot found no LEGO® parts in this file. Is it an LDraw model (.ldr or .mpd)?',
    });
    expect(readLdraw('x'.repeat(MAX_MODEL_BYTES + 1), 'big.ldr').ok).toBe(false);
    const loop = [
      '0 FILE a.ldr',
      '1 16 0 0 0 1 0 0 0 1 0 0 0 1 b.ldr',
      '0 FILE b.ldr',
      '1 16 0 0 0 1 0 0 0 1 0 0 0 1 a.ldr',
    ].join('\n');
    expect(readLdraw(loop, 'loop.mpd')).toEqual({
      ok: false,
      message: 'This model’s submodels place each other in a loop, so it cannot be read.',
    });
    const many = Array.from({ length: 5001 }, () => '1 16 0 0 0 1 0 0 0 1 0 0 0 1 3001.dat').join(
      '\n',
    );
    expect(readLdraw(many, 'many.ldr').ok).toBe(false);
  });

  it('names parts as the library does and tells Studio files apart', () => {
    expect(partKey(' S\\39367S01.DAT ')).toBe('s/39367s01');
    expect(modelFileKind('robot.io', 'PK\u0003\u0004')).toBe('studio');
    expect(modelFileKind('robot.ldr', '0 FILE')).toBe('ldraw');
    expect(modelFileKind('robot.MPD', '0 FILE')).toBe('ldraw');
    expect(modelFileKind('robot.zip', 'PK')).toBe('studio');
    expect(modelFileKind('robot.txt', 'hello')).toBe('other');
  });
});
