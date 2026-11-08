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
 *
 * It connects over Bluetooth (connect()) or, for hubs on Pybricks v4.1.1 or newer, over a USB
 * cable (connectUsb(), docs/adr/0018-usb-connection.md, ../usb/serial-link.ts). The commands and
 * events are the same bytes on both; only how they travel differs.
 *
 * Besides uploaded programs, it can run source text in the hub's built-in REPL (runInRepl), which
 * leaves the stored program slots untouched (docs/adr/0009-live-device-values.md). The REPL's
 * output goes to onReplOutput(), never to onOutput().
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
  encodeStartProgramId,
  encodeStartUserProgram,
  encodeStdinWrites,
  encodeStopUserProgram,
  encodeWriteStdin,
  FeatureFlag,
  hasStatusFlag,
  ProgramId,
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
import { classifyRequestPortError, describeUsbError, usbUnavailableError } from '../usb/errors';
import {
  READ,
  SerialLink,
  USB_PORT_FILTERS,
  type SerialLike,
  type SerialPortLike,
} from '../usb/serial-link';

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
  /** How the page reaches the hub. */
  readonly via: 'bluetooth' | 'usb';
  readonly name: string | null;
  readonly firmwareRevision: string;
  readonly firmwareVersion: FirmwareVersion | null;
  readonly protocolRevision: string;
  readonly protocolVersion: ProtocolVersion | null;
  readonly capabilities: HubCapabilities;
  /** The hub has the built-in REPL and accepts a program id in START (protocol 1.4+). */
  readonly supportsRepl: boolean;
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
  /** From the hub's status reports; `false` until the first report. Includes the REPL. */
  readonly programRunning: boolean;
  /** A program other than the REPL runs: the user's program. */
  readonly userProgramRunning: boolean;
  /** The running program's id (protocol 1.4+), or `null`. */
  readonly runningProgramId: number | null;
  readonly batteryLow: boolean;
  readonly shuttingDown: boolean;
}

/**
 * Why the last REPL session ended: `stopped` by this page, `ended` on the hub (its stop button, or
 * the source finished), or `failed` to start.
 */
export type ReplEnd = 'stopped' | 'ended' | 'failed';

export type ReplState =
  | { readonly phase: 'off'; readonly ended: ReplEnd | null }
  | { readonly phase: 'starting' }
  | { readonly phase: 'running' }
  | { readonly phase: 'stopping' };

export interface ConnectionSnapshot {
  readonly link: LinkState;
  readonly program: ProgramPhase;
  readonly flags: HubFlags;
  readonly repl: ReplState;
}

export type RunError =
  | { readonly kind: 'not-connected' }
  | { readonly kind: 'busy' }
  | { readonly kind: 'too-big'; readonly size: number; readonly max: number }
  | { readonly kind: 'write-failed'; readonly detail: string };

export type RunResult = { readonly ok: true } | { readonly ok: false; readonly error: RunError };

export type ReplError =
  | { readonly kind: 'not-connected' }
  | { readonly kind: 'unsupported' }
  | { readonly kind: 'busy' }
  | { readonly kind: 'cancelled' }
  | { readonly kind: 'timeout'; readonly stage: 'stop' | 'prompt' | 'paste-mode' | 'echo' }
  | { readonly kind: 'write-failed'; readonly detail: string };

export type ReplResult = { readonly ok: true } | { readonly ok: false; readonly error: ReplError };

const INITIAL_FLAGS: HubFlags = {
  programRunning: false,
  userProgramRunning: false,
  runningProgramId: null,
  batteryLow: false,
  shuttingDown: false,
};

const REPL_OFF: ReplState = { phase: 'off', ended: null };

export const INITIAL_CONNECTION_SNAPSHOT: ConnectionSnapshot = Object.freeze<ConnectionSnapshot>({
  link: { status: 'idle' },
  program: { phase: 'idle' },
  flags: INITIAL_FLAGS,
  repl: REPL_OFF,
});

