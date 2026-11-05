import { describe, expect, it, vi } from 'vitest';
import {
  DEVICE_INFORMATION_SERVICE_UUID,
  FIRMWARE_REVISION_CHAR_UUID,
  PYBRICKS_COMMAND_EVENT_CHAR_UUID,
  PYBRICKS_HUB_CAPABILITIES_CHAR_UUID,
  PYBRICKS_SERVICE_UUID,
  SOFTWARE_REVISION_CHAR_UUID,
} from '../pybricks/uuids';
import { HubConnection, REPL_PROMPT_TIMEOUT_MS, type ControlBluetoothLike } from './hub-connection';

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

// ---------------------------------------------------------------------------------------------
// REPL sessions (live device values, ADR 0009)
// ---------------------------------------------------------------------------------------------

const REPL_BANNER =
  'Pybricks MicroPython v1.20.0 on 2024-01-01; SPIKE Prime Hub with STM32F413VG\r\n';
const PASTE_HEADER = '\r\npaste mode; Ctrl-C to cancel, Ctrl-D to finish\r\n=== ';

/**
 * A fake hub with MicroPython's friendly REPL: START with id 128 prints the prompt, Ctrl-E enters
 * paste mode, pasted bytes are echoed a little later (newlines as CR LF), Ctrl-D runs the paste.
 */
function replSetup(options: { caps?: DataView; protocol?: string; prompt?: boolean } = {}) {
  const device = new FakeDevice('Fast Hub', {
    caps: options.caps ?? capabilities(0b11),
    protocol: options.protocol,
  });
  const bluetooth: ControlBluetoothLike = {
    requestDevice: vi.fn(() => Promise.resolve(device as never)),
  };
  const bytes = (code: number, text: string) =>
    new DataView(Uint8Array.of(code, ...new TextEncoder().encode(text)).buffer);
  const stdout = (text: string) => device.control.notify(bytes(0x01, text));
  const status = (running: boolean, programId: number) =>
    device.control.notify(
      new DataView(Uint8Array.of(0x00, running ? 1 << 6 : 0, 0, 0, 0, programId, 0).buffer),
    );
  const state = { stage: 'idle', pasted: '', echoed: 0, maxAhead: 0 };
  device.control.onWrite = (write) => {
    const [command, ...data] = write;
    if (command === 0x01 && data[0] === 128) {
      state.stage = 'prompt';
      queueMicrotask(() => {
        status(true, 128);
        if (options.prompt !== false) stdout(`${REPL_BANNER}>>> `);
      });
    } else if (command === 0x01) {
      queueMicrotask(() => status(true, 0));
    } else if (command === 0x00) {
      state.stage = 'idle';
      queueMicrotask(() => status(false, 0));
    } else if (command === 0x06 && state.stage === 'prompt' && data[0] === 0x05) {
      state.stage = 'paste';
      queueMicrotask(() => stdout(PASTE_HEADER));
    } else if (command === 0x06 && state.stage === 'paste' && data[0] === 0x04) {
      state.stage = 'run';
      queueMicrotask(() => stdout('\r\n@mpv start 1\r\n'));
    } else if (command === 0x06 && state.stage === 'paste') {
      const text = String.fromCharCode(...data);
      state.pasted += text;
      state.maxAhead = Math.max(state.maxAhead, state.pasted.length - state.echoed);
      setTimeout(() => {
        state.echoed += text.length;
        stdout(text.replace(/\n/g, '\r\n'));
      }, 1);
    }
  };
  return { device, connection: new HubConnection(bluetooth), stdout, status, state };
}

const SOURCE = `print("hello")\n${'x = 1\n'.repeat(40)}\tif x:\n\t\tpass\n`;

