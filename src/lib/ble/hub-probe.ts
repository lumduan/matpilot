/**
 * Read-only Pybricks hub probe over Web Bluetooth.
 *
 * Framework-agnostic: no React or Next.js here. UI code subscribes to state changes and calls
 * `connect()` / `disconnect()`.
 *
 * READ-ONLY BY CONSTRUCTION: the GATT interfaces below declare only discovery and
 * `readValue()`. There is no write method and no `startNotifications()` (which would write the
 * Client Characteristic Configuration descriptor), so code that writes to the hub does not
 * type-check against them.
 */

import {
  decodeRevisionString,
  parseFirmwareVersion,
  parseProtocolVersion,
  type FirmwareVersion,
  type ProtocolVersion,
} from '../pybricks/revision';
import {
  DEVICE_INFORMATION_SERVICE_UUID,
  FIRMWARE_REVISION_CHAR_UUID,
  PYBRICKS_SERVICE_UUID,
  SOFTWARE_REVISION_CHAR_UUID,
} from '../pybricks/uuids';
import {
  apiUnavailableError,
  classifyRequestDeviceError,
  describeGattError,
  type GattStage,
  type ProbeError,
} from './errors';

// ---------------------------------------------------------------------------------------------
// Minimal, read-only views of the Web Bluetooth objects the probe uses
// ---------------------------------------------------------------------------------------------

export interface GattCharacteristicLike {
  readValue(): Promise<DataView>;
}

export interface GattServiceLike {
  getCharacteristic(characteristic: BluetoothCharacteristicUUID): Promise<GattCharacteristicLike>;
}

export interface GattServerLike {
  readonly connected: boolean;
  connect(): Promise<GattServerLike>;
  disconnect(): void;
  getPrimaryService(service: BluetoothServiceUUID): Promise<GattServiceLike>;
}

export interface BluetoothDeviceLike {
  readonly name?: string | undefined;
  readonly gatt?: GattServerLike | undefined;
  addEventListener(type: 'gattserverdisconnected', listener: () => void): void;
  removeEventListener(type: 'gattserverdisconnected', listener: () => void): void;
}

export interface BluetoothLike {
  requestDevice(options: RequestDeviceOptions): Promise<BluetoothDeviceLike>;
}

// ---------------------------------------------------------------------------------------------
// State
// ---------------------------------------------------------------------------------------------

export interface HubInfo {
  /**
   * `BluetoothDevice.name`: the name the hub advertises, or `null` if none was reported.
   *
   * Pybricks v4.1.3 keeps the name in a 16-byte buffer that is read as a C string, so the hub
   * reports at most 15 bytes (a longer name chosen when flashing does not fit). SPIKE Prime uses
   * the BTstack driver
   * (https://github.com/pybricks/pybricks-micropython/blob/c860b6a00301fb7c6ecd429da11dcb5a6c557c7a/lib/pbio/platform/prime_hub_f4/pbdrvconfig.h#L40),
   * which declares the buffer
   * (https://github.com/pybricks/pybricks-micropython/blob/c860b6a00301fb7c6ecd429da11dcb5a6c557c7a/lib/pbio/sys/host.c#L31-L36)
   * and advertises it with `strlen()` in the scan response
   * (https://github.com/pybricks/pybricks-micropython/blob/c860b6a00301fb7c6ecd429da11dcb5a6c557c7a/lib/pbio/drv/bluetooth/bluetooth_btstack.c#L701-L707).
   * Verified on hardware 2026-11-04 (SPIKE Prime, Pybricks 4.0.1, Chrome 156, macOS 27.0.1): a
   * hub reported the 15-character name "Fast Pybrick Hu".
   */
  readonly name: string | null;
  /** Firmware Revision String (0x2A26) exactly as read, e.g. "4.1.3". */
  readonly firmwareRevision: string;
  readonly firmwareVersion: FirmwareVersion | null;
  /** Software Revision String (0x2A28): the Pybricks protocol version, e.g. "1.5.0". */
  readonly protocolRevision: string;
  readonly protocolVersion: ProtocolVersion | null;
}