/**
 * The REPL session (docs/protocol/pybricks-ble.md section 8). MicroPython's friendly REPL prints
 * this prompt, enters paste mode on Ctrl-E with the header below, echoes each pasted byte, and runs
 * the paste on Ctrl-D. Cited at pybricks/micropython 13580b6: py/repl.h#L49-L51 (prompt),
 * shared/runtime/pyexec.c#L628-L652 (paste mode).
 */
const REPL_PROMPT = '>>> ';
const REPL_PASTE_HEADER = 'Ctrl-D to finish\r\n=== ';
const CTRL_D = 0x04;
const CTRL_E = 0x05;
/**
 * SPIKE Prime buffers 64 bytes of stdin (FW lib/pbio/platform/prime_hub/pbsysconfig.h#L21), of
 * which its ring buffer can hold 63 (FW lib/lwrb/src/lwrb/lwrb.c#L274-L286). Bytes not yet echoed
 * are at most what the buffer still holds, so keeping them at or below 60 can never overflow it.
 */
const REPL_CHUNK_BYTES = 30;
const REPL_MAX_IN_FLIGHT = 60;
/** Keep the matched text short; only the prompt and the paste header are searched in it. */
const REPL_TAIL_CHARS = 256;

export const REPL_PROMPT_TIMEOUT_MS = 5000;
export const REPL_ECHO_TIMEOUT_MS = 3000;
/** How long to wait for the hub to report that a stopped program has ended. */
export const PROGRAM_END_TIMEOUT_MS = 2000;

/** Stdout needs the WRITE_STDOUT event, added in protocol 1.3.0 (docs/protocol section 4). */
const MIN_PROTOCOL_MINOR = 3;
/** START with a program id, and so the REPL by id, needs protocol 1.4.0 (section 3). */
const REPL_PROTOCOL_MINOR = 4;
/** USB came with protocol 1.6.0 (docs/protocol/pybricks-usb.md section 1). */
const USB_PROTOCOL_MINOR = 6;

/** How long disconnect() waits for STOP to be acknowledged before disconnecting anyway. */
export const STOP_BEFORE_DISCONNECT_TIMEOUT_MS = 1500;

type Listener<T> = (value: T) => void;

function defaultBluetooth(): ControlBluetoothLike | undefined {
  if (typeof navigator === 'undefined') return undefined;
  return (navigator as Navigator & { bluetooth?: ControlBluetoothLike }).bluetooth;
}

function defaultSerial(): SerialLike | undefined {
  if (typeof navigator === 'undefined') return undefined;
  return (navigator as Navigator & { serial?: SerialLike }).serial;
}

