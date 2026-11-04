import { describe, expect, it, vi } from 'vitest';
import {
  DEVICE_INFORMATION_SERVICE_UUID,
  FIRMWARE_REVISION_CHAR_UUID,
  PYBRICKS_COMMAND_EVENT_CHAR_UUID,
  PYBRICKS_HUB_CAPABILITIES_CHAR_UUID,
  PYBRICKS_SERVICE_UUID,
  SOFTWARE_REVISION_CHAR_UUID,
} from '../pybricks/uuids';
import { HubConnection, type ControlBluetoothLike } from './hub-connection';

const encode = (text: string) => new DataView(new TextEncoder().encode(text).buffer);

/** u16 max write 20, flags (bit 1 = multi-mpy v6), u32 max program 1000, 5 slots. */
function capabilities(flags = 0b10, maxProgram = 1000): DataView {
  const out = new DataView(new ArrayBuffer(11));
  out.setUint16(0, 20, true);
  out.setUint32(2, flags, true);
  out.setUint32(6, maxProgram, true);
  out.setUint8(10, 5);
  return out;
}

function statusEvent(running: boolean): DataView {
  return new DataView(Uint8Array.of(0x00, running ? 1 << 6 : 0, 0, 0, 0, 0, 0).buffer);
}

class FakeControl extends EventTarget {
  value: DataView | null = null;
  readonly writes: number[][] = [];
  readonly startNotifications = vi.fn(() => Promise.resolve(this));
  readonly readValue = vi.fn(() => Promise.reject(new Error('not readable')));
  inFlight = 0;
  maxInFlight = 0;
  failWrites = false;
  /** Reacts to writes like the hub would (status reports). */
  onWrite: (bytes: number[]) => void = () => undefined;

  readonly writeValueWithResponse = vi.fn(async (value: BufferSource) => {
    this.inFlight++;
    this.maxInFlight = Math.max(this.maxInFlight, this.inFlight);
    await Promise.resolve();
    this.inFlight--;
    if (this.failWrites)
      throw Object.assign(new Error('GATT operation failed'), { name: 'NetworkError' });
    const bytes = Array.from(new Uint8Array(value as ArrayBuffer));
    this.writes.push(bytes);
    this.onWrite(bytes);
  });

  notify(value: DataView): void {
    this.value = value;
    this.dispatchEvent(new Event('characteristicvaluechanged'));
  }
}

class FakeDevice extends EventTarget {
  readonly control = new FakeControl();
  readonly link = { connected: false };
  readonly gatt;

  constructor(
    readonly name: string,
    options: { protocol?: string; caps?: DataView } = {},
  ) {
    super();
    const link = this.link;
    const read = (value: DataView) => ({ readValue: () => Promise.resolve(value) });
    const services: Record<string, Record<string, unknown>> = {
      [String(DEVICE_INFORMATION_SERVICE_UUID)]: {
        [String(FIRMWARE_REVISION_CHAR_UUID)]: read(encode('4.0.1')),
        [String(SOFTWARE_REVISION_CHAR_UUID)]: read(encode(options.protocol ?? '1.5.0')),
      },
      [PYBRICKS_SERVICE_UUID]: {
        [PYBRICKS_HUB_CAPABILITIES_CHAR_UUID]: read(options.caps ?? capabilities()),
        [PYBRICKS_COMMAND_EVENT_CHAR_UUID]: this.control,
      },
    };
    this.gatt = {
      get connected() {
        return link.connected;
      },
      connect: () => {
        link.connected = true;
        return Promise.resolve(this.gatt);
      },
      disconnect: vi.fn(() => {
        link.connected = false;
      }),
      getPrimaryService: (uuid: BluetoothServiceUUID) => {
        const chars = services[String(uuid)];
        if (!chars)
          return Promise.reject(Object.assign(new Error('no service'), { name: 'NotFoundError' }));
        return Promise.resolve({
          getCharacteristic: (c: BluetoothCharacteristicUUID) => {
            const found = chars[String(c)];
            return found
              ? Promise.resolve(found)
              : Promise.reject(
                  Object.assign(new Error('no characteristic'), { name: 'NotFoundError' }),
                );
          },
        });
      },
    };
  }

  dropLink(): void {
    this.link.connected = false;
    this.dispatchEvent(new Event('gattserverdisconnected'));
  }
}

function setup(options?: { protocol?: string; caps?: DataView }) {
  const device = new FakeDevice('Fast Hub', options);
  const bluetooth: ControlBluetoothLike = {
    requestDevice: vi.fn(() => Promise.resolve(device as never)),
  };
  // The fake hub reports "running" after START and "stopped" after STOP.
  device.control.onWrite = (bytes) => {
    if (bytes[0] === 0x01) queueMicrotask(() => device.control.notify(statusEvent(true)));
    if (bytes[0] === 0x00) queueMicrotask(() => device.control.notify(statusEvent(false)));
  };
  return { device, connection: new HubConnection(bluetooth), bluetooth };
}

const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