export type DisconnectReason =
  /** The user clicked Disconnect. */
  | 'user'
  /** The link dropped after the hub information was read (hub off, out of range, ...). */
  | 'connection-lost'
  /** The link dropped while connecting or reading the hub information. */
  | 'connection-lost-during-setup';

export type HubProbeState =
  | { readonly status: 'idle' }
  /** The browser's device picker is open. */
  | { readonly status: 'requesting' }
  /** The user closed the device picker without choosing a hub. Not an error. */
  | { readonly status: 'no-device-selected' }
  | { readonly status: 'connecting'; readonly deviceName: string | null }
  | { readonly status: 'connected'; readonly hub: HubInfo }
  | {
      readonly status: 'disconnected';
      readonly deviceName: string | null;
      readonly reason: DisconnectReason;
    }
  | { readonly status: 'error'; readonly error: ProbeError; readonly deviceName: string | null };

export const INITIAL_HUB_PROBE_STATE: HubProbeState = Object.freeze({ status: 'idle' });

/**
 * Device picker options: list only devices advertising the Pybricks service, and request
 * access to the standard Device Information service for the revision strings.
 */
export function createHubRequestOptions(): RequestDeviceOptions {
  return {
    filters: [{ services: [PYBRICKS_SERVICE_UUID] }],
    optionalServices: [DEVICE_INFORMATION_SERVICE_UUID],
  };
}

type StateListener = (state: HubProbeState) => void;

function defaultBluetooth(): BluetoothLike | undefined {
  if (typeof navigator === 'undefined') return undefined;
  return (navigator as Navigator & { bluetooth?: Bluetooth }).bluetooth;
}

function normalizeName(name: string | undefined): string | null {
  const trimmed = name?.trim();
  return trimmed ? trimmed : null;
}

async function readRevisionString(
  service: GattServiceLike,
  characteristic: BluetoothCharacteristicUUID,
): Promise<string> {
  const handle = await service.getCharacteristic(characteristic);
  return decodeRevisionString(await handle.readValue());
}

export class HubProbe {
  #state: HubProbeState = INITIAL_HUB_PROBE_STATE;
  readonly #listeners = new Set<StateListener>();
  readonly #getBluetooth: () => BluetoothLike | undefined;
  #device: BluetoothDeviceLike | null = null;
  /** Incremented to abandon in-flight async work (disconnect, dispose, link loss). */
  #attempt = 0;

  /**
   * @param bluetooth The Web Bluetooth entry point, or a function returning it. Defaults to
   *   `navigator.bluetooth`, looked up lazily on each `connect()`.
   */
  constructor(bluetooth?: BluetoothLike | (() => BluetoothLike | undefined)) {
    if (typeof bluetooth === 'function') this.#getBluetooth = bluetooth;
    else if (bluetooth) this.#getBluetooth = () => bluetooth;
    else this.#getBluetooth = defaultBluetooth;
  }

  /** Current state. Stable reference until the next change (safe for `useSyncExternalStore`). */
  readonly getState = (): HubProbeState => this.#state;

  /** Registers a listener for state changes. Returns an unsubscribe function. */
  readonly subscribe = (listener: StateListener): (() => void) => {
    this.#listeners.add(listener);
    return () => {
      this.#listeners.delete(listener);
    };
  };

