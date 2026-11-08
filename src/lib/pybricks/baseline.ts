import { compareFirmwareVersions, parseFirmwareVersion, type FirmwareVersion } from './revision';

/**
 * The Pybricks firmware version MatPilot is tested against. This is a tested baseline, not a
 * hard requirement: other versions are allowed and are reported as "not yet verified".
 *
 * Moved from v4.0.1 to v4.1.3 on 2026-11-08 by the maintainer's decision (ADR 0018): v4.1.x has
 * the USB link and is what Pybricks' installer gives. The hardware checks recorded before that
 * date ran on v4.0.1 (docs/compatibility.md).
 */
export const TESTED_FIRMWARE_VERSION = '4.1.3';

/**
 * The protocol version (Software Revision String) that firmware v4.1.3 reports, from
 * `PBIO_PROTOCOL_VERSION_MAJOR/MINOR/PATCH` at tag v4.1.3:
 * https://github.com/pybricks/pybricks-micropython/blob/c860b6a00301fb7c6ecd429da11dcb5a6c557c7a/lib/pbio/include/pbio/protocol.h#L23-L30
 */
export const TESTED_PROTOCOL_VERSION = '1.7.0';

export type BaselineComparison = 'baseline' | 'newer' | 'older' | 'unknown';

export interface BaselineAssessment {
  readonly comparison: BaselineComparison;
  readonly message: string;
}

const BASELINE = parseFirmwareVersion(TESTED_FIRMWARE_VERSION) as FirmwareVersion;

/** Describes how a hub's firmware version relates to the tested baseline. Informational only. */
export function assessFirmwareBaseline(version: FirmwareVersion | null): BaselineAssessment {
  if (version === null) {
    return {
      comparison: 'unknown',
      message: `The firmware version could not be parsed. MatPilot is tested with Pybricks v${TESTED_FIRMWARE_VERSION}.`,
    };
  }
  const order = compareFirmwareVersions(version, BASELINE);
  if (order === 0) {
    return {
      comparison: 'baseline',
      message: `This is the firmware version MatPilot is tested with (v${TESTED_FIRMWARE_VERSION}).`,
    };
  }
  return {
    comparison: order > 0 ? 'newer' : 'older',
    message: `${order > 0 ? 'Newer' : 'Older'} than the tested baseline (v${TESTED_FIRMWARE_VERSION}). Not yet verified with MatPilot.`,
  };
}
