import { afterEach, describe, expect, it, vi } from 'vitest';
import { cobsEncode } from './cobs';
import { FakeSerialHub } from './fake-serial-hub';
import {
  InMessage,
  OutMessage,
  READ,
  SerialLink,
  UsbCommandError,
  UsbTimeoutError,
  decodeMessage,
  encodeCommand,
  encodeRead,
} from './serial-link';

const text = (bytes: Uint8Array) => new TextDecoder().decode(bytes);
const tick = () => new Promise((resolve) => setTimeout(resolve, 0));

afterEach(() => vi.useRealTimers());

async function open(hub: FakeSerialHub, timeoutMs?: number) {
  const events: Uint8Array[] = [];
  let lost = 0;
  const link = await SerialLink.open(
    hub,
    { onEvent: (data) => events.push(data), onLost: () => (lost += 1) },
    timeoutMs,
  );
  return { link, events, lost: () => lost };
}

describe('the USB messages', () => {
  it('put a tag before a command and a selector in a read', () => {
    expect(encodeCommand(7, Uint8Array.of(0))).toEqual(
      cobsEncode(OutMessage.Command, Uint8Array.of(7, 0)),
    );
    const reply = cobsEncode(InMessage.Response, Uint8Array.of(7, 0x81, 0, 0, 0)).slice(0, -1);
    expect(decodeMessage(reply)).toEqual({ type: 'response', tag: 7, status: 0x81 });
    const read = cobsEncode(InMessage.ReadReply, Uint8Array.of(1, 0x26, 0x2a, 0x76, 0x34)).slice(
      0,
      -1,
    );
    expect(decodeMessage(read)).toEqual({
      type: 'read-reply',
      selector: { service: 1, id: 0x2a26 },
      value: Uint8Array.of(0x76, 0x34),
    });
    expect(encodeRead(READ.capabilities)).toEqual(
      cobsEncode(OutMessage.Read, Uint8Array.of(2, 3, 0)),
    );
  });
});

describe('a USB link to a hub', () => {
  it('opens with DTR, reads the hub, subscribes, and gets events', async () => {
    const hub = new FakeSerialHub({ name: 'Rover', firmware: 'v4.1.3' });
    const { link, events } = await open(hub);
    expect(hub.dtr).toBe(true);
    expect(text(await link.read(READ.name))).toBe('Rover');
    expect(text(await link.read(READ.firmwareRevision))).toBe('v4.1.3');
    expect(text(await link.read(READ.protocolRevision))).toBe('1.7.0');
    expect((await link.read(READ.capabilities)).length).toBe(11);
    expect(await link.read({ service: 2, id: 0x0099 })).toEqual(new Uint8Array(0));
    hub.event(Uint8Array.of(0, 1)); // before subscribing: not sent
    await link.subscribe(true);
    await tick();
    hub.event(Uint8Array.of(1, 0x68, 0x69));
    await tick();
    expect(events).toEqual([Uint8Array.of(0, 0, 0, 0, 0, 0), Uint8Array.of(1, 0x68, 0x69)]);
    await link.close();
    expect(hub.opened).toBe(false);
    expect(hub.sent.at(-1)).toEqual({ type: OutMessage.Subscribe, payload: Uint8Array.of(0) });
  });

  it('sends commands one at a time with their tags, and says when the hub refuses one', async () => {
    const hub = new FakeSerialHub({ onCommand: (command) => (command[0] === 6 ? 0x81 : 0) });
    const { link } = await open(hub);
    await Promise.all([link.command(Uint8Array.of(0)), link.command(Uint8Array.of(1))]);
    expect(
      hub.sent.filter((m) => m.type === OutMessage.Command).map((m) => [...m.payload]),
    ).toEqual([
      [0, 0],
      [1, 1],
    ]);
    await expect(link.command(Uint8Array.of(6, 0x41))).rejects.toBeInstanceOf(UsbCommandError);
    await link.close();
  });

  it('reads frames split across pieces, with events in between', async () => {
    let events = 0;
    const hub = new FakeSerialHub({
      onCommand: (_, h) => {
        // An event before the reply, and the reply in two pieces.
        h.event(Uint8Array.of(1, 0x41));
        return 0;
      },
    });
    const opened = await open(hub);
    await opened.link.subscribe(true);
    await opened.link.command(Uint8Array.of(0));
    events = opened.events.length;
    expect(events).toBe(2);
    const frame = cobsEncode(InMessage.Event, Uint8Array.of(1, 0x42, 0x43));
    hub.raw(frame.slice(0, 2));
    hub.raw(frame.slice(2));
    await tick();
    expect(opened.events.at(-1)).toEqual(Uint8Array.of(1, 0x42, 0x43));
    await opened.link.close();
  });

  it('gives up on a hub that does not answer, and goes on with the next request', async () => {
    const hub = new FakeSerialHub({ onCommand: (command) => (command[0] === 0 ? null : 0) });
    const { link } = await open(hub, 50);
    await expect(link.command(Uint8Array.of(0))).rejects.toBeInstanceOf(UsbTimeoutError);
    await expect(link.command(Uint8Array.of(1))).resolves.toBeUndefined();
    await link.close();
  });

  it('says when the cable is pulled, and fails what was waiting', async () => {
    const hub = new FakeSerialHub({ answers: false });
    const { link, lost } = await open(hub, 1000);
    const pending = link.read(READ.name);
    hub.unplug();
    await tick();
    expect(lost()).toBe(1);
    await expect(pending).rejects.toThrow();
    await expect(link.command(Uint8Array.of(0))).rejects.toThrow('closed');
  });
});