/** A characteristic's bytes as the DataView the decoders take. */
function view(bytes: Uint8Array): DataView {
  return new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
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
  readonly #replListeners = new Set<Listener<Uint8Array>>();
  readonly #getSerial: () => SerialLike | undefined;
  #device: ControlDeviceLike | null = null;
  #control: ControlCharacteristicLike | null = null;
  /** The USB link, when connected over USB; then #device and #control are null. */
  #usb: SerialLink | null = null;
  #usbName: string | null = null;
  #attempt = 0;
  /** Serialises writes to the hub. */
  #queue: Promise<unknown> = Promise.resolve();
  /** Re-checked after every notification and on disconnect (see #waitFor). */
  readonly #waiters = new Set<() => void>();
  /** Where runInRepl() is: waiting for the prompt, for the paste header, counting the echo. */
  #replStage: 'none' | 'prompt' | 'header' | 'echo' | 'run' = 'none';
  #replTail = '';
  #replEcho = 0;
  #replStartSent = false;
  #replSeenRunning = false;

  constructor(
    bluetooth?: ControlBluetoothLike | (() => ControlBluetoothLike | undefined),
    serial?: SerialLike | (() => SerialLike | undefined),
  ) {
    if (typeof bluetooth === 'function') this.#getBluetooth = bluetooth;
    else if (bluetooth) this.#getBluetooth = () => bluetooth;
    else this.#getBluetooth = defaultBluetooth;
    if (typeof serial === 'function') this.#getSerial = serial;
    else if (serial) this.#getSerial = () => serial;
    else this.#getSerial = defaultSerial;
  }

  /** Whether this browser can connect with a USB cable (Web Serial). */
  readonly canUseUsb = (): boolean => this.#getSerial() !== undefined;

  readonly getSnapshot = (): ConnectionSnapshot => this.#snapshot;

  readonly subscribe = (listener: Listener<ConnectionSnapshot>): (() => void) => {
    this.#listeners.add(listener);
    return () => {
      this.#listeners.delete(listener);
    };
  };

  /** Raw stdout bytes from the running program, as they arrive. Not the REPL's output. */
  readonly onOutput = (listener: Listener<Uint8Array>): (() => void) => {
    this.#outputListeners.add(listener);
    return () => {
      this.#outputListeners.delete(listener);
    };
  };

  /** Raw stdout bytes while a REPL session runs, including the REPL's prompt and echo. */
  readonly onReplOutput = (listener: Listener<Uint8Array>): (() => void) => {
    this.#replListeners.add(listener);
    return () => {
      this.#replListeners.delete(listener);
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
    this.#set({
      link: { status: 'requesting' },
      program: { phase: 'idle' },
      flags: INITIAL_FLAGS,
      repl: REPL_OFF,
    });

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
          via: 'bluetooth',
          name: deviceName,
          firmwareRevision,
          firmwareVersion: parseFirmwareVersion(firmwareRevision),
          protocolRevision,
          protocolVersion,
          capabilities,
          supportsRepl:
            protocolVersion.minor >= REPL_PROTOCOL_MINOR &&
            (capabilities.featureFlags & FeatureFlag.BUILTIN_REPL) !== 0,
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
   * Opens the browser's port picker and connects with a USB cable. The hub needs Pybricks v4.1.1
   * or newer (docs/protocol/pybricks-usb.md). Call from a click handler. Never rejects.
   */
  async connectUsb(): Promise<void> {
    const { status } = this.#snapshot.link;
    if (status === 'requesting' || status === 'connecting' || status === 'ready') return;
    const serial = this.#getSerial();
    if (!serial) {
      this.#setLink({ status: 'error', error: usbUnavailableError(), deviceName: null });
      return;
    }
    const attempt = ++this.#attempt;
    this.#set({
      link: { status: 'requesting' },
      program: { phase: 'idle' },
      flags: INITIAL_FLAGS,
      repl: REPL_OFF,
    });

    let port: SerialPortLike;
    try {
      // requestPort() must be the first awaited call so it runs inside the user gesture.
      port = await serial.requestPort({ filters: USB_PORT_FILTERS });
    } catch (error) {
      if (attempt !== this.#attempt) return;
      const outcome = classifyRequestPortError(error);
      this.#setLink(
        outcome.kind === 'cancelled'
          ? { status: 'no-device-selected' }
          : { status: 'error', error: outcome.error, deviceName: null },
      );
      return;
    }
    if (attempt !== this.#attempt) return;
    this.#setLink({ status: 'connecting', deviceName: null });

    let link: SerialLink | null = null;
    try {
      const opened = await SerialLink.open(port, {
        onEvent: (data) => {
          if (link !== null && this.#usb === link) this.#handleEvent(view(data));
        },
        onLost: () => {
          if (link !== null) this.#handleUsbLost(link);
        },
      });
      link = opened;
      if (attempt !== this.#attempt) {
        void opened.close();
        return;
      }
      this.#usb = opened;
      this.#usbName = normalizeName(decodeRevisionString(await opened.read(READ.name)));
      const firmwareRevision = decodeRevisionString(await opened.read(READ.firmwareRevision));
      const protocolRevision = decodeRevisionString(await opened.read(READ.protocolRevision));
      const protocolVersion = parseProtocolVersion(protocolRevision);
      if (
        !protocolVersion ||
        protocolVersion.major !== 1 ||
        protocolVersion.minor < USB_PROTOCOL_MINOR
      ) {
        throw unsupportedFirmwareError(
          `The hub reports Pybricks protocol "${protocolRevision}"; USB needs 1.${USB_PROTOCOL_MINOR} or newer within 1.x (Pybricks v4.1.1 or newer).`,
        );
      }
      const capabilities = decodeHubCapabilities(view(await opened.read(READ.capabilities)));
      if ((capabilities.featureFlags & FeatureFlag.USER_PROG_FORMAT_MULTI_MPY_V6) === 0) {
        throw unsupportedFirmwareError(
          'The hub does not accept programs in the MicroPython .mpy v6 format.',
        );
      }
      // The hub sends events only to a host that subscribed; it answers with a status report.
      await opened.subscribe(true);
      if (attempt !== this.#attempt) return;
      this.#setLink({
        status: 'ready',
        hub: {
          via: 'usb',
          name: this.#usbName,
          firmwareRevision,
          firmwareVersion: parseFirmwareVersion(firmwareRevision),
          protocolRevision,
          protocolVersion,
          capabilities,
          supportsRepl:
            protocolVersion.minor >= REPL_PROTOCOL_MINOR &&
            (capabilities.featureFlags & FeatureFlag.BUILTIN_REPL) !== 0,
        },
      });
    } catch (error) {
      if (attempt !== this.#attempt) return;
      if (link) {
        if (this.#usb === link) this.#usb = null;
        this.#queue = Promise.resolve();
        void link.close();
      }
      const probeError =
        typeof error === 'object' && error !== null && 'kind' in error && 'title' in error
          ? (error as ProbeError)
          : describeUsbError(error);
      this.#setLink({ status: 'error', error: probeError, deviceName: this.#usbName });
    }
  }

  /**
   * Uploads a packed program (src/lib/pybricks/mpy.ts) and starts it. Resolves when the hub has
   * accepted the start command; output arrives through onOutput().
   */
  async run(program: Uint8Array): Promise<RunResult> {
    const link = this.#snapshot.link;
    if (link.status !== 'ready' || !this.#connected())
      return { ok: false, error: { kind: 'not-connected' } };
    if (this.#snapshot.program.phase !== 'idle' || this.#snapshot.flags.userProgramRunning) {
      return { ok: false, error: { kind: 'busy' } };
    }
    // A REPL session (live device values) gives way to the user's program.
    if (this.#snapshot.repl.phase !== 'off' || this.#snapshot.flags.programRunning) {
      if (!(await this.#endRepl())) return { ok: false, error: { kind: 'busy' } };
      if (this.#snapshot.link.status !== 'ready' || this.#snapshot.program.phase !== 'idle') {
        return { ok: false, error: { kind: 'busy' } };
      }
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
        this.#snapshot.flags.userProgramRunning ? { phase: 'running' } : { phase: 'starting' },
      );
      return { ok: true };
    } catch (error) {
      if (attempt === this.#attempt) this.#setProgram({ phase: 'idle' });
      return { ok: false, error: { kind: 'write-failed', detail: errorDetail(error) } };
    }
  }

  /** Asks the hub to stop the running program. Never rejects. */
  async stop(): Promise<boolean> {
    if (this.#snapshot.link.status !== 'ready' || !this.#connected()) return false;
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
    if (link.status !== 'ready' || !this.#connected()) return false;
    if (this.#snapshot.repl.phase !== 'off') return false;
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

  /**
   * Starts the hub's REPL and runs `source` in it with MicroPython's paste mode, so nothing is
   * written to the program slots. Resolves once the source has been sent and started; its output
   * arrives through onReplOutput(). `source` must be printable ASCII, tabs and `\n` line endings.
   *
   * Pasting is paced by the REPL's echo: at most REPL_MAX_IN_FLIGHT bytes are sent ahead of what
   * the REPL has echoed back, so the hub's 64-byte stdin buffer never overflows.
   */
  async runInRepl(source: string): Promise<ReplResult> {
    const link = this.#snapshot.link;
    if (link.status !== 'ready' || !this.#connected())
      return { ok: false, error: { kind: 'not-connected' } };
    if (!link.hub.supportsRepl) return { ok: false, error: { kind: 'unsupported' } };
    if (
      this.#snapshot.repl.phase !== 'off' ||
      this.#snapshot.program.phase !== 'idle' ||
      this.#snapshot.flags.userProgramRunning
    ) {
      return { ok: false, error: { kind: 'busy' } };
    }
    if (!/^[\t\n\x20-\x7e]*$/.test(source)) {
      throw new Error('REPL source must be printable ASCII, tabs and \\n line endings.');
    }
    const attempt = this.#attempt;
    this.#replStage = 'none';
    this.#replStartSent = false;
    this.#replSeenRunning = false;
    this.#setRepl({ phase: 'starting' });
    const cancelled = () => attempt !== this.#attempt || this.#snapshot.repl.phase !== 'starting';
    // Every wait also ends as soon as the session is stopped or the link drops.
    const until = (predicate: () => boolean, timeoutMs: number) =>
      this.#waitFor(() => cancelled() || predicate(), timeoutMs);

    try {
      // A REPL left running (for example after a lost link) is stopped first.
      if (this.#snapshot.flags.programRunning) {
        if (this.#snapshot.flags.runningProgramId !== ProgramId.REPL) {
          return this.#replFailed(attempt, { kind: 'busy' });
        }
        await this.#write(encodeStopUserProgram());
        const ended = await until(
          () => !this.#snapshot.flags.programRunning,
          PROGRAM_END_TIMEOUT_MS,
        );
        if (cancelled()) return this.#replCancelled(attempt);
        if (!ended) return this.#replFailed(attempt, { kind: 'timeout', stage: 'stop' });
      }

      this.#replTail = '';
      this.#replStage = 'prompt';
      this.#replStartSent = true;
      await this.#write(encodeStartProgramId(ProgramId.REPL));
      const prompted = await until(
        () => this.#replTail.includes(REPL_PROMPT),
        REPL_PROMPT_TIMEOUT_MS,
      );
      if (cancelled()) return this.#replCancelled(attempt);
      if (!prompted) return this.#replFailed(attempt, { kind: 'timeout', stage: 'prompt' });

      this.#replTail = '';
      this.#replEcho = 0;
      this.#replStage = 'header';
      await this.#write(encodeWriteStdin(Uint8Array.of(CTRL_E)));
      const pasting = await until(() => this.#replStage === 'echo', REPL_PROMPT_TIMEOUT_MS);
      if (cancelled()) return this.#replCancelled(attempt);
      if (!pasting) return this.#replFailed(attempt, { kind: 'timeout', stage: 'paste-mode' });

      const bytes = new TextEncoder().encode(source);
      const chunkSize = Math.min(REPL_CHUNK_BYTES, link.hub.capabilities.maxWriteSize - 1);
      let sent = 0;
      while (sent < bytes.length) {
        const chunk = bytes.subarray(sent, sent + chunkSize);
        const room = await until(
          () => sent - this.#replEcho + chunk.length <= REPL_MAX_IN_FLIGHT,
          REPL_ECHO_TIMEOUT_MS,
        );
        if (cancelled()) return this.#replCancelled(attempt);
        if (!room) return this.#replFailed(attempt, { kind: 'timeout', stage: 'echo' });
        await this.#write(encodeWriteStdin(chunk));
        sent += chunk.length;
      }
      const echoed = await until(() => this.#replEcho >= sent, REPL_ECHO_TIMEOUT_MS);
      if (cancelled()) return this.#replCancelled(attempt);
      if (!echoed) return this.#replFailed(attempt, { kind: 'timeout', stage: 'echo' });

      this.#replStage = 'run';
      await this.#write(encodeWriteStdin(Uint8Array.of(CTRL_D)));
      if (cancelled()) return this.#replCancelled(attempt);
      this.#setRepl({ phase: 'running' });
      return { ok: true };
    } catch (error) {
      return this.#replFailed(attempt, { kind: 'write-failed', detail: errorDetail(error) });
    }
  }

  /** Sends one byte of stdin to a running REPL session, as a keep-alive. Never rejects. */
  async keepReplAlive(): Promise<boolean> {
    if (this.#snapshot.repl.phase !== 'running' || !this.#connected()) return false;
    try {
      await this.#write(encodeWriteStdin(Uint8Array.of(0x2e)));
      return true;
    } catch {
      return false;
    }
  }

  /** Stops a REPL session and waits (bounded) until the hub reports it ended. Never rejects. */
  async stopRepl(): Promise<boolean> {
    return this.#endRepl();
  }

  /** Stops a running program (best effort, bounded wait), then disconnects. */
  async disconnect(): Promise<void> {
    const device = this.#device;
    const usb = this.#usb;
    if (!device && !usb) return;
    await this.#stopIfRunning();
    if (this.#device !== device || this.#usb !== usb) return;
    const programWasRunning = this.#snapshot.flags.userProgramRunning;
    this.#attempt++;
    if (device) this.#release(device);
    const closing = usb ? this.#releaseUsb(usb) : null;
    this.#set({
      link: {
        status: 'disconnected',
        deviceName: device ? normalizeName(device.name) : this.#usbName,
        reason: 'user',
        programWasRunning,
      },
      program: { phase: 'idle' },
      flags: INITIAL_FLAGS,
      repl: REPL_OFF,
    });
    this.#notifyWaiters();
    // Over USB, wait for the port to close, so it can be chosen again at once.
    await closing;
  }

  /** For page unload or unmount: stop (best effort, not awaited for long) and release. */
  dispose(): void {
    const device = this.#device;
    const usb = this.#usb;
    if (this.#control && this.#snapshot.flags.programRunning) {
      void this.#control
        .writeValueWithResponse(asBufferSource(encodeStopUserProgram()))
        .catch(() => undefined);
    }
    // Over USB, STOP goes ahead of the unsubscribe and the close in the link's own queue.
    if (usb && this.#snapshot.flags.programRunning) {
      void usb.command(encodeStopUserProgram()).catch(() => undefined);
    }
    this.#attempt++;
    if (device) this.#release(device);
    if (usb) void this.#releaseUsb(usb);
    if (this.#snapshot !== INITIAL_CONNECTION_SNAPSHOT) this.#set(INITIAL_CONNECTION_SNAPSHOT);
    this.#notifyWaiters();
  }

  /** Ends a REPL session, or a REPL the hub was already running, before something else runs. */
  async #endRepl(): Promise<boolean> {
    const attempt = this.#attempt;
    const { repl, flags } = this.#snapshot;
    const replOnHub = flags.programRunning && flags.runningProgramId === ProgramId.REPL;
    if (repl.phase === 'off' && !replOnHub) return !flags.programRunning;
    if (repl.phase !== 'off' && !this.#replStartSent) {
      // runInRepl() has not sent START yet; it sees the phase change and gives up.
      this.#replStage = 'none';
      this.#setRepl({ phase: 'off', ended: 'stopped' });
      return !this.#snapshot.flags.programRunning;
    }
    if (repl.phase !== 'off') this.#setRepl({ phase: 'stopping' });
    try {
      await this.#write(encodeStopUserProgram());
    } catch {
      // Reported through the link state if the hub is gone.
    }
    const ended = await this.#waitFor(
      () => this.#snapshot.repl.phase === 'off' && !this.#snapshot.flags.programRunning,
      PROGRAM_END_TIMEOUT_MS,
    );
    if (attempt === this.#attempt && this.#snapshot.repl.phase !== 'off') {
      // No status report confirmed it (for example START and STOP were too close together).
      this.#replStage = 'none';
      this.#setRepl({ phase: 'off', ended: 'stopped' });
    }
    return ended || (attempt === this.#attempt && !this.#snapshot.flags.programRunning);
  }

  #replCancelled(attempt: number): ReplResult {
    return attempt === this.#attempt
      ? { ok: false, error: { kind: 'cancelled' } }
      : { ok: false, error: { kind: 'not-connected' } };
  }

  /** A REPL session failed to start: stop whatever started, and say why. */
  #replFailed(attempt: number, error: ReplError): ReplResult {
    if (attempt !== this.#attempt) return { ok: false, error: { kind: 'not-connected' } };
    if (this.#snapshot.repl.phase !== 'starting') return this.#replCancelled(attempt);
    const started = this.#replStartSent;
    this.#replStage = 'none';
    this.#setRepl({ phase: 'off', ended: 'failed' });
    if (started) void this.#write(encodeStopUserProgram()).catch(() => undefined);
    return { ok: false, error };
  }

  /**
   * Resolves `true` once `predicate` holds, or `false` after `timeoutMs` or a disconnect. Checked
   * now and after every notification.
   */
  #waitFor(predicate: () => boolean, timeoutMs: number): Promise<boolean> {
    if (predicate()) return Promise.resolve(true);
    const attempt = this.#attempt;
    return new Promise((resolve) => {
      const finish = (value: boolean) => {
        clearTimeout(timer);
        this.#waiters.delete(check);
        resolve(value);
      };
      const check = () => {
        if (attempt !== this.#attempt) finish(false);
        else if (predicate()) finish(true);
      };
      const timer = setTimeout(() => finish(false), timeoutMs);
      this.#waiters.add(check);
    });
  }

  #notifyWaiters(): void {
    for (const check of [...this.#waiters]) check();
  }

  /** Follows the REPL's output while runInRepl() waits for the prompt, header, and echo. */
  #trackReplOutput(bytes: Uint8Array): void {
    const stage = this.#replStage;
    if (stage === 'echo') {
      for (const byte of bytes) if (byte !== 0x0d) this.#replEcho++;
      return;
    }
    if (stage !== 'prompt' && stage !== 'header') return;
    let text = this.#replTail;
    for (const byte of bytes) text += String.fromCharCode(byte);
    if (stage === 'header') {
      const at = text.indexOf(REPL_PASTE_HEADER);
      if (at >= 0) {
        // Bytes after the header in this notification are already echo.
        for (const char of text.slice(at + REPL_PASTE_HEADER.length)) {
          if (char !== '\r') this.#replEcho++;
        }
        this.#replStage = 'echo';
        this.#replTail = '';
        return;
      }
    }
    this.#replTail = text.slice(-REPL_TAIL_CHARS);
  }

  async #stopIfRunning(): Promise<void> {
    const running = this.#snapshot.flags.programRunning || this.#snapshot.program.phase !== 'idle';
    if (!running || !this.#connected()) return;
    await Promise.race([
      this.stop(),
      new Promise((resolve) => setTimeout(resolve, STOP_BEFORE_DISCONNECT_TIMEOUT_MS)),
    ]);
  }

  #connected(): boolean {
    return this.#control !== null || this.#usb !== null;
  }

  /** Writes one command: a GATT write with response, or a USB command answered by the hub. */
  #write(value: Uint8Array): Promise<void> {
    const control = this.#control;
    const usb = this.#usb;
    if (!control && !usb) return Promise.reject(new Error('Not connected.'));
    const run = this.#queue.then(() =>
      usb ? usb.command(value) : control!.writeValueWithResponse(asBufferSource(value)),
    );
    this.#queue = run.catch(() => undefined);
    return run;
  }

  readonly #handleNotification = (event: Event): void => {
    const value = (event.target as ControlCharacteristicLike | null)?.value;
    if (value) this.#handleEvent(value);
  };

  /** A Pybricks event, from a Bluetooth notification or a USB event message. */
  #handleEvent(value: DataView): void {
    const decoded = decodeHubEvent(value);
    if (!decoded) return;
    if (decoded.type === 'stdout') {
      const fromRepl =
        this.#snapshot.repl.phase !== 'off' ||
        this.#snapshot.flags.runningProgramId === ProgramId.REPL;
      if (fromRepl) {
        this.#trackReplOutput(decoded.data);
        for (const listener of [...this.#replListeners]) listener(decoded.data);
      } else {
        for (const listener of [...this.#outputListeners]) listener(decoded.data);
      }
      this.#notifyWaiters();
      return;
    }
    if (decoded.type !== 'status') return;
    const programRunning = hasStatusFlag(decoded.flags, StatusFlag.USER_PROGRAM_RUNNING);
    let repl = this.#snapshot.repl;
    // Protocol 1.3 reports no program id; then a running program is the REPL only while a
    // session that this page started is active.
    const isRepl =
      programRunning &&
      (decoded.programId === ProgramId.REPL ||
        (decoded.programId === null && repl.phase !== 'off'));
    const flags: HubFlags = {
      programRunning,
      userProgramRunning: programRunning && !isRepl,
      runningProgramId: programRunning ? decoded.programId : null,
      batteryLow:
        hasStatusFlag(decoded.flags, StatusFlag.BATTERY_LOW_VOLTAGE_WARNING) ||
        hasStatusFlag(decoded.flags, StatusFlag.BATTERY_LOW_VOLTAGE_SHUTDOWN),
      shuttingDown: hasStatusFlag(decoded.flags, StatusFlag.SHUTDOWN),
    };
    if (repl.phase !== 'off') {
      if (isRepl && this.#replStartSent) this.#replSeenRunning = true;
      else if (!programRunning && this.#replSeenRunning) {
        repl = { phase: 'off', ended: repl.phase === 'stopping' ? 'stopped' : 'ended' };
        this.#replStage = 'none';
      }
    }
    const phase = this.#snapshot.program.phase;
    let program = this.#snapshot.program;
    if (flags.userProgramRunning && (phase === 'starting' || phase === 'idle'))
      program = { phase: 'running' };
    if (!flags.userProgramRunning && (phase === 'running' || phase === 'stopping'))
      program = { phase: 'idle' };
    const previous = this.#snapshot.flags;
    if (
      program === this.#snapshot.program &&
      repl === this.#snapshot.repl &&
      previous.programRunning === flags.programRunning &&
      previous.userProgramRunning === flags.userProgramRunning &&
      previous.runningProgramId === flags.runningProgramId &&
      previous.batteryLow === flags.batteryLow &&
      previous.shuttingDown === flags.shuttingDown
    ) {
      this.#notifyWaiters();
      return;
    }
    this.#set({ ...this.#snapshot, program, flags, repl });
    this.#notifyWaiters();
  }

  /** The USB cable was pulled or the hub turned off: a running program keeps running. */
  #handleUsbLost(link: SerialLink): void {
    if (this.#usb !== link) return;
    const programWasRunning = this.#snapshot.flags.userProgramRunning;
    this.#attempt++;
    this.#usb = null;
    this.#queue = Promise.resolve();
    this.#set({
      link: {
        status: 'disconnected',
        deviceName: this.#usbName,
        reason: 'lost',
        programWasRunning,
      },
      program: { phase: 'idle' },
      flags: INITIAL_FLAGS,
      repl: REPL_OFF,
    });
    this.#notifyWaiters();
  }

  #releaseUsb(link: SerialLink): Promise<void> {
    if (this.#usb === link) this.#usb = null;
    this.#queue = Promise.resolve();
    return link.close();
  }

  readonly #handleDisconnected = (): void => {
    const device = this.#device;
    if (!device) return;
    const programWasRunning = this.#snapshot.flags.userProgramRunning;
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
      repl: REPL_OFF,
    });
    this.#notifyWaiters();
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

  #setRepl(repl: ReplState): void {
    this.#set({ ...this.#snapshot, repl });
  }

  #set(next: ConnectionSnapshot): void {
    this.#snapshot = next;
    for (const listener of [...this.#listeners]) listener(next);
    this.#notifyWaiters();
  }
}