describe('HubConnection REPL sessions', () => {
  it('pastes source into the REPL, paced by its echo, without touching the program slots', async () => {
    const { device, connection, state } = replSetup();
    await connection.connect();
    const replOutput: string[] = [];
    const programOutput: number[][] = [];
    connection.onReplOutput((data) => replOutput.push(new TextDecoder().decode(data)));
    connection.onOutput((data) => programOutput.push(Array.from(data)));

    expect(await connection.runInRepl(SOURCE)).toEqual({ ok: true });
    await flush();

    const writes = device.control.writes;
    expect(writes[0]).toEqual([0x01, 128]);
    expect(writes[1]).toEqual([0x06, 0x05]);
    expect(writes.at(-1)).toEqual([0x06, 0x04]);
    // Only START, stdin: nothing is uploaded to a slot.
    expect(new Set(writes.map((write) => write[0]))).toEqual(new Set([0x01, 0x06]));
    expect(state.pasted).toBe(SOURCE);
    expect(state.maxAhead).toBeLessThanOrEqual(60);
    expect(Math.max(...writes.map((write) => write.length))).toBeLessThanOrEqual(20);

    const snapshot = connection.getSnapshot();
    expect(snapshot.repl).toEqual({ phase: 'running' });
    expect(snapshot.flags).toMatchObject({
      programRunning: true,
      userProgramRunning: false,
      runningProgramId: 128,
    });
    expect(snapshot.program.phase).toBe('idle');
    expect(programOutput).toEqual([]);
    expect(replOutput.join('')).toContain('@mpv start 1');
  });

  it('stops the REPL before a user program is uploaded', async () => {
    const { device, connection } = replSetup();
    await connection.connect();
    await connection.runInRepl(SOURCE);
    await flush();
    const before = device.control.writes.length;

    expect(await connection.run(new Uint8Array(4))).toEqual({ ok: true });
    await flush();

    const after = device.control.writes.slice(before).map((write) => write[0]);
    expect(after).toEqual([0x00, 0x03, 0x04, 0x03, 0x01]);
    const snapshot = connection.getSnapshot();
    expect(snapshot.repl).toEqual({ phase: 'off', ended: 'stopped' });
    expect(snapshot.program.phase).toBe('running');
    expect(snapshot.flags.userProgramRunning).toBe(true);
  });

  it('notices when the REPL ends on the hub, and sends keep-alives only while it runs', async () => {
    const { device, connection, status } = replSetup();
    await connection.connect();
    expect(await connection.keepReplAlive()).toBe(false);
    await connection.runInRepl(SOURCE);
    await flush();
    expect(await connection.keepReplAlive()).toBe(true);
    expect(device.control.writes.at(-1)).toEqual([0x06, 0x2e]);

    status(false, 0);
    expect(connection.getSnapshot().repl).toEqual({ phase: 'off', ended: 'ended' });
    expect(await connection.keepReplAlive()).toBe(false);
  });

  it('stops a REPL session on request and refuses user stdin while one runs', async () => {
    const { device, connection } = replSetup();
    await connection.connect();
    await connection.runInRepl(SOURCE);
    await flush();
    expect(await connection.writeStdin('hello')).toBe(false);
    expect(await connection.stopRepl()).toBe(true);
    expect(device.control.writes.at(-1)).toEqual([0x00]);
    expect(connection.getSnapshot().repl).toEqual({ phase: 'off', ended: 'stopped' });
  });

  it('does not report a lost REPL session as a running program', async () => {
    const { device, connection } = replSetup();
    await connection.connect();
    await connection.runInRepl(SOURCE);
    await flush();
    device.dropLink();
    expect(connection.getSnapshot().link).toMatchObject({
      status: 'disconnected',
      reason: 'lost',
      programWasRunning: false,
    });
    expect(connection.getSnapshot().repl).toEqual({ phase: 'off', ended: null });
  });

  it('refuses hubs without the REPL or with protocol older than 1.4', async () => {
    const noRepl = replSetup({ caps: capabilities(0b10) });
    await noRepl.connection.connect();
    expect(await noRepl.connection.runInRepl(SOURCE)).toEqual({
      ok: false,
      error: { kind: 'unsupported' },
    });
    const old = replSetup({ protocol: '1.3.0' });
    await old.connection.connect();
    expect(await old.connection.runInRepl(SOURCE)).toEqual({
      ok: false,
      error: { kind: 'unsupported' },
    });
    expect(noRepl.device.control.writes).toEqual([]);
  });

  it('gives up when the prompt never comes, and stops what it started', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    try {
      const { device, connection } = replSetup({ prompt: false });
      await connection.connect();
      const pending = connection.runInRepl(SOURCE);
      await vi.advanceTimersByTimeAsync(REPL_PROMPT_TIMEOUT_MS + 10);
      expect(await pending).toEqual({ ok: false, error: { kind: 'timeout', stage: 'prompt' } });
      expect(connection.getSnapshot().repl).toEqual({ phase: 'off', ended: 'failed' });
      await vi.advanceTimersByTimeAsync(0);
      expect(device.control.writes.at(-1)).toEqual([0x00]);
    } finally {
      vi.useRealTimers();
    }
  });

  it('rejects source that is not plain ASCII text', async () => {
    const { connection } = replSetup();
    await connection.connect();
    await expect(connection.runInRepl('print("é")\n')).rejects.toThrow(/ASCII/);
  });
});
