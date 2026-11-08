/**
 * The Pybricks USB link (docs/protocol/pybricks-usb.md, docs/adr/0018-usb-connection.md): from
 * Pybricks v4.1.0 a SPIKE Prime hub is a USB serial port (CDC ACM), so the page reaches it with
 * Web Serial. Each message is a COBS frame (./cobs.ts) whose first byte is its type; commands and
 * events inside are the same bytes as over Bluetooth (src/lib/pybricks/protocol.ts).
 *
 * Pybricks facts, cited at pybricks-micropython v4.1.3, commit
 * c860b6a00301fb7c6ecd429da11dcb5a6c557c7a ("FW" below = https://github.com/pybricks/pybricks-micropython/blob/c860b6a00301fb7c6ecd429da11dcb5a6c557c7a/):
 * - the message types, both ways: FW lib/pbio/include/pbio/protocol.h#L589-L656
 * - the read services and the ids read here: FW lib/pbio/include/pbio/protocol.h#L542-L575 and
 *   lib/pbio/sys/host.c#L201-L234 (the hub capabilities are Pybricks id 0x0003)
 * - how the hub handles each message, and that a reply echoes the command's tag or the read's
 *   selector: FW lib/pbio/src/serial.c#L253-L323
 * - events need the port open with DTR and a subscription; dropping DTR ends it:
 *   FW lib/pbio/src/serial.c#L184-L245
 * - the hub keeps one command reply and one read reply at a time, so requests go one by one:
 *   FW lib/pbio/src/serial.c#L380-L438
 * - the vendor and product ids: FW lib/lego/lego/usb.h#L12-L28 and
 *   lib/pbio/platform/prime_hub_f4/pbdrvconfig.h#L133-L141
 *
 * Web Serial (WICG spec, commit 418b5afa699646664f1548161cf6deab43adb0db, index.bs):
 * requestPort() with USB id filters (#L60-L140, #L202-L211), open({ baudRate }) (#L321, #L533),
 * setSignals({ dataTerminalReady }) (#L322, #L1007), readable and writable (#L316-L317), close()
 * (#L324), and the port's disconnect event (#L314).
 */
import { FrameSplitter, cobsEncode, cobsDecode, COBS_DELIMITER } from './cobs';

export const LEGO_USB_VENDOR_ID = 0x0694;
/** SPIKE Prime, both electronics (FW lib/lego/lego/usb.h#L22). */
export const SPIKE_PRIME_PRODUCT_ID = 0x0009;
/** MINDSTORMS Robot Inventor, the same hub (FW lib/lego/lego/usb.h#L28). */
export const ROBOT_INVENTOR_PRODUCT_ID = 0x0010;

/** The ports the device picker lists: hubs running Pybricks, not their update mode. */
export const USB_PORT_FILTERS = [
  { usbVendorId: LEGO_USB_VENDOR_ID, usbProductId: SPIKE_PRIME_PRODUCT_ID },
  { usbVendorId: LEGO_USB_VENDOR_ID, usbProductId: ROBOT_INVENTOR_PRODUCT_ID },
] as const;

/** Host to hub (FW protocol.h#L618-L656). */
export const OutMessage = { Subscribe: 1, Command: 2, Read: 3 } as const;
/** Hub to host (FW protocol.h#L589-L616). */
export const InMessage = { Response: 1, Event: 2, ReadReply: 3 } as const;

/** What a read asks for: a service (GATT or Pybricks) and a 16-bit id (FW protocol.h#L542-L575). */
export interface ReadSelector {
  readonly service: 1 | 2;
  readonly id: number;
}

export const READ = {
  name: { service: 1, id: 0x2a00 },
  firmwareRevision: { service: 1, id: 0x2a26 },
  /** The Pybricks protocol version, as over Bluetooth's Software Revision. */
  protocolRevision: { service: 1, id: 0x2a28 },
  capabilities: { service: 2, id: 0x0003 },
} as const satisfies Record<string, ReadSelector>;

/** The baud rate is ignored on this USB port; open() only needs a valid one. */
const BAUD_RATE = 115200;
/** How long a command or a read may take to be answered (pybricks-tools waits 5 s too). */
export const USB_REQUEST_TIMEOUT_MS = 5000;

// ---------------------------------------------------------------------------------------------
// Minimal views of the Web Serial objects this module uses
// ---------------------------------------------------------------------------------------------

export interface SerialPortLike {
  open(options: { baudRate: number }): Promise<void>;
  setSignals(signals: { dataTerminalReady?: boolean }): Promise<void>;
  close(): Promise<void>;
  readonly readable: ReadableStream<Uint8Array> | null;
  readonly writable: WritableStream<Uint8Array> | null;
  addEventListener(type: 'disconnect', listener: () => void): void;
  removeEventListener(type: 'disconnect', listener: () => void): void;
}

