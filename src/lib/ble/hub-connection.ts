/**
 * A Pybricks hub connection that can run programs: upload, start, stop, stdin, and stdout.
 *
 * This is the only module that writes to the hub (docs/adr/0007-ble-transport-writes.md). The
 * read-only HubProbe in ./hub-probe.ts stays read-only. Framework-agnostic: no React or Next.js.
 * Every protocol fact is cited in docs/protocol/pybricks-ble.md and src/lib/pybricks/protocol.ts.
 *
 * Safety rules (ADR 0007):
 * - GATT operations run one at a time, in order.
 * - disconnect() and dispose() send STOP before disconnecting when a program runs.
 * - A lost connection cannot stop the program: the firmware stops programs only on the stop
 *   command, the stop button, or shutdown, never on a disconnect. The UI says so.
 */

import {
  decodeRevisionString,
  parseFirmwareVersion,
  parseProtocolVersion,
  type FirmwareVersion,
  type ProtocolVersion,
} from '../pybricks/revision';
import {
  decodeHubCapabilities,
  decodeHubEvent,
  encodeProgramUpload,
  encodeStartUserProgram,
  encodeStdinWrites,
  encodeStopUserProgram,
  FeatureFlag,
  hasStatusFlag,
  StatusFlag,
  type HubCapabilities,
} from '../pybricks/protocol';
import {
  DEVICE_INFORMATION_SERVICE_UUID,
  FIRMWARE_REVISION_CHAR_UUID,
  PYBRICKS_COMMAND_EVENT_CHAR_UUID,
  PYBRICKS_HUB_CAPABILITIES_CHAR_UUID,
  PYBRICKS_SERVICE_UUID,
  SOFTWARE_REVISION_CHAR_UUID,
} from '../pybricks/uuids';
import {
  apiUnavailableError,
  classifyRequestDeviceError,
  describeGattError,
  errorDetail,
  unsupportedFirmwareError,
  type GattStage,
  type ProbeError,
} from './errors';
import { createHubRequestOptions } from './hub-probe';

// ---------------------------------------------------------------------------------------------
// Minimal views of the Web Bluetooth objects this module uses (including writes)
// ---------------------------------------------------------------------------------------------

export interface ControlCharacteristicLike {
  readonly value?: DataView | null;
  readValue(): Promise<DataView>;
  writeValueWithResponse(value: BufferSource): Promise<void>;
  startNotifications(): Promise<unknown>;
  addEventListener(type: 'characteristicvaluechanged', listener: (event: Event) => void): void;
  removeEventListener(type: 'characteristicvaluechanged', listener: (event: Event) => void): void;
}

export interface ControlServiceLike {
  getCharacteristic(
    characteristic: BluetoothCharacteristicUUID,
  ): Promise<ControlCharacteristicLike>;
}

export interface ControlServerLike {
  readonly connected: boolean;
  connect(): Promise<ControlServerLike>;
  disconnect(): void;
  getPrimaryService(service: BluetoothServiceUUID): Promise<ControlServiceLike>;
}

export interface ControlDeviceLike {
  readonly name?: string | undefined;
  readonly gatt?: ControlServerLike | undefined;
  addEventListener(type: 'gattserverdisconnected', listener: () => void): void;
  removeEventListener(type: 'gattserverdisconnected', listener: () => void): void;
}

export interface ControlBluetoothLike {
  requestDevice(options: RequestDeviceOptions): Promise<ControlDeviceLike>;
}

// ---------------------------------------------------------------------------------------------
// State
// ---------------------------------------------------------------------------------------------

export interface ConnectedHub {
  readonly name: string | null;
  readonly firmwareRevision: string;
  readonly firmwareVersion: FirmwareVersion | null;
  readonly protocolRevision: string;
  readonly protocolVersion: ProtocolVersion | null;
  readonly capabilities: HubCapabilities;
}

