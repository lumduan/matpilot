/**
 * For tests: a SPIKE Prime hub on Pybricks v4.1 behind a Web Serial port, speaking the USB
 * protocol of ./serial-link.ts. It answers reads, runs commands through `onCommand`, and sends
 * events only while the port is open with DTR and the host has subscribed, as the firmware does.
 */
import { FrameSplitter, cobsDecode, cobsEncode } from './cobs';
import { InMessage, OutMessage, type SerialPortLike } from './serial-link';

export interface FakeHubOptions {
  readonly name?: string;
  readonly firmware?: string;
  readonly protocol?: string;
  /** 11 bytes, as over Bluetooth. */
  readonly capabilities?: Uint8Array;
  /** The status a command gets (0 = accepted); may send events through `hub`. */
  readonly onCommand?: (command: Uint8Array, hub: FakeSerialHub) => number | null;
  /** Answer reads and commands at all (false: a hub that never replies). */
  readonly answers?: boolean;
}

const text = (value: string) => new TextEncoder().encode(value);

/** maxWriteSize 512, MULTI_MPY_V6 and REPL, max program 256 KiB, 5 slots. */
export function fakeCapabilities(maxWriteSize = 512): Uint8Array {
  const bytes = new Uint8Array(11);
  const view = new DataView(bytes.buffer);
  view.setUint16(0, maxWriteSize, true);
  view.setUint32(2, 0b111, true);
  view.setUint32(6, 256 * 1024, true);
  bytes[10] = 5;
  return bytes;
}

export class FakeSerialHub implements SerialPortLike {
  readonly sent: { type: number; payload: Uint8Array }[] = [];
  opened = false;
  dtr = false;
  subscribed = false;
  #controller: ReadableStreamDefaultController<Uint8Array> | null = null;
  #readable: ReadableStream<Uint8Array> | null = null;
  #writable: WritableStream<Uint8Array> | null = null;
  readonly #listeners = new Set<() => void>();
  readonly #options: FakeHubOptions;

  constructor(options: FakeHubOptions = {}) {
    this.#options = options;
  }

  get readable(): ReadableStream<Uint8Array> | null {
    return this.#readable;
  }

  get writable(): WritableStream<Uint8Array> | null {
    return this.#writable;
  }

  async open(): Promise<void> {
    if (this.opened) throw new Error('already open');
    this.opened = true;
    this.#readable = new ReadableStream<Uint8Array>({
      start: (controller) => {
        this.#controller = controller;
      },
    });
    const splitter = new FrameSplitter((frame) => this.#handle(frame));
    this.#writable = new WritableStream<Uint8Array>({ write: (chunk) => splitter.push(chunk) });
  }

  async setSignals(signals: { dataTerminalReady?: boolean }): Promise<void> {
    if (signals.dataTerminalReady !== undefined) {
      this.dtr = signals.dataTerminalReady;
      if (!this.dtr) this.subscribed = false;
    }
  }

  async close(): Promise<void> {
    if (this.#readable?.locked || this.#writable?.locked) throw new Error('streams are locked');
    this.opened = false;
    this.dtr = false;
    this.subscribed = false;
    try {
      this.#controller?.close();
    } catch {
      // Already closed.
    }
  }

  addEventListener(_type: 'disconnect', listener: () => void): void {
    this.#listeners.add(listener);
  }

  removeEventListener(_type: 'disconnect', listener: () => void): void {
    this.#listeners.delete(listener);
  }

  /** The cable is pulled. */
  unplug(): void {
    this.opened = false;
    this.subscribed = false;
    try {
      this.#controller?.error(new Error('The device has been lost.'));
    } catch {
      // Already closed.
    }
    for (const listener of [...this.#listeners]) listener();
  }

  /** Sends an event (a Bluetooth notification's bytes) if the host may get it. */
  event(data: Uint8Array): void {
    if (this.opened && this.dtr && this.subscribed) this.#send(InMessage.Event, data);
  }

  /** Sends raw bytes, for frames split across reads. */
  raw(bytes: Uint8Array): void {
    this.#controller?.enqueue(bytes);
  }

  #send(type: number, payload: Uint8Array): void {
    this.#controller?.enqueue(cobsEncode(type, payload));
  }

  #handle(frame: Uint8Array): void {
    const decoded = cobsDecode(frame);
    if (!decoded) return;
    const { prefix, payload } = decoded;
    this.sent.push({ type: prefix, payload });
    if (this.#options.answers === false) return;
    if (prefix === OutMessage.Subscribe) {
      this.subscribed = payload[0] === 1;
      // The firmware sends the status at once when a host subscribes.
      if (this.subscribed) this.event(Uint8Array.of(0, 0, 0, 0, 0, 0));
    } else if (prefix === OutMessage.Read && payload.length >= 3) {
      const id = payload[1]! | (payload[2]! << 8);
      const value =
        payload[0] === 1 && id === 0x2a00
          ? text(this.#options.name ?? 'Pybricks Hub')
          : payload[0] === 1 && id === 0x2a26
            ? text(this.#options.firmware ?? 'v4.1.3')
            : payload[0] === 1 && id === 0x2a28
              ? text(this.#options.protocol ?? '1.7.0')
              : payload[0] === 2 && id === 0x0003
                ? (this.#options.capabilities ?? fakeCapabilities())
                : new Uint8Array(0);
      const reply = new Uint8Array(3 + value.length);
      reply.set(payload.slice(0, 3));
      reply.set(value, 3);
      this.#send(InMessage.ReadReply, reply);
    } else if (prefix === OutMessage.Command && payload.length >= 2) {
      const status = this.#options.onCommand ? this.#options.onCommand(payload.slice(1), this) : 0;
      if (status === null) return;
      this.#send(InMessage.Response, Uint8Array.of(payload[0]!, status & 0xff, 0, 0, 0));
    }
  }
}
