import { afterEach, describe, expect, it, vi } from 'vitest';
import { FakeSerialHub } from '../usb/fake-serial-hub';
import { OutMessage, type SerialLike } from '../usb/serial-link';
import { HubConnection } from './hub-connection';

const RUNNING = 1 << 6;
const status = (flags: number) => Uint8Array.of(0, flags, 0, 0, 0, 0, 0);
const tick = () => new Promise((resolve) => setTimeout(resolve, 0));

afterEach(() => vi.useRealTimers());

/** A hub that runs what it is sent: START sets the running flag, STOP clears it. */
function runningHub(options: ConstructorParameters<typeof FakeSerialHub>[0] = {}) {
  return new FakeSerialHub({
    onCommand: (command, hub) => {
      if (command[0] === 1) queueMicrotask(() => hub.event(status(RUNNING)));
      if (command[0] === 0) queueMicrotask(() => hub.event(status(0)));
      return 0;
    },
    ...options,
  });
}

function serialFor(hub: FakeSerialHub) {
  const requestPort = vi.fn(() => Promise.resolve(hub));
  const serial: SerialLike = { requestPort };
  return { serial, requestPort };
}

async function connected(hub: FakeSerialHub) {
  const { serial, requestPort } = serialFor(hub);
  const connection = new HubConnection(() => undefined, serial);
  await connection.connectUsb();
  return { connection, requestPort };
}

const commands = (hub: FakeSerialHub) =>
  hub.sent.filter((m) => m.type === OutMessage.Command).map((m) => [...m.payload.slice(1)]);

describe('a hub connection over USB', () => {
  it('picks a SPIKE Prime port, reads the hub and subscribes', async () => {
    const hub = runningHub({ name: 'Rover', firmware: 'v4.1.3' });
    const { connection, requestPort } = await connected(hub);
    expect(requestPort).toHaveBeenCalledWith({
      filters: [
        { usbVendorId: 0x0694, usbProductId: 0x0009 },
        { usbVendorId: 0x0694, usbProductId: 0x0010 },
      ],
    });
    const link = connection.getSnapshot().link;
    expect(link.status).toBe('ready');
    if (link.status !== 'ready') return;
    expect(link.hub).toMatchObject({
      via: 'usb',
      name: 'Rover',
      firmwareRevision: 'v4.1.3',
      protocolRevision: '1.7.0',
      supportsRepl: true,
    });
    expect(link.hub.capabilities.maxWriteSize).toBe(512);
    expect(hub.dtr && hub.subscribed).toBe(true);
    expect(connection.canUseUsb()).toBe(true);
  });

  it('uploads in 512-byte commands, runs, passes on the output, and stops', async () => {
    const hub = runningHub();
    const { connection } = await connected(hub);
    const output: string[] = [];
    connection.onOutput((bytes) => output.push(new TextDecoder().decode(bytes)));
    const program = Uint8Array.from({ length: 1200 }, (_, i) => i & 0xff);
    expect(await connection.run(program)).toEqual({ ok: true });
    const sent = commands(hub);
    // Meta 0, three RAM chunks of up to 507 bytes, meta with the size, then START.
    expect(sent.map((c) => c[0])).toEqual([3, 4, 4, 4, 3, 1]);
    expect(Math.max(...sent.map((c) => c.length))).toBe(512);
    const ram = sent.filter((c) => c[0] === 4).flatMap((c) => c.slice(5));
    expect(Uint8Array.from(ram)).toEqual(program);
    await tick();
    expect(connection.getSnapshot().program.phase).toBe('running');
    hub.event(Uint8Array.of(1, ...new TextEncoder().encode('hi\n')));
    await tick();
    expect(output).toEqual(['hi\n']);
    expect(await connection.stop()).toBe(true);
    await tick();
    expect(connection.getSnapshot().program.phase).toBe('idle');
  });

  it('stops a running program before it lets go of the hub', async () => {
    const hub = runningHub();
    const { connection } = await connected(hub);
    await connection.run(Uint8Array.of(1, 2, 3));
    await tick();
    await connection.disconnect();
    const types = hub.sent.map((m) => [m.type, m.payload[1] ?? m.payload[0]]);
    // STOP (command 0), then unsubscribe, then the port is closed.
    expect(types.slice(-2)).toEqual([
      [OutMessage.Command, 0],
      [OutMessage.Subscribe, 0],
    ]);
    expect(hub.opened).toBe(false);
    expect(connection.getSnapshot().link).toMatchObject({ status: 'disconnected', reason: 'user' });
  });

  it('says when the cable is pulled while a program runs', async () => {
    const hub = runningHub({ name: 'Rover' });
    const { connection } = await connected(hub);
    await connection.run(Uint8Array.of(1));
    await tick();
    hub.unplug();
    await tick();
    expect(connection.getSnapshot().link).toEqual({
      status: 'disconnected',
      deviceName: 'Rover',
      reason: 'lost',
      programWasRunning: true,
    });
    expect(await connection.stop()).toBe(false);
  });

  it('explains a closed picker, a browser without USB, and a hub that does not answer', async () => {
    const cancelled = new HubConnection(() => undefined, {
      requestPort: () =>
        Promise.reject(Object.assign(new Error('none'), { name: 'NotFoundError' })),
    });
    await cancelled.connectUsb();
    expect(cancelled.getSnapshot().link.status).toBe('no-device-selected');

    const none = new HubConnection(
      () => undefined,
      () => undefined,
    );
    expect(none.canUseUsb()).toBe(false);
    await none.connectUsb();
    expect(none.getSnapshot().link).toMatchObject({
      status: 'error',
      error: { kind: 'api-unavailable' },
    });

    vi.useFakeTimers();
    const silent = new FakeSerialHub({ answers: false });
    const quiet = new HubConnection(() => undefined, serialFor(silent).serial);
    const done = quiet.connectUsb();
    await vi.advanceTimersByTimeAsync(5100);
    await done;
    expect(quiet.getSnapshot().link).toMatchObject({
      status: 'error',
      error: { kind: 'read-failed', title: 'The hub did not answer over USB' },
    });
    await vi.advanceTimersByTimeAsync(500);
    expect(silent.opened).toBe(false);
  });

  it('refuses a hub whose protocol is older than USB', async () => {
    const hub = runningHub({ protocol: '1.5.0' });
    const { connection } = await connected(hub);
    expect(connection.getSnapshot().link).toMatchObject({
      status: 'error',
      error: { kind: 'unsupported-firmware' },
    });
  });
});
