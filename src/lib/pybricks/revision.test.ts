import { describe, expect, it } from 'vitest';
import {
  assessFirmwareBaseline,
  TESTED_FIRMWARE_VERSION,
  TESTED_PROTOCOL_VERSION,
} from './baseline';
import {
  compareFirmwareVersions,
  decodeRevisionString,
  formatFirmwareVersion,
  parseFirmwareVersion,
  parseProtocolVersion,
  type FirmwareVersion,
} from './revision';

function dataViewOf(text: string): DataView {
  const bytes = new TextEncoder().encode(text);
  return new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
}

function firmware(text: string): FirmwareVersion {
  const parsed = parseFirmwareVersion(text);
  if (parsed === null) throw new Error(`test fixture does not parse: ${text}`);
  return parsed;
}

describe('decodeRevisionString', () => {
  it('decodes a GATT string value from a DataView', () => {
    expect(decodeRevisionString(dataViewOf('4.0.1'))).toBe('4.0.1');
  });

  it('respects the byte offset and length of a view into a larger buffer', () => {
    const buffer = new TextEncoder().encode('xx1.5.0yy').buffer;
    expect(decodeRevisionString(new DataView(buffer, 2, 5))).toBe('1.5.0');
  });

  it('accepts an ArrayBuffer and a Uint8Array', () => {
    expect(decodeRevisionString(new TextEncoder().encode('1.5.0').buffer)).toBe('1.5.0');
    expect(decodeRevisionString(new TextEncoder().encode('1.5.0'))).toBe('1.5.0');
  });

  it('strips trailing NUL bytes and whitespace', () => {
    expect(decodeRevisionString(dataViewOf('4.0.1\0\0'))).toBe('4.0.1');
    expect(decodeRevisionString(dataViewOf(' 4.0.1 \n'))).toBe('4.0.1');
  });

  it('returns an empty string for an empty value', () => {
    expect(decodeRevisionString(new DataView(new ArrayBuffer(0)))).toBe('');
  });
});

describe('parseFirmwareVersion', () => {
  it('parses a final release', () => {
    expect(parseFirmwareVersion('4.0.1')).toEqual({
      major: 4,
      minor: 0,
      patch: 1,
      prerelease: null,
    });
  });

  it('parses the upstream pre-release suffixes a, b and c', () => {
    expect(parseFirmwareVersion('4.1.0a1')?.prerelease).toEqual({ level: 'alpha', serial: 1 });
    expect(parseFirmwareVersion('4.1.0b7')?.prerelease).toEqual({ level: 'beta', serial: 7 });
    expect(parseFirmwareVersion('3.6.0c2')?.prerelease).toEqual({ level: 'candidate', serial: 2 });
    expect(parseFirmwareVersion('4.0.0b11')?.prerelease).toEqual({ level: 'beta', serial: 11 });
  });

  it('rejects strings that are not in the upstream format', () => {
    for (const text of ['', 'v4.0.1', '4.0', '4.0.1.2', '4.0.1rc1', '4.0.1b', 'abc']) {
      expect(parseFirmwareVersion(text)).toBeNull();
    }
  });

  it('round-trips through formatFirmwareVersion', () => {
    for (const text of ['4.0.1', '4.1.0a1', '4.1.0b7', '3.6.0c2']) {
      expect(formatFirmwareVersion(firmware(text))).toBe(text);
    }
  });
});

describe('parseProtocolVersion', () => {
  it('parses X.Y.Z', () => {
    expect(parseProtocolVersion('1.5.0')).toEqual({ major: 1, minor: 5, patch: 0 });
  });

  it('rejects other formats', () => {
    for (const text of ['', '1.5', 'v1.5.0', '1.5.0b1']) {
      expect(parseProtocolVersion(text)).toBeNull();
    }
  });
});

describe('compareFirmwareVersions', () => {
  it('orders pre-releases before their final release, like upstream PBIO_HEXVERSION', () => {
    const ordered = [
      '3.6.1',
      '4.0.0a1',
      '4.0.0b2',
      '4.0.0b11',
      '4.0.0c1',
      '4.0.0',
      '4.0.1',
      '4.1.0b1',
      '4.1.0',
      '4.1.2',
    ];
    for (let i = 0; i < ordered.length - 1; i++) {
      const older = firmware(ordered[i] as string);
      const newer = firmware(ordered[i + 1] as string);
      expect(compareFirmwareVersions(older, newer)).toBeLessThan(0);
      expect(compareFirmwareVersions(newer, older)).toBeGreaterThan(0);
    }
  });

  it('returns zero for equal versions', () => {
    expect(compareFirmwareVersions(firmware('4.0.1'), firmware('4.0.1'))).toBe(0);
  });
});

describe('tested baseline', () => {
  it('is Pybricks v4.1.3 with protocol 1.7.0', () => {
    expect(TESTED_FIRMWARE_VERSION).toBe('4.1.3');
    expect(TESTED_PROTOCOL_VERSION).toBe('1.7.0');
  });

  it('classifies firmware relative to the baseline', () => {
    expect(assessFirmwareBaseline(firmware('4.1.3')).comparison).toBe('baseline');
    expect(assessFirmwareBaseline(firmware('4.2.0')).comparison).toBe('newer');
    expect(assessFirmwareBaseline(firmware('4.1.3b1')).comparison).toBe('older');
    expect(assessFirmwareBaseline(firmware('4.0.1')).comparison).toBe('older');
    expect(assessFirmwareBaseline(null).comparison).toBe('unknown');
  });

  it('flags non-baseline firmware as not yet verified', () => {
    expect(assessFirmwareBaseline(firmware('4.0.1')).message).toMatch(/not yet verified/i);
  });
});
