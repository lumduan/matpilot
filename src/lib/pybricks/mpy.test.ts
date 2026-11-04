import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { checkMpyHeader, packMultiMpy } from './mpy';

const golden = (name: string) =>
  new Uint8Array(
    readFileSync(fileURLToPath(new URL(`./__golden__/mpy-cross-v6/${name}`, import.meta.url))),
  );

describe('checkMpyHeader', () => {
  it('accepts the bytecode .mpy files pybricksdev produces', () => {
    expect(checkMpyHeader(golden('hello.mpy'))).toEqual({
      ok: true,
      header: { version: 6, subVersion: 0, arch: 0, smallIntBits: 31 },
    });
  });

  it.each([
    ['short data', [0x4d, 6], 'shorter than its header'],
    ['wrong magic', [0x43, 6, 0, 31], 'not a .mpy file'],
    ['version 5', [0x4d, 5, 0, 31], 'needs version 6'],
    ['native code (arch 6)', [0x4d, 6, 6 << 2, 31], 'native code'],
    ['32-bit small ints', [0x4d, 6, 0, 32], '32-bit small ints'],
  ])('rejects %s', (_label, bytes, reason) => {
    const check = checkMpyHeader(new Uint8Array(bytes));
    expect(check.ok).toBe(false);
    expect(check.ok ? '' : check.reason).toContain(reason);
  });

  it('ignores the sub-version for bytecode, as the firmware does', () => {
    expect(checkMpyHeader(new Uint8Array([0x4d, 6, 3, 31])).ok).toBe(true);
  });
});

describe('packMultiMpy', () => {
  it('matches pybricksdev byte for byte (golden)', () => {
    const packed = packMultiMpy([{ name: '__main__', mpy: golden('hello.mpy') }]);
    expect(Array.from(packed)).toEqual(Array.from(golden('hello.multi-mpy.bin')));
  });

  it('lays out several modules in order with little-endian sizes', () => {
    const packed = packMultiMpy([
      { name: '__main__', mpy: new Uint8Array([1, 2, 3]) },
      { name: 'lib', mpy: new Uint8Array(258) },
    ]);
    expect(Array.from(packed.slice(0, 16))).toEqual([
      3,
      0,
      0,
      0,
      ...Array.from(new TextEncoder().encode('__main__')),
      0,
      1,
      2,
      3,
    ]);
    expect(Array.from(packed.slice(16, 24))).toEqual([2, 1, 0, 0, 0x6c, 0x69, 0x62, 0]);
    expect(packed.length).toBe(16 + 8 + 258);
  });

  it('requires __main__ first and valid names', () => {
    expect(() => packMultiMpy([])).toThrow('__main__');
    expect(() => packMultiMpy([{ name: 'main', mpy: new Uint8Array() }])).toThrow('__main__');
    expect(() =>
      packMultiMpy([
        { name: '__main__', mpy: new Uint8Array() },
        { name: 'a\0b', mpy: new Uint8Array() },
      ]),
    ).toThrow('Invalid module name');
  });
});
