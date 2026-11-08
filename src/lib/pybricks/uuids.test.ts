import { describe, expect, it } from 'vitest';
import {
  DEVICE_INFORMATION_SERVICE_UUID,
  DEVICE_NAME_CHAR_UUID,
  FIRMWARE_REVISION_CHAR_UUID,
  PNP_ID_CHAR_UUID,
  PYBRICKS_COMMAND_EVENT_CHAR_UUID,
  PYBRICKS_HUB_CAPABILITIES_CHAR_UUID,
  PYBRICKS_SERVICE_UUID,
  SOFTWARE_REVISION_CHAR_UUID,
} from './uuids';

/**
 * Byte arrays copied verbatim from upstream pybricks-micropython at tag v4.1.3
 * (commit c860b6a00301fb7c6ecd429da11dcb5a6c557c7a), lib/pbio/src/protocol/pybricks.c.
 * Checking the strings against them catches transcription mistakes.
 */
const UPSTREAM_BYTES = {
  pbio_pybricks_service_uuid: [
    0xc5, 0xf5, 0x00, 0x01, 0x82, 0x80, 0x46, 0xda, 0x89, 0xf4, 0x6d, 0x80, 0x51, 0xe4, 0xae, 0xef,
  ],
  pbio_pybricks_command_event_char_uuid: [
    0xc5, 0xf5, 0x00, 0x02, 0x82, 0x80, 0x46, 0xda, 0x89, 0xf4, 0x6d, 0x80, 0x51, 0xe4, 0xae, 0xef,
  ],
  pbio_pybricks_hub_capabilities_char_uuid: [
    0xc5, 0xf5, 0x00, 0x03, 0x82, 0x80, 0x46, 0xda, 0x89, 0xf4, 0x6d, 0x80, 0x51, 0xe4, 0xae, 0xef,
  ],
};

/**
 * The Pybricks service UUID as it appears in the advertising data, least significant byte
 * first (lib/pbio/drv/bluetooth/bluetooth_btstack.c at the same commit).
 */
const UPSTREAM_ADVERTISED_SERVICE_UUID_LE = [
  0xef, 0xae, 0xe4, 0x51, 0x80, 0x6d, 0xf4, 0x89, 0xda, 0x46, 0x80, 0x82, 0x01, 0x00, 0xf5, 0xc5,
];

function uuidFromBytes(bytes: readonly number[]): string {
  const hex = bytes.map((b) => b.toString(16).padStart(2, '0')).join('');
  return [
    hex.slice(0, 8),
    hex.slice(8, 12),
    hex.slice(12, 16),
    hex.slice(16, 20),
    hex.slice(20, 32),
  ].join('-');
}

const CANONICAL_LOWERCASE_UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

describe('Pybricks 128-bit UUIDs', () => {
  it('match the upstream byte arrays', () => {
    expect(PYBRICKS_SERVICE_UUID).toBe(uuidFromBytes(UPSTREAM_BYTES.pbio_pybricks_service_uuid));
    expect(PYBRICKS_COMMAND_EVENT_CHAR_UUID).toBe(
      uuidFromBytes(UPSTREAM_BYTES.pbio_pybricks_command_event_char_uuid),
    );
    expect(PYBRICKS_HUB_CAPABILITIES_CHAR_UUID).toBe(
      uuidFromBytes(UPSTREAM_BYTES.pbio_pybricks_hub_capabilities_char_uuid),
    );
  });

  it('match the service UUID the hub advertises', () => {
    expect(PYBRICKS_SERVICE_UUID).toBe(
      uuidFromBytes([...UPSTREAM_ADVERTISED_SERVICE_UUID_LE].reverse()),
    );
  });

  it('are in the canonical lowercase form Web Bluetooth requires', () => {
    for (const uuid of [
      PYBRICKS_SERVICE_UUID,
      PYBRICKS_COMMAND_EVENT_CHAR_UUID,
      PYBRICKS_HUB_CAPABILITIES_CHAR_UUID,
    ]) {
      expect(uuid).toMatch(CANONICAL_LOWERCASE_UUID);
    }
  });
});

describe('standard 16-bit GATT UUIDs', () => {
  it('match the upstream values', () => {
    expect(DEVICE_INFORMATION_SERVICE_UUID).toBe(0x180a);
    expect(DEVICE_NAME_CHAR_UUID).toBe(0x2a00);
    expect(FIRMWARE_REVISION_CHAR_UUID).toBe(0x2a26);
    expect(SOFTWARE_REVISION_CHAR_UUID).toBe(0x2a28);
    expect(PNP_ID_CHAR_UUID).toBe(0x2a50);
  });
});
