'use client';

import type { LiveDevices } from '@/hooks/useLiveDevices';
import {
  deviceName,
  LIVE_PORTS,
  type LiveDevice,
  type LivePort,
  type LiveReading,
} from '@/lib/devices/live';

const COLOR_NAMES: Record<string, string> = {
  RED: 'red',
  YELLOW: 'yellow',
  GREEN: 'green',
  BLUE: 'blue',
  WHITE: 'white',
  NONE: 'no colour',
};

function statusMessage(live: LiveDevices): string | null {
  switch (live.status) {
    case 'connect':
      return 'Connect a hub to see what is plugged into each port, with live values.';
    case 'unsupported':
      return 'This hub’s firmware cannot show live values (it needs Pybricks protocol 1.4 or newer).';
    case 'off':
      return 'Live values are off.';
    case 'paused':
      return 'Paused while your program runs.';
    case 'starting':
      return live.snapshot.reading ? null : 'Reading the ports…';
    case 'live':
      return null;
    case 'stopped':
      return 'Live values were stopped on the hub.';
    case 'error':
      return `Live values stopped. ${live.error ?? ''}`.trim();
  }
}

/**
 * What is plugged into ports A to F, with live values, like the port view of the LEGO apps
 * (docs/adr/0009-live-device-values.md). Values show while the hub is idle; they pause while the
 * user's program runs, and the last values stay greyed out.
 */
export function DeviceBar({ live }: { live: LiveDevices }) {
  const reading = live.snapshot.reading;
  const fresh = live.status === 'live';
  const message = statusMessage(live);
  const canSwitch = live.status !== 'connect' && live.status !== 'unsupported';
  return (
    <section
      className="device-bar"
      aria-label="Live device values"
      data-testid="device-bar"
      data-status={live.status}
    >
      {canSwitch && (
        <label className="device-switch">
          <input
            type="checkbox"
            role="switch"
            checked={live.enabled}
            onChange={(event) => live.setEnabled(event.target.checked)}
          />
          <span>Live</span>
        </label>
      )}
      {reading && live.status !== 'connect' && live.status !== 'off' && (
        <ul className={fresh ? 'device-chips' : 'device-chips device-chips-stale'}>
          {LIVE_PORTS.map((port) => (
            <DeviceChip key={port} port={port} device={reading.ports[port]} />
          ))}
          <HubChip tilt={reading.tilt} />
        </ul>
      )}
      {message && (
        <p className="device-bar-message" role="status">
          {message}
          {(live.status === 'stopped' || live.status === 'error') && (
            <button type="button" className="button button-small" onClick={live.resume}>
              {live.status === 'stopped' ? 'Resume' : 'Try again'}
            </button>
          )}
        </p>
      )}
    </section>
  );
}

function describe(device: LiveDevice): { value: string; detail: string; label: string } {
  const name = deviceName(device.typeId);
  switch (device.kind) {
    case 'motor':
      return {
        value: `${device.angle}°`,
        detail: `${name} · ${device.speed}°/s`,
        label: `${name}, angle ${device.angle} degrees, speed ${device.speed} degrees per second`,
      };
    case 'color': {
      const color = device.color ? COLOR_NAMES[device.color] : 'unknown colour';
      return {
        value: color ?? 'unknown colour',
        detail: `${name} · ${device.reflection} %`,
        label: `${name}, sees ${color}, reflection ${device.reflection} percent`,
      };
    }
    case 'distance':
      return device.distance === null
        ? { value: 'nothing', detail: name, label: `${name}, nothing in range` }
        : {
            value: `${device.distance} mm`,
            detail: name,
            label: `${name}, ${device.distance} millimetres`,
          };
    case 'force':
      return {
        value: `${device.force.toFixed(1)} N`,
        detail: device.pressed ? `${name} · pressed` : name,
        label: `${name}, ${device.force.toFixed(1)} newtons${device.pressed ? ', pressed' : ''}`,
      };
    case 'other':
      return { value: '—', detail: name, label: `${name}, not read` };
  }
}

function DeviceChip({ port, device }: { port: LivePort; device: LiveDevice | null }) {
  if (!device) {
    return (
      <li className="device-chip device-chip-empty" aria-label={`Port ${port}: empty`}>
        <span className="device-port">{port}</span>
        <span className="device-text">
          <span className="device-value">empty</span>
        </span>
      </li>
    );
  }
  const { value, detail, label } = describe(device);
  return (
    <li
      className={`device-chip device-chip-${device.kind}`}
      aria-label={`Port ${port}: ${label}`}
      data-port={port}
    >
      <span className="device-port">{port}</span>
      {device.kind === 'color' ? (
        <span
          className={`device-swatch swatch-${(device.color ?? 'unknown').toLowerCase()}`}
          aria-hidden="true"
        />
      ) : (
        <DeviceIcon kind={device.kind} pressed={device.kind === 'force' && device.pressed} />
      )}
      <span className="device-text">
        <span className="device-value">{value}</span>
        <span className="device-detail">{detail}</span>
      </span>
    </li>
  );
}

function HubChip({ tilt }: { tilt: LiveReading['tilt'] }) {
  return (
    <li
      className="device-chip device-chip-hub"
      aria-label={`Hub tilt: pitch ${tilt.pitch} degrees, roll ${tilt.roll} degrees`}
    >
      <span className="device-port">Hub</span>
      <span className="device-text">
        <span className="device-value">
          {tilt.pitch}° / {tilt.roll}°
        </span>
        <span className="device-detail">tilt · pitch / roll</span>
      </span>
    </li>
  );
}

function DeviceIcon({ kind, pressed }: { kind: LiveDevice['kind']; pressed: boolean }) {
  const common = {
    className: 'device-icon',
    viewBox: '0 0 20 20',
    width: 20,
    height: 20,
    'aria-hidden': true,
    focusable: false,
  } as const;
  const stroke = {
    fill: 'none',
    stroke: 'currentColor',
    strokeWidth: 1.6,
    strokeLinecap: 'round',
    strokeLinejoin: 'round',
  } as const;
  switch (kind) {
    case 'motor':
      // A hub with a turning arrow.
      return (
        <svg {...common}>
          <circle cx="10" cy="10" r="2.2" {...stroke} />
          <path d="M16 10a6 6 0 1 1-2.2-4.6" {...stroke} />
          <path d="M14.4 2.8l-.6 2.6 2.6.5" {...stroke} />
        </svg>
      );
    case 'distance':
      // The sensor's two "eyes".
      return (
        <svg {...common}>
          <circle cx="6.5" cy="10" r="3" {...stroke} />
          <circle cx="13.5" cy="10" r="3" {...stroke} />
        </svg>
      );
    case 'force':
      // A button that fills when pressed.
      return (
        <svg {...common}>
          <rect x="4" y="9" width="12" height="7" rx="1.5" {...stroke} />
          <rect
            x="7"
            y={pressed ? '6.5' : '4'}
            width="6"
            height={pressed ? '2.5' : '5'}
            rx="1"
            fill={pressed ? 'currentColor' : 'none'}
            stroke="currentColor"
            strokeWidth="1.6"
          />
        </svg>
      );
    default:
      return (
        <svg {...common}>
          <rect x="4" y="4" width="12" height="12" rx="2" {...stroke} />
        </svg>
      );
  }
}