  /**
   * Opens the browser's device picker, connects to the chosen hub, and reads its Device
   * Information. Call it directly from a click handler: browsers only show the picker in
   * response to a user gesture. Never rejects; every outcome is reported as state.
   */
  async connect(): Promise<void> {
    const { status } = this.#state;
    if (status === 'requesting' || status === 'connecting' || status === 'connected') return;

    const bluetooth = this.#getBluetooth();
    if (!bluetooth) {
      this.#setState({ status: 'error', error: apiUnavailableError(), deviceName: null });
      return;
    }

    const attempt = ++this.#attempt;
    this.#setState({ status: 'requesting' });

    let device: BluetoothDeviceLike;
    try {
      // requestDevice() must be the first awaited call so it runs inside the user gesture.
      device = await bluetooth.requestDevice(createHubRequestOptions());
    } catch (error) {
      if (attempt !== this.#attempt) return;
      const outcome = classifyRequestDeviceError(error);
      this.#setState(
        outcome.kind === 'cancelled'
          ? { status: 'no-device-selected' }
          : { status: 'error', error: outcome.error, deviceName: null },
      );
      return;
    }
    if (attempt !== this.#attempt) return;

    const deviceName = normalizeName(device.name);
    this.#device = device;
    device.addEventListener('gattserverdisconnected', this.#handleDisconnected);
    this.#setState({ status: 'connecting', deviceName });

    let stage: GattStage = 'connect';
    try {
      if (!device.gatt) throw new Error('The selected device has no GATT server.');
      const server = await device.gatt.connect();
      if (attempt !== this.#attempt) return;

      stage = 'read-firmware-revision';
      const info = await server.getPrimaryService(DEVICE_INFORMATION_SERVICE_UUID);
      // GATT operations are run one at a time: Web Bluetooth implementations may reject
      // operations issued in parallel.
      const firmwareRevision = await readRevisionString(info, FIRMWARE_REVISION_CHAR_UUID);
      if (attempt !== this.#attempt) return;

      stage = 'read-software-revision';
      const protocolRevision = await readRevisionString(info, SOFTWARE_REVISION_CHAR_UUID);
      if (attempt !== this.#attempt) return;

      this.#setState({
        status: 'connected',
        hub: {
          name: deviceName,
          firmwareRevision,
          firmwareVersion: parseFirmwareVersion(firmwareRevision),
          protocolRevision,
          protocolVersion: parseProtocolVersion(protocolRevision),
        },
      });
    } catch (error) {
      if (attempt !== this.#attempt) return;
      this.#release(device);
      this.#setState({ status: 'error', error: describeGattError(error, stage), deviceName });
    }
  }

  /** Disconnects from the hub, or abandons a connection in progress. Safe in any state. */
  disconnect(): void {
    const device = this.#device;
    if (!device) return;
    this.#attempt++;
    this.#release(device);
    this.#setState({
      status: 'disconnected',
      deviceName: normalizeName(device.name),
      reason: 'user',
    });
  }

  /** Releases the hub and returns to the initial state. The probe stays usable afterwards. */
  dispose(): void {
    this.#attempt++;
    if (this.#device) this.#release(this.#device);
    if (this.#state !== INITIAL_HUB_PROBE_STATE) this.#setState(INITIAL_HUB_PROBE_STATE);
  }

  /** `gattserverdisconnected` fired without the user asking for it. */
  readonly #handleDisconnected = (): void => {
    const device = this.#device;
    if (!device) return;
    const duringSetup = this.#state.status === 'connecting';
    this.#attempt++;
    this.#detach(device);
    this.#setState({
      status: 'disconnected',
      deviceName: normalizeName(device.name),
      reason: duringSetup ? 'connection-lost-during-setup' : 'connection-lost',
    });
  };

  #detach(device: BluetoothDeviceLike): void {
    device.removeEventListener('gattserverdisconnected', this.#handleDisconnected);
    if (this.#device === device) this.#device = null;
  }

  /** Detaches first, so the resulting `gattserverdisconnected` event is not reported as a loss. */
  #release(device: BluetoothDeviceLike): void {
    this.#detach(device);
    try {
      device.gatt?.disconnect();
    } catch {
      // Already disconnected; nothing else to release.
    }
  }

  #setState(next: HubProbeState): void {
    this.#state = next;
    for (const listener of [...this.#listeners]) listener(next);
  }
}
