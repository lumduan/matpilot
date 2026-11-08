/**
 * Decoding and parsing of the revision strings a Pybricks hub exposes in the standard
 * Device Information Service.
 *
 * Upstream behaviour this module relies on (pybricks-micropython, tag v4.1.3,
 * commit c860b6a00301fb7c6ecd429da11dcb5a6c557c7a):
 *
 * - The BTstack driver used by SPIKE Prime sets Firmware Revision String to `PBIO_VERSION_STR`
 *   and Software Revision String to `PBIO_PROTOCOL_VERSION_STR`:
 *   https://github.com/pybricks/pybricks-micropython/blob/c860b6a00301fb7c6ecd429da11dcb5a6c557c7a/lib/pbio/drv/bluetooth/bluetooth_btstack.c#L3269-L3270
 * - `PBIO_VERSION_STR` is "X.Y.Z" with an optional pre-release suffix "aN", "bN" or "cN"
 *   (alpha, beta, release candidate); a final release has no suffix:
 *   https://github.com/pybricks/pybricks-micropython/blob/c860b6a00301fb7c6ecd429da11dcb5a6c557c7a/lib/pbio/include/pbio/version.h#L62-L82
 * - `PBIO_PROTOCOL_VERSION_STR` is "X.Y.Z":
 *   https://github.com/pybricks/pybricks-micropython/blob/c860b6a00301fb7c6ecd429da11dcb5a6c557c7a/lib/pbio/include/pbio/protocol.h#L23-L40
 */

export type PrereleaseLevel = 'alpha' | 'beta' | 'candidate';

export interface FirmwareVersion {
  readonly major: number;
  readonly minor: number;
  readonly patch: number;
  /** `null` for a final release. */
  readonly prerelease: { readonly level: PrereleaseLevel; readonly serial: number } | null;
}

export interface ProtocolVersion {
  readonly major: number;
  readonly minor: number;
  readonly patch: number;
}

const PRERELEASE_LEVELS: Readonly<Record<string, PrereleaseLevel>> = {
  a: 'alpha',
  b: 'beta',
  c: 'candidate',
};

const PRERELEASE_SUFFIX: Readonly<Record<PrereleaseLevel, string>> = {
  alpha: 'a',
  beta: 'b',
  candidate: 'c',
};

const FIRMWARE_VERSION_PATTERN = /^(\d+)\.(\d+)\.(\d+)(?:([abc])(\d+))?$/;
const PROTOCOL_VERSION_PATTERN = /^(\d+)\.(\d+)\.(\d+)$/;

const utf8 = new TextDecoder('utf-8');

/**
 * Decodes a GATT string characteristic value (UTF-8 per the Bluetooth Core Specification).
 *
 * Upstream sends the string without a terminating NUL, but trailing NULs and surrounding
 * whitespace are stripped defensively so that a padded value still parses.
 */
export function decodeRevisionString(value: DataView | ArrayBufferView | ArrayBuffer): string {
  const bytes =
    value instanceof ArrayBuffer
      ? new Uint8Array(value)
      : new Uint8Array(value.buffer, value.byteOffset, value.byteLength);
  return utf8.decode(bytes).replace(/\0+$/u, '').trim();
}

/** Parses a Firmware Revision String such as "4.0.1" or "4.1.0b7". Returns `null` if malformed. */
export function parseFirmwareVersion(text: string): FirmwareVersion | null {
  const match = FIRMWARE_VERSION_PATTERN.exec(text.trim());
  if (!match) return null;
  const [, major, minor, patch, level, serial] = match;
  const prereleaseLevel = level === undefined ? undefined : PRERELEASE_LEVELS[level];
  return {
    major: Number(major),
    minor: Number(minor),
    patch: Number(patch),
    prerelease:
      prereleaseLevel === undefined ? null : { level: prereleaseLevel, serial: Number(serial) },
  };
}

/** Parses a Software Revision String (Pybricks protocol version) such as "1.5.0". */
export function parseProtocolVersion(text: string): ProtocolVersion | null {
  const match = PROTOCOL_VERSION_PATTERN.exec(text.trim());
  if (!match) return null;
  const [, major, minor, patch] = match;
  return { major: Number(major), minor: Number(minor), patch: Number(patch) };
}

/** Formats a firmware version back into the upstream "X.Y.Z[aN|bN|cN]" form. */
export function formatFirmwareVersion(version: FirmwareVersion): string {
  const base = `${version.major}.${version.minor}.${version.patch}`;
  if (version.prerelease === null) return base;
  return `${base}${PRERELEASE_SUFFIX[version.prerelease.level]}${version.prerelease.serial}`;
}

const LEVEL_RANK: Readonly<Record<PrereleaseLevel | 'final', number>> = {
  alpha: 0,
  beta: 1,
  candidate: 2,
  final: 3,
};

/**
 * Orders two firmware versions. Returns a negative number if `a` is older, zero if equal,
 * and a positive number if `a` is newer. A pre-release sorts before its final release,
 * matching upstream's `PBIO_HEXVERSION` ordering (alpha 0xA < beta 0xB < candidate 0xC < final 0xF).
 */
export function compareFirmwareVersions(a: FirmwareVersion, b: FirmwareVersion): number {
  return (
    a.major - b.major ||
    a.minor - b.minor ||
    a.patch - b.patch ||
    LEVEL_RANK[a.prerelease?.level ?? 'final'] - LEVEL_RANK[b.prerelease?.level ?? 'final'] ||
    (a.prerelease?.serial ?? 0) - (b.prerelease?.serial ?? 0)
  );
}