export type LinkState =
  | { readonly status: 'idle' }
  | { readonly status: 'requesting' }
  | { readonly status: 'no-device-selected' }
  | { readonly status: 'connecting'; readonly deviceName: string | null }
  | { readonly status: 'ready'; readonly hub: ConnectedHub }
  | {
      readonly status: 'disconnected';
      readonly deviceName: string | null;
      /** `lost`: the link dropped; a running program keeps running on the hub. */
      readonly reason: 'user' | 'lost';
      /** The hub reported a running program when the link dropped. */
      readonly programWasRunning: boolean;
    }
  | { readonly status: 'error'; readonly error: ProbeError; readonly deviceName: string | null };

export type ProgramPhase =
  | { readonly phase: 'idle' }
  | { readonly phase: 'uploading'; readonly sent: number; readonly total: number }
  | { readonly phase: 'starting' }
  | { readonly phase: 'running' }
  | { readonly phase: 'stopping' };

export interface HubFlags {
  /** From the hub's status reports; `false` until the first report. */
  readonly programRunning: boolean;
  readonly batteryLow: boolean;
  readonly shuttingDown: boolean;
}

export interface ConnectionSnapshot {
  readonly link: LinkState;
  readonly program: ProgramPhase;
  readonly flags: HubFlags;
}

export type RunError =
  | { readonly kind: 'not-connected' }
  | { readonly kind: 'busy' }
  | { readonly kind: 'too-big'; readonly size: number; readonly max: number }
  | { readonly kind: 'write-failed'; readonly detail: string };

export type RunResult = { readonly ok: true } | { readonly ok: false; readonly error: RunError };

const INITIAL_FLAGS: HubFlags = { programRunning: false, batteryLow: false, shuttingDown: false };

export const INITIAL_CONNECTION_SNAPSHOT: ConnectionSnapshot = Object.freeze<ConnectionSnapshot>({
  link: { status: 'idle' },
  program: { phase: 'idle' },
  flags: INITIAL_FLAGS,
});

/** Stdout needs the WRITE_STDOUT event, added in protocol 1.3.0 (docs/protocol section 4). */
const MIN_PROTOCOL_MINOR = 3;

/** How long disconnect() waits for STOP to be acknowledged before disconnecting anyway. */
export const STOP_BEFORE_DISCONNECT_TIMEOUT_MS = 1500;

type Listener<T> = (value: T) => void;

function defaultBluetooth(): ControlBluetoothLike | undefined {
  if (typeof navigator === 'undefined') return undefined;
  return (navigator as Navigator & { bluetooth?: ControlBluetoothLike }).bluetooth;
}

function normalizeName(name: string | undefined): string | null {
  const trimmed = name?.trim();
  return trimmed ? trimmed : null;
}

/** Web Bluetooth takes a BufferSource; every encoder returns a plain ArrayBuffer-backed array. */
function asBufferSource(bytes: Uint8Array): BufferSource {
  return bytes as Uint8Array<ArrayBuffer>;
}

export class HubConnection {
  #snapshot: ConnectionSnapshot = INITIAL_CONNECTION_SNAPSHOT;
  readonly #listeners = new Set<Listener<ConnectionSnapshot>>();
  readonly #outputListeners = new Set<Listener<Uint8Array>>();
  readonly #getBluetooth: () => ControlBluetoothLike | undefined;
  #device: ControlDeviceLike | null = null;
  #control: ControlCharacteristicLike | null = null;
  #attempt = 0;
  /** Serialises GATT operations. */
  #queue: Promise<unknown> = Promise.resolve();

  constructor(bluetooth?: ControlBluetoothLike | (() => ControlBluetoothLike | undefined)) {
    if (typeof bluetooth === 'function') this.#getBluetooth = bluetooth;
    else if (bluetooth) this.#getBluetooth = () => bluetooth;
    else this.#getBluetooth = defaultBluetooth;
  }

  readonly getSnapshot = (): ConnectionSnapshot => this.#snapshot;