export interface SerialLike {
  requestPort(options?: {
    filters?: readonly { usbVendorId?: number; usbProductId?: number }[];
  }): Promise<SerialPortLike>;
}

/** The hub answered a command with an error (FW protocol.h#L223-L250: 0x80 invalid, 0x81 busy). */
export class UsbCommandError extends Error {
  constructor(readonly status: number) {
    super(`The hub refused the command (error 0x${status.toString(16)}).`);
  }
}

export class UsbTimeoutError extends Error {
  constructor(what: string) {
    super(`The hub did not answer ${what} over USB in time.`);
  }
}

export function encodeSubscribe(on: boolean): Uint8Array {
  return cobsEncode(OutMessage.Subscribe, Uint8Array.of(on ? 1 : 0));
}

export function encodeCommand(tag: number, command: Uint8Array): Uint8Array {
  const payload = new Uint8Array(command.length + 1);
  payload[0] = tag & 0xff;
  payload.set(command, 1);
  return cobsEncode(OutMessage.Command, payload);
}

export function encodeRead({ service, id }: ReadSelector): Uint8Array {
  return cobsEncode(OutMessage.Read, Uint8Array.of(service, id & 0xff, (id >> 8) & 0xff));
}

/** A message from the hub, or `null` for one MatPilot does not know. */
export type HubMessage =
  | { readonly type: 'response'; readonly tag: number; readonly status: number }
  | { readonly type: 'event'; readonly data: Uint8Array }
  | { readonly type: 'read-reply'; readonly selector: ReadSelector; readonly value: Uint8Array };

export function decodeMessage(frame: Uint8Array): HubMessage | null {
  const decoded = cobsDecode(frame);
  if (!decoded) return null;
  const { prefix, payload } = decoded;
  if (prefix === InMessage.Response && payload.length >= 5) {
    const status =
      (payload[1]! | (payload[2]! << 8) | (payload[3]! << 16) | (payload[4]! << 24)) >>> 0;
    return { type: 'response', tag: payload[0]!, status };
  }
  if (prefix === InMessage.Event && payload.length >= 1) return { type: 'event', data: payload };
  if (prefix === InMessage.ReadReply && payload.length >= 3) {
    const service = payload[0]!;
    if (service !== 1 && service !== 2) return null;
    return {
      type: 'read-reply',
      selector: { service, id: payload[1]! | (payload[2]! << 8) },
      value: payload.slice(3),
    };
  }
  return null;
}

type Waiting =
  | { readonly kind: 'command'; readonly tag: number; readonly done: (status: number) => void }
  | {
      readonly kind: 'read';
      readonly selector: ReadSelector;
      readonly done: (value: Uint8Array) => void;
    };

export interface SerialLinkHandlers {
  /** A Pybricks event: the same bytes as a Bluetooth notification. */
  readonly onEvent: (data: Uint8Array) => void;
  /** The port went away (cable pulled, hub off), not by close(). */
  readonly onLost: () => void;
}

/** An open USB link to a hub. One request at a time; events arrive in between. */
export class SerialLink {
  readonly #port: SerialPortLike;
  readonly #handlers: SerialLinkHandlers;
  readonly #writer: WritableStreamDefaultWriter<Uint8Array>;
  #reader: ReadableStreamDefaultReader<Uint8Array> | null = null;
  #waiting: Waiting | null = null;
  #queue: Promise<unknown> = Promise.resolve();
  #tag = 0;
  #closed = false;
  readonly #timeoutMs: number;

  private constructor(port: SerialPortLike, handlers: SerialLinkHandlers, timeoutMs: number) {
    this.#port = port;
    this.#handlers = handlers;
    this.#timeoutMs = timeoutMs;
    if (!port.writable) throw new Error('The USB port cannot be written to.');
    this.#writer = port.writable.getWriter();
  }

  /**
   * Opens the port and asserts DTR, which tells the hub a host is there. Then sends a lone
   * delimiter, so a half-received frame from before cannot spoil the first message (the
   * firmware's own host tool does the same: FW tools/flash/serdev/pybricks.py#L91-L94).
   */
  static async open(
    port: SerialPortLike,
    handlers: SerialLinkHandlers,
    timeoutMs = USB_REQUEST_TIMEOUT_MS,
  ): Promise<SerialLink> {
    await port.open({ baudRate: BAUD_RATE });
    try {
      await port.setSignals({ dataTerminalReady: true });
      const link = new SerialLink(port, handlers, timeoutMs);
      port.addEventListener('disconnect', link.#handleDisconnect);
      link.#startReading();
      await link.#writer.write(Uint8Array.of(COBS_DELIMITER));
      return link;
    } catch (error) {
      await port.close().catch(() => undefined);
      throw error;
    }
  }

  /** Reads a characteristic; an empty value means the hub does not know it. */
  read(selector: ReadSelector): Promise<Uint8Array> {
    return this.#request<Uint8Array>(
      (done) => ({ kind: 'read', selector, done }),
      encodeRead(selector),
      `the read of 0x${selector.id.toString(16)}`,
    );
  }

