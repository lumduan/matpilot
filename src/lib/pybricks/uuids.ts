/**
 * Bluetooth UUIDs used by the Pybricks BLE protocol.
 *
 * Every value in this file was verified by reading the upstream firmware source. None of it
 * comes from memory or third-party tutorials. Do not add a UUID here without doing the same.
 *
 * Upstream repository: https://github.com/pybricks/pybricks-micropython (MIT License)
 * Verified at tag v4.1.3, the firmware version MatPilot is tested against:
 *   commit c860b6a00301fb7c6ecd429da11dcb5a6c557c7a
 *
 * 128-bit Pybricks UUIDs (byte arrays plus their string form in doc comments):
 *   https://github.com/pybricks/pybricks-micropython/blob/c860b6a00301fb7c6ecd429da11dcb5a6c557c7a/lib/pbio/src/protocol/pybricks.c#L83-L117
 * 16-bit standard GATT UUIDs that the Pybricks protocol uses:
 *   https://github.com/pybricks/pybricks-micropython/blob/c860b6a00301fb7c6ecd429da11dcb5a6c557c7a/lib/pbio/include/pbio/protocol.h#L542-L559
 * Declarations:
 *   https://github.com/pybricks/pybricks-micropython/blob/c860b6a00301fb7c6ecd429da11dcb5a6c557c7a/lib/pbio/include/pbio/protocol.h#L537-L540
 *
 * Re-checked unchanged on 2026-11-04 at master commit 511f6c20fb70d9d8951a85a50c383064747d5bc0
 * (tag v4.1.2). There the 16-bit values moved into an enum in protocol.h:
 *   https://github.com/pybricks/pybricks-micropython/blob/511f6c20fb70d9d8951a85a50c383064747d5bc0/lib/pbio/include/pbio/protocol.h#L542-L559
 *   https://github.com/pybricks/pybricks-micropython/blob/511f6c20fb70d9d8951a85a50c383064747d5bc0/lib/pbio/src/protocol/pybricks.c#L83-L117
 *
 * Web Bluetooth requires 128-bit UUID strings in lowercase. 16-bit SIG-assigned UUIDs are
 * passed as numbers, which Web Bluetooth expands with the Bluetooth Base UUID.
 *
 * See NOTICE for attribution.
 */

// ---------------------------------------------------------------------------------------------
// Pybricks service and characteristics (128-bit, Pybricks-assigned)
// ---------------------------------------------------------------------------------------------

/**
 * Pybricks Service. Upstream: `pbio_pybricks_service_uuid`, "@since Protocol v1.0.0".
 *
 * The hub advertises this UUID, so MatPilot uses it as the device picker filter. Upstream
 * advertising data (v4.1.3, SPIKE Prime uses the BTstack driver):
 * https://github.com/pybricks/pybricks-micropython/blob/c860b6a00301fb7c6ecd429da11dcb5a6c557c7a/lib/pbio/drv/bluetooth/bluetooth_btstack.c#L677-L685
 */
export const PYBRICKS_SERVICE_UUID = 'c5f50001-8280-46da-89f4-6d8051e4aeef';

/**
 * Pybricks Command/Event characteristic. Upstream: `pbio_pybricks_command_event_char_uuid`,
 * "@since Protocol v1.0.0". Not used yet: the hub probe is read-only and never writes to it
 * or subscribes to it.
 */
export const PYBRICKS_COMMAND_EVENT_CHAR_UUID = 'c5f50002-8280-46da-89f4-6d8051e4aeef';

/**
 * Pybricks Hub Capabilities characteristic. Upstream: `pbio_pybricks_hub_capabilities_char_uuid`,
 * "@since Protocol v1.2.0". Not used yet.
 */
export const PYBRICKS_HUB_CAPABILITIES_CHAR_UUID = 'c5f50003-8280-46da-89f4-6d8051e4aeef';

// ---------------------------------------------------------------------------------------------
// Standard GATT UUIDs (16-bit, Bluetooth SIG-assigned) used by the Pybricks protocol
// ---------------------------------------------------------------------------------------------

/** Device Information Service. Upstream: `pbio_gatt_device_info_service_uuid`. */
export const DEVICE_INFORMATION_SERVICE_UUID = 0x180a;

/**
 * Device Name characteristic (Generic Access service). Upstream: `pbio_gatt_device_name_char_uuid`.
 * Not read by the hub probe: it lives in the Generic Access service, which is not in the
 * probe's `optionalServices`. The probe reports `BluetoothDevice.name` instead.
 */
export const DEVICE_NAME_CHAR_UUID = 0x2a00;

/**
 * Firmware Revision String characteristic. Upstream: `pbio_gatt_firmware_version_char_uuid`.
 * Value is `PBIO_VERSION_STR`, for example "4.1.3" (see src/lib/pybricks/revision.ts).
 */
export const FIRMWARE_REVISION_CHAR_UUID = 0x2a26;

/**
 * Software Revision String characteristic. Upstream: `pbio_gatt_software_version_char_uuid`,
 * documented upstream as "(Pybricks protocol version)". Value is `PBIO_PROTOCOL_VERSION_STR`.
 */
export const SOFTWARE_REVISION_CHAR_UUID = 0x2a28;

/** PnP ID characteristic. Upstream: `pbio_gatt_pnp_id_char_uuid`. Not used yet. */
export const PNP_ID_CHAR_UUID = 0x2a50;
