import { describe, expect, it, vi } from 'vitest';
import {
  DEVICE_INFORMATION_SERVICE_UUID,
  FIRMWARE_REVISION_CHAR_UUID,
  PYBRICKS_SERVICE_UUID,
  SOFTWARE_REVISION_CHAR_UUID,
} from '../pybricks/uuids';
import { HubProbe, type BluetoothLike, type HubProbeState } from './hub-probe';

// ---------------------------------------------------------------------------------------------
// Fakes for the Web Bluetooth objects. Characteristics also carry write/notify spies so the
// tests can prove the probe never calls them.
// ---------------------------------------------------------------------------------------------

function domError(name: string, message: string): Error {
  return Object.assign(new Error(message), { name });
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

class FakeCharacteristic {
  readonly writeValue = vi.fn();
  readonly writeValueWithResponse = vi.fn();
  readonly writeValueWithoutResponse = vi.fn();
  readonly startNotifications = vi.fn();
  readonly readValue: () => Promise<DataView>;

  constructor(read: () => Promise<DataView>) {
    this.readValue = vi.fn(read);
  }
}

class FakeDevice extends EventTarget {
  readonly gatt: FakeGattServer;
  constructor(
    readonly name: string | undefined,
    options: FakeGattOptions = {},
  ) {
    super();
    this.gatt = new FakeGattServer(this, options);
  }
  /** Simulates the hub turning off: the browser fires gattserverdisconnected. */
  dropLink(): void {
    this.gatt.connected = false;
    this.dispatchEvent(new Event('gattserverdisconnected'));
  }
}

interface FakeGattOptions {
  connect?: () => Promise<void>;
  hasDeviceInformation?: boolean;
  firmware?: () => Promise<DataView>;
  software?: () => Promise<DataView>;
}

function value(text: string): Promise<DataView> {
  const bytes = new TextEncoder().encode(text);
  return Promise.resolve(new DataView(bytes.buffer));
}

class FakeGattServer {
  connected = false;
  readonly characteristics = new Map<number, FakeCharacteristic>();
  readonly getPrimaryService = vi.fn(async (service: BluetoothServiceUUID) => {
    if (service !== DEVICE_INFORMATION_SERVICE_UUID || !this.options.hasDeviceInformation) {
      throw domError(
        'NotFoundError',
        `No Services matching UUID ${String(service)} found in Device.`,
      );
    }
    return {
      getCharacteristic: async (uuid: BluetoothCharacteristicUUID) => {
        const characteristic = this.characteristics.get(uuid as number);
        if (!characteristic) throw domError('NotFoundError', 'No Characteristics matching UUID');
        return characteristic;
      },
    };
  });
  readonly disconnect = vi.fn(() => {
    const wasConnected = this.connected;
    this.connected = false;
    // Like browsers, disconnect() fires gattserverdisconnected when a link was up.
    if (wasConnected) this.device.dispatchEvent(new Event('gattserverdisconnected'));
  });

  constructor(
    private readonly device: FakeDevice,
    private readonly options: FakeGattOptions,
  ) {
    this.options = { hasDeviceInformation: true, ...options };
    this.characteristics.set(
      FIRMWARE_REVISION_CHAR_UUID,
      new FakeCharacteristic(options.firmware ?? (() => value('4.0.1'))),
    );
    this.characteristics.set(
      SOFTWARE_REVISION_CHAR_UUID,
      new FakeCharacteristic(options.software ?? (() => value('1.5.0'))),
    );
  }

  async connect(): Promise<FakeGattServer> {
    await (this.options.connect?.() ?? Promise.resolve());
    this.connected = true;
    return this;
  }
}

function fakeBluetooth(result: () => Promise<FakeDevice>) {
  const requestDevice = vi.fn(result);
  return { bluetooth: { requestDevice } as BluetoothLike, requestDevice };
}

function recordStates(probe: HubProbe): HubProbeState['status'][] {
  const seen: HubProbeState['status'][] = [];
  probe.subscribe((state) => seen.push(state.status));
  return seen;
}

function expectNoWrites(device: FakeDevice): void {
  for (const characteristic of device.gatt.characteristics.values()) {
    expect(characteristic.writeValue).not.toHaveBeenCalled();
    expect(characteristic.writeValueWithResponse).not.toHaveBeenCalled();
    expect(characteristic.writeValueWithoutResponse).not.toHaveBeenCalled();
    expect(characteristic.startNotifications).not.toHaveBeenCalled();
  }
}

// ---------------------------------------------------------------------------------------------

describe('HubProbe.connect', () => {
  it('asks only for Pybricks hubs, with the Device Information service as optional', async () => {
    const device = new FakeDevice('Pybricks Hub');
    const { bluetooth, requestDevice } = fakeBluetooth(async () => device);
    await new HubProbe(bluetooth).connect();
    expect(requestDevice).toHaveBeenCalledWith({
      filters: [{ services: [PYBRICKS_SERVICE_UUID] }],
      optionalServices: [DEVICE_INFORMATION_SERVICE_UUID],
    });
  });

  it('reads the name, firmware revision and protocol version', async () => {
    const device = new FakeDevice('Pybricks Hub');
    const probe = new HubProbe(fakeBluetooth(async () => device).bluetooth);
    const states = recordStates(probe);

    await probe.connect();

    expect(states).toEqual(['requesting', 'connecting', 'connected']);
    expect(probe.getState()).toEqual({
      status: 'connected',
      hub: {
        name: 'Pybricks Hub',
        firmwareRevision: '4.0.1',
        firmwareVersion: { major: 4, minor: 0, patch: 1, prerelease: null },
        protocolRevision: '1.5.0',
        protocolVersion: { major: 1, minor: 5, patch: 0 },
      },
    });
  });

  it('never writes to the hub or subscribes to notifications', async () => {
    const device = new FakeDevice('Pybricks Hub');
    const probe = new HubProbe(fakeBluetooth(async () => device).bluetooth);
    await probe.connect();
    probe.disconnect();
    expectNoWrites(device);
  });

  it('keeps unparseable revision strings verbatim', async () => {
    const device = new FakeDevice('Hub', {
      firmware: () => value('weird'),
      software: () => value(''),
    });
    const probe = new HubProbe(fakeBluetooth(async () => device).bluetooth);
    await probe.connect();
    const state = probe.getState();
    expect(state.status).toBe('connected');
    if (state.status !== 'connected') return;
    expect(state.hub.firmwareRevision).toBe('weird');
    expect(state.hub.firmwareVersion).toBeNull();
    expect(state.hub.protocolVersion).toBeNull();
  });

  it('reports a hub without a name as null', async () => {
    const device = new FakeDevice('   ');
    const probe = new HubProbe(fakeBluetooth(async () => device).bluetooth);
    await probe.connect();
    const state = probe.getState();
    expect(state.status === 'connected' && state.hub.name).toBeNull();
  });

  it('ignores a second connect while one is in progress', async () => {
    const gate = deferred<FakeDevice>();
    const { bluetooth, requestDevice } = fakeBluetooth(() => gate.promise);
    const probe = new HubProbe(bluetooth);
    const first = probe.connect();
    await probe.connect();
    gate.resolve(new FakeDevice('Hub'));
    await first;
    expect(requestDevice).toHaveBeenCalledOnce();
    expect(probe.getState().status).toBe('connected');
  });

  it('reports a missing Web Bluetooth API as an error instead of throwing', async () => {
    const probe = new HubProbe(() => undefined);
    await expect(probe.connect()).resolves.toBeUndefined();
    const state = probe.getState();
    expect(state.status === 'error' && state.error.kind).toBe('api-unavailable');
  });
});

describe('HubProbe device picker outcomes', () => {
  it('treats a cancelled picker as "no hub selected", not an error', async () => {
    const probe = new HubProbe(
      fakeBluetooth(() =>
        Promise.reject(domError('NotFoundError', 'User cancelled the requestDevice() chooser.')),
      ).bluetooth,
    );
    await probe.connect();
    expect(probe.getState()).toEqual({ status: 'no-device-selected' });
  });

  it('reports a missing adapter as an error', async () => {
    const probe = new HubProbe(
      fakeBluetooth(() =>
        Promise.reject(domError('NotFoundError', 'Bluetooth adapter not available.')),
      ).bluetooth,
    );
    await probe.connect();
    const state = probe.getState();
    expect(state.status === 'error' && state.error.kind).toBe('bluetooth-unavailable');
  });

  it('reports a blocked request as an error', async () => {
    const probe = new HubProbe(
      fakeBluetooth(() =>
        Promise.reject(domError('SecurityError', 'Must be handling a user gesture.')),
      ).bluetooth,
    );
    await probe.connect();
    const state = probe.getState();
    expect(state.status === 'error' && state.error.kind).toBe('blocked');
  });

  it('can connect again after a cancelled picker', async () => {
    const device = new FakeDevice('Hub');
    const requestDevice = vi
      .fn()
      .mockRejectedValueOnce(
        domError('NotFoundError', 'User cancelled the requestDevice() chooser.'),
      )
      .mockResolvedValueOnce(device);
    const probe = new HubProbe({ requestDevice });
    await probe.connect();
    await probe.connect();
    expect(probe.getState().status).toBe('connected');
  });
});

describe('HubProbe connection failures', () => {
  it('reports a failed GATT connection and releases the device', async () => {
    const device = new FakeDevice('Hub', {
      connect: () => Promise.reject(domError('NetworkError', 'Connection attempt failed.')),
    });
    const probe = new HubProbe(fakeBluetooth(async () => device).bluetooth);
    await probe.connect();
    const state = probe.getState();
    expect(state.status).toBe('error');
    if (state.status !== 'error') return;
    expect(state.error.kind).toBe('connect-failed');
    expect(state.error.detail).toBe('NetworkError: Connection attempt failed.');
    expect(state.deviceName).toBe('Hub');
  });

  it('explains a missing Device Information service', async () => {
    const device = new FakeDevice('Not Pybricks', { hasDeviceInformation: false });
    const probe = new HubProbe(fakeBluetooth(async () => device).bluetooth);
    await probe.connect();
    const state = probe.getState();
    expect(state.status).toBe('error');
    if (state.status !== 'error') return;
    expect(state.error.kind).toBe('read-failed');
    expect(state.error.message).toMatch(/Pybricks firmware/);
    expect(device.gatt.disconnect).toHaveBeenCalled();
  });

  it('reports a failed read', async () => {
    const device = new FakeDevice('Hub', {
      software: () => Promise.reject(domError('NotSupportedError', 'GATT operation failed.')),
    });
    const probe = new HubProbe(fakeBluetooth(async () => device).bluetooth);
    await probe.connect();
    const state = probe.getState();
    expect(state.status === 'error' && state.error.message).toMatch(/protocol version/);
  });
});

describe('HubProbe disconnection', () => {
  it('reports a user disconnect as "user", not as a lost connection', async () => {
    const device = new FakeDevice('Hub');
    const probe = new HubProbe(fakeBluetooth(async () => device).bluetooth);
    await probe.connect();
    probe.disconnect();
    expect(device.gatt.disconnect).toHaveBeenCalledOnce();
    expect(probe.getState()).toEqual({ status: 'disconnected', deviceName: 'Hub', reason: 'user' });
  });

  it('reports an unexpected disconnect (hub turned off) without throwing', async () => {
    const device = new FakeDevice('Hub');
    const probe = new HubProbe(fakeBluetooth(async () => device).bluetooth);
    await probe.connect();
    expect(() => device.dropLink()).not.toThrow();
    expect(probe.getState()).toEqual({
      status: 'disconnected',
      deviceName: 'Hub',
      reason: 'connection-lost',
    });
  });

  it('reports a link lost during setup and ignores the late read failure', async () => {
    const read = deferred<DataView>();
    const device = new FakeDevice('Hub', { firmware: () => read.promise });
    const probe = new HubProbe(fakeBluetooth(async () => device).bluetooth);
    const connecting = probe.connect();
    await vi.waitFor(() => expect(device.gatt.connected).toBe(true));

    device.dropLink();
    read.reject(domError('NetworkError', 'GATT Server is disconnected.'));
    await connecting;

    expect(probe.getState()).toEqual({
      status: 'disconnected',
      deviceName: 'Hub',
      reason: 'connection-lost-during-setup',
    });
  });

  it('abandons a connection in progress when the user disconnects', async () => {
    const gate = deferred<void>();
    const device = new FakeDevice('Hub', { connect: () => gate.promise });
    const probe = new HubProbe(fakeBluetooth(async () => device).bluetooth);
    const connecting = probe.connect();
    await vi.waitFor(() => expect(probe.getState().status).toBe('connecting'));

    probe.disconnect();
    gate.resolve();
    await connecting;

    expect(probe.getState()).toEqual({ status: 'disconnected', deviceName: 'Hub', reason: 'user' });
  });

  it('ignores events from a device it no longer holds', async () => {
    const first = new FakeDevice('First');
    const second = new FakeDevice('Second');
    const requestDevice = vi.fn().mockResolvedValueOnce(first).mockResolvedValueOnce(second);
    const probe = new HubProbe({ requestDevice });
    await probe.connect();
    probe.disconnect();
    await probe.connect();

    first.dropLink();
    expect(probe.getState().status).toBe('connected');
  });

  it('can reconnect after the link was lost', async () => {
    const device = new FakeDevice('Hub');
    const probe = new HubProbe(fakeBluetooth(async () => device).bluetooth);
    await probe.connect();
    device.dropLink();
    await probe.connect();
    expect(probe.getState().status).toBe('connected');
  });

  it('dispose() releases the hub and returns to idle', async () => {
    const device = new FakeDevice('Hub');
    const probe = new HubProbe(fakeBluetooth(async () => device).bluetooth);
    await probe.connect();
    probe.dispose();
    expect(device.gatt.disconnect).toHaveBeenCalled();
    expect(probe.getState()).toEqual({ status: 'idle' });
  });
});

describe('HubProbe subscriptions', () => {
  it('stops notifying after unsubscribe', async () => {
    const device = new FakeDevice('Hub');
    const probe = new HubProbe(fakeBluetooth(async () => device).bluetooth);
    const listener = vi.fn();
    const unsubscribe = probe.subscribe(listener);
    unsubscribe();
    await probe.connect();
    expect(listener).not.toHaveBeenCalled();
  });

  it('returns a stable state reference between changes', async () => {
    const probe = new HubProbe(fakeBluetooth(async () => new FakeDevice('Hub')).bluetooth);
    expect(probe.getState()).toBe(probe.getState());
    await probe.connect();
    expect(probe.getState()).toBe(probe.getState());
  });
});