describe('HubConnection', () => {
  it('connects, reads info and capabilities, and starts notifications', async () => {
    const { device, connection } = setup();
    await connection.connect();
    const { link } = connection.getSnapshot();
    expect(link.status).toBe('ready');
    if (link.status !== 'ready') return;
    expect(link.hub).toMatchObject({
      name: 'Fast Hub',
      firmwareRevision: '4.0.1',
      protocolRevision: '1.5.0',
      capabilities: { maxWriteSize: 20, maxProgramSize: 1000, numSlots: 5 },
    });
    expect(device.control.startNotifications).toHaveBeenCalledOnce();
    expect(device.control.writes).toEqual([]);
  });

  it('refuses hubs whose protocol is too old or that lack the .mpy v6 format', async () => {
    for (const options of [{ protocol: '1.2.0' }, { caps: capabilities(0) }]) {
      const { device, connection } = setup(options);
      await connection.connect();
      const { link } = connection.getSnapshot();
      expect(link.status === 'error' ? link.error.kind : link.status).toBe('unsupported-firmware');
      expect(device.gatt.disconnect).toHaveBeenCalled();
    }
  });

  it('uploads in order, starts, and follows the running flag', async () => {
    const { device, connection } = setup();
    await connection.connect();
    const program = Uint8Array.from({ length: 33 }, (_, i) => i);
    const phases: string[] = [];
    connection.subscribe((snapshot) => phases.push(snapshot.program.phase));

    expect(await connection.run(program)).toEqual({ ok: true });
    await flush();

    expect(device.control.writes.map((write) => write[0])).toEqual([
      0x03, 0x04, 0x04, 0x04, 0x03, 0x01,
    ]);
    expect(device.control.writes.at(-2)).toEqual([0x03, 33, 0, 0, 0]);
    expect(device.control.maxInFlight).toBe(1);
    expect(phases).toContain('uploading');
    expect(connection.getSnapshot().program.phase).toBe('running');
    expect(connection.getSnapshot().flags.programRunning).toBe(true);

    expect(await connection.stop()).toBe(true);
    await flush();
    expect(device.control.writes.at(-1)).toEqual([0x00]);
    expect(connection.getSnapshot().program.phase).toBe('idle');
  });

  it('rejects programs that are too big, or a second run while one is running', async () => {
    const { connection } = setup({ caps: capabilities(0b10, 10) });
    await connection.connect();
    expect(await connection.run(new Uint8Array(11))).toEqual({
      ok: false,
      error: { kind: 'too-big', size: 11, max: 10 },
    });
    expect(await connection.run(new Uint8Array(4))).toEqual({ ok: true });
    await flush();
    expect(await connection.run(new Uint8Array(4))).toEqual({ ok: false, error: { kind: 'busy' } });
  });

  it('reports a failed write and returns to idle', async () => {
    const { device, connection } = setup();
    await connection.connect();
    device.control.failWrites = true;
    const result = await connection.run(new Uint8Array(4));
    expect(result).toMatchObject({ ok: false, error: { kind: 'write-failed' } });
    expect(connection.getSnapshot().program.phase).toBe('idle');
  });

  it('passes stdout bytes to listeners and sends stdin in chunks', async () => {
    const { device, connection } = setup();
    await connection.connect();
    const received: number[][] = [];
    connection.onOutput((bytes) => received.push(Array.from(bytes)));
    device.control.notify(new DataView(Uint8Array.of(0x01, 104, 105).buffer));
    expect(received).toEqual([[104, 105]]);

    expect(await connection.writeStdin('x'.repeat(25))).toBe(true);
    expect(device.control.writes.map((write) => write.length)).toEqual([20, 7]);
    expect(device.control.writes.every((write) => write[0] === 0x06)).toBe(true);
  });

  it('stops a running program before disconnecting', async () => {
    const { device, connection } = setup();
    await connection.connect();
    await connection.run(new Uint8Array(4));
    await flush();
    await connection.disconnect();
    expect(device.control.writes.at(-1)).toEqual([0x00]);
    expect(device.gatt.disconnect).toHaveBeenCalled();
    expect(connection.getSnapshot().link).toMatchObject({ status: 'disconnected', reason: 'user' });
  });

  it('reports a lost link and whether a program was still running on the hub', async () => {
    const { device, connection } = setup();
    await connection.connect();
    await connection.run(new Uint8Array(4));
    await flush();
    device.dropLink();
    expect(connection.getSnapshot().link).toEqual({
      status: 'disconnected',
      deviceName: 'Fast Hub',
      reason: 'lost',
      programWasRunning: true,
    });
    expect(await connection.stop()).toBe(false);
  });

  it('treats a closed picker as "no hub selected"', async () => {
    const bluetooth: ControlBluetoothLike = {
      requestDevice: () =>
        Promise.reject(Object.assign(new Error('User cancelled'), { name: 'NotFoundError' })),
    };
    const connection = new HubConnection(bluetooth);
    await connection.connect();
    expect(connection.getSnapshot().link.status).toBe('no-device-selected');
  });
});