  readonly subscribe = (listener: Listener<ConnectionSnapshot>): (() => void) => {
    this.#listeners.add(listener);
    return () => {
      this.#listeners.delete(listener);
    };
  };

  /** Raw stdout bytes from the running program, as they arrive. */
  readonly onOutput = (listener: Listener<Uint8Array>): (() => void) => {
    this.#outputListeners.add(listener);
    return () => {
      this.#outputListeners.delete(listener);
    };
  };

  /** Opens the device picker and connects. Call from a click handler. Never rejects. */
  async connect(): Promise<void> {
    const { status } = this.#snapshot.link;
    if (status === 'requesting' || status === 'connecting' || status === 'ready') return;
    const bluetooth = this.#getBluetooth();
    if (!bluetooth) {
      this.#setLink({ status: 'error', error: apiUnavailableError(), deviceName: null });
      return;
    }
    const attempt = ++this.#attempt;
    this.#set({ link: { status: 'requesting' }, program: { phase: 'idle' }, flags: INITIAL_FLAGS });

    let device: ControlDeviceLike;
    try {
      // requestDevice() must be the first awaited call so it runs inside the user gesture.
      device = await bluetooth.requestDevice(createHubRequestOptions());
    } catch (error) {
      if (attempt !== this.#attempt) return;
      const outcome = classifyRequestDeviceError(error);
      this.#setLink(
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
    this.#setLink({ status: 'connecting', deviceName });

    let stage: GattStage = 'connect';
    try {
      if (!device.gatt) throw new Error('The selected device has no GATT server.');
      const server = await device.gatt.connect();
      if (attempt !== this.#attempt) return;

      stage = 'read-firmware-revision';
      const info = await server.getPrimaryService(DEVICE_INFORMATION_SERVICE_UUID);
      const firmwareRevision = decodeRevisionString(
        await (await info.getCharacteristic(FIRMWARE_REVISION_CHAR_UUID)).readValue(),
      );
      stage = 'read-software-revision';
      const protocolRevision = decodeRevisionString(
        await (await info.getCharacteristic(SOFTWARE_REVISION_CHAR_UUID)).readValue(),
      );
      if (attempt !== this.#attempt) return;

      const protocolVersion = parseProtocolVersion(protocolRevision);
      if (
        !protocolVersion ||
        protocolVersion.major !== 1 ||
        protocolVersion.minor < MIN_PROTOCOL_MINOR
      ) {
        throw unsupportedFirmwareError(
          `The hub reports Pybricks protocol "${protocolRevision}"; MatPilot needs 1.${MIN_PROTOCOL_MINOR} or newer within 1.x.`,
        );
      }

      stage = 'read-capabilities';
      const pybricks = await server.getPrimaryService(PYBRICKS_SERVICE_UUID);
      const capabilities = decodeHubCapabilities(
        await (await pybricks.getCharacteristic(PYBRICKS_HUB_CAPABILITIES_CHAR_UUID)).readValue(),
      );
      if ((capabilities.featureFlags & FeatureFlag.USER_PROG_FORMAT_MULTI_MPY_V6) === 0) {
        throw unsupportedFirmwareError(
          'The hub does not accept programs in the MicroPython .mpy v6 format.',
        );
      }
      if (attempt !== this.#attempt) return;

      stage = 'start-notifications';
      const control = await pybricks.getCharacteristic(PYBRICKS_COMMAND_EVENT_CHAR_UUID);
      control.addEventListener('characteristicvaluechanged', this.#handleNotification);
      this.#control = control;
      await control.startNotifications();
      if (attempt !== this.#attempt) return;

      this.#setLink({
        status: 'ready',
        hub: {
          name: deviceName,
          firmwareRevision,
          firmwareVersion: parseFirmwareVersion(firmwareRevision),
          protocolRevision,
          protocolVersion,
          capabilities,
        },
      });
    } catch (error) {
      if (attempt !== this.#attempt) return;
      this.#release(device);
      const probeError =
        typeof error === 'object' && error !== null && 'kind' in error && 'title' in error
          ? (error as ProbeError)
          : describeGattError(error, stage);
      this.#setLink({ status: 'error', error: probeError, deviceName });
    }
  }

  /**
   * Uploads a packed program (src/lib/pybricks/mpy.ts) and starts it. Resolves when the hub has
   * accepted the start command; output arrives through onOutput().
   */
  async run(program: Uint8Array): Promise<RunResult> {
    const link = this.#snapshot.link;
    if (link.status !== 'ready' || !this.#control)
      return { ok: false, error: { kind: 'not-connected' } };
    if (this.#snapshot.program.phase !== 'idle' || this.#snapshot.flags.programRunning) {
      return { ok: false, error: { kind: 'busy' } };
    }
    const { maxProgramSize, maxWriteSize } = link.hub.capabilities;
    if (program.length > maxProgramSize) {
      return { ok: false, error: { kind: 'too-big', size: program.length, max: maxProgramSize } };
    }
    const writes = encodeProgramUpload(program, maxWriteSize);
    const attempt = this.#attempt;
    try {
      let sent = 0;
      this.#setProgram({ phase: 'uploading', sent, total: program.length });
      for (const write of writes) {
        await this.#write(write);
        if (attempt !== this.#attempt) return { ok: false, error: { kind: 'not-connected' } };
        if (write[0] === 0x04) sent += write.length - 5;
        this.#setProgram({ phase: 'uploading', sent, total: program.length });
      }
      this.#setProgram({ phase: 'starting' });
      await this.#write(encodeStartUserProgram());
      if (attempt !== this.#attempt) return { ok: false, error: { kind: 'not-connected' } };
      // The running flag in the next status report confirms the start.
      this.#setProgram(
        this.#snapshot.flags.programRunning ? { phase: 'running' } : { phase: 'starting' },
      );
      return { ok: true };
    } catch (error) {
      if (attempt === this.#attempt) this.#setProgram({ phase: 'idle' });
      return { ok: false, error: { kind: 'write-failed', detail: errorDetail(error) } };
    }
  }

  /** Asks the hub to stop the running program. Never rejects. */
  async stop(): Promise<boolean> {
    if (this.#snapshot.link.status !== 'ready' || !this.#control) return false;
    if (this.#snapshot.program.phase !== 'idle') this.#setProgram({ phase: 'stopping' });
    try {
      await this.#write(encodeStopUserProgram());
      return true;
    } catch {
      return false;
    }
  }

  /** Sends text to the program's stdin (for example `input()`). Never rejects. */
  async writeStdin(text: string): Promise<boolean> {
    const link = this.#snapshot.link;
    if (link.status !== 'ready' || !this.#control) return false;
    try {
      const writes = encodeStdinWrites(
        new TextEncoder().encode(text),
        link.hub.capabilities.maxWriteSize,
      );
      for (const write of writes) await this.#write(write);
      return true;
    } catch {
      return false;
    }
  }

  /** Stops a running program (best effort, bounded wait), then disconnects. */
  async disconnect(): Promise<void> {
    const device = this.#device;
    if (!device) return;
    await this.#stopIfRunning();
    if (this.#device !== device) return;
    const programWasRunning = this.#snapshot.flags.programRunning;
    this.#attempt++;
    this.#release(device);
    this.#set({
      link: {
        status: 'disconnected',
        deviceName: normalizeName(device.name),
        reason: 'user',
        programWasRunning,
      },
      program: { phase: 'idle' },
      flags: INITIAL_FLAGS,
    });
  }

  /** For page unload or unmount: stop (best effort, not awaited for long) and release. */
  dispose(): void {
    const device = this.#device;
    if (this.#control && this.#snapshot.flags.programRunning) {
      void this.#control
        .writeValueWithResponse(asBufferSource(encodeStopUserProgram()))
        .catch(() => undefined);
    }
    this.#attempt++;
    if (device) this.#release(device);
    if (this.#snapshot !== INITIAL_CONNECTION_SNAPSHOT) this.#set(INITIAL_CONNECTION_SNAPSHOT);
  }

  async #stopIfRunning(): Promise<void> {
    const running = this.#snapshot.flags.programRunning || this.#snapshot.program.phase !== 'idle';
    if (!running || !this.#control) return;
    await Promise.race([
      this.stop(),
      new Promise((resolve) => setTimeout(resolve, STOP_BEFORE_DISCONNECT_TIMEOUT_MS)),
    ]);
  }

  #write(value: Uint8Array): Promise<void> {
    const control = this.#control;
    if (!control) return Promise.reject(new Error('Not connected.'));
    const run = this.#queue.then(() => control.writeValueWithResponse(asBufferSource(value)));
    this.#queue = run.catch(() => undefined);
    return run;
  }

  readonly #handleNotification = (event: Event): void => {
    const value = (event.target as ControlCharacteristicLike | null)?.value;
    if (!value) return;
    const decoded = decodeHubEvent(value);
    if (!decoded) return;
    if (decoded.type === 'stdout') {
      for (const listener of [...this.#outputListeners]) listener(decoded.data);
      return;
    }
    if (decoded.type !== 'status') return;
    const flags: HubFlags = {
      programRunning: hasStatusFlag(decoded.flags, StatusFlag.USER_PROGRAM_RUNNING),
      batteryLow:
        hasStatusFlag(decoded.flags, StatusFlag.BATTERY_LOW_VOLTAGE_WARNING) ||
        hasStatusFlag(decoded.flags, StatusFlag.BATTERY_LOW_VOLTAGE_SHUTDOWN),
      shuttingDown: hasStatusFlag(decoded.flags, StatusFlag.SHUTDOWN),
    };
    const phase = this.#snapshot.program.phase;
    let program = this.#snapshot.program;
    if (flags.programRunning && (phase === 'starting' || phase === 'idle'))
      program = { phase: 'running' };
    if (!flags.programRunning && (phase === 'running' || phase === 'stopping'))
      program = { phase: 'idle' };
    const previous = this.#snapshot.flags;
    if (
      program === this.#snapshot.program &&
      previous.programRunning === flags.programRunning &&
      previous.batteryLow === flags.batteryLow &&
      previous.shuttingDown === flags.shuttingDown
    ) {
      return;
    }
    this.#set({ ...this.#snapshot, program, flags });
  };

  readonly #handleDisconnected = (): void => {
    const device = this.#device;
    if (!device) return;
    const programWasRunning = this.#snapshot.flags.programRunning;
    this.#attempt++;
    this.#detach(device);
    this.#set({
      link: {
        status: 'disconnected',
        deviceName: normalizeName(device.name),
        reason: 'lost',
        programWasRunning,
      },
      program: { phase: 'idle' },
      flags: INITIAL_FLAGS,
    });
  };

  #detach(device: ControlDeviceLike): void {
    device.removeEventListener('gattserverdisconnected', this.#handleDisconnected);
    this.#control?.removeEventListener('characteristicvaluechanged', this.#handleNotification);
    this.#control = null;
    this.#queue = Promise.resolve();
    if (this.#device === device) this.#device = null;
  }

  #release(device: ControlDeviceLike): void {
    this.#detach(device);
    try {
      device.gatt?.disconnect();
    } catch {
      // Already disconnected.
    }
  }

  #setLink(link: LinkState): void {
    this.#set({ ...this.#snapshot, link });
  }

  #setProgram(program: ProgramPhase): void {
    this.#set({ ...this.#snapshot, program });
  }

  #set(next: ConnectionSnapshot): void {
    this.#snapshot = next;
    for (const listener of [...this.#listeners]) listener(next);
  }
}