  /** Sends one Pybricks command; resolves once the hub accepted it. */
  async command(command: Uint8Array): Promise<void> {
    const tag = this.#tag;
    this.#tag = (this.#tag + 1) & 0xff;
    const status = await this.#request<number>(
      (done) => ({ kind: 'command', tag, done }),
      encodeCommand(tag, command),
      'a command',
    );
    if (status !== 0) throw new UsbCommandError(status);
  }

  /** Starts or stops the events (the hub has no reply for this). */
  subscribe(on: boolean): Promise<void> {
    const run = this.#queue.then(() => this.#writer.write(encodeSubscribe(on)));
    this.#queue = run.catch(() => undefined);
    return run;
  }

  /** Unsubscribes, which hands the hub back, then closes the port (best effort, never rejects). */
  async close(): Promise<void> {
    if (this.#closed) return;
    try {
      await Promise.race([this.subscribe(false), wait(300)]);
    } catch {
      // The port may already be gone.
    }
    await this.#shutDown();
  }

  #request<T>(
    make: (done: (value: T) => void) => Waiting,
    frame: Uint8Array,
    what: string,
  ): Promise<T> {
    const run = this.#queue.then(
      () =>
        new Promise<T>((resolve, reject) => {
          if (this.#closed) {
            reject(new Error('The USB link is closed.'));
            return;
          }
          const timer = setTimeout(() => {
            if (this.#waiting === waiting) this.#waiting = null;
            reject(new UsbTimeoutError(what));
          }, this.#timeoutMs);
          const waiting = make((value: T) => {
            clearTimeout(timer);
            resolve(value);
          });
          this.#waiting = waiting;
          this.#writer.write(frame).catch((error: unknown) => {
            clearTimeout(timer);
            if (this.#waiting === waiting) this.#waiting = null;
            reject(error);
          });
        }),
    );
    this.#queue = run.catch(() => undefined);
    return run;
  }

  #startReading(): void {
    const readable = this.#port.readable;
    if (!readable) throw new Error('The USB port cannot be read.');
    const reader = readable.getReader();
    this.#reader = reader;
    const splitter = new FrameSplitter((frame) => this.#handleFrame(frame));
    void (async () => {
      try {
        for (;;) {
          const { value, done } = await reader.read();
          if (done) break;
          if (value) splitter.push(value);
        }
      } catch {
        // The port went away; handled below.
      }
      if (!this.#closed) await this.#lose();
    })();
  }

  #handleFrame(frame: Uint8Array): void {
    const message = decodeMessage(frame);
    if (!message) return;
    if (message.type === 'event') {
      this.#handlers.onEvent(message.data);
      return;
    }
    const waiting = this.#waiting;
    // A late reply to a request that timed out has nobody waiting: dropped.
    if (!waiting) return;
    if (message.type === 'response' && waiting.kind === 'command' && message.tag === waiting.tag) {
      this.#waiting = null;
      waiting.done(message.status);
    } else if (
      message.type === 'read-reply' &&
      waiting.kind === 'read' &&
      message.selector.service === waiting.selector.service &&
      message.selector.id === waiting.selector.id
    ) {
      this.#waiting = null;
      waiting.done(message.value);
    }
  }

  readonly #handleDisconnect = (): void => {
    if (!this.#closed) void this.#lose();
  };

  async #lose(): Promise<void> {
    if (this.#closed) return;
    await this.#shutDown();
    this.#handlers.onLost();
  }

  async #shutDown(): Promise<void> {
    this.#closed = true;
    this.#port.removeEventListener('disconnect', this.#handleDisconnect);
    this.#waiting = null;
    try {
      await this.#reader?.cancel();
    } catch {
      // Already closed.
    }
    try {
      this.#reader?.releaseLock();
    } catch {
      // Already released.
    }
    try {
      this.#writer.releaseLock();
    } catch {
      // A write is still pending; close() below ends it.
    }
    // Closing drops DTR, which also ends the subscription on the hub (FW serial.c#L212-L217).
    await this.#port.close().catch(() => undefined);
  }
}

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
