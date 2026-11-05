/**
 * What the hub says is plugged into each port, from the live device values
 * (docs/adr/0009-live-device-values.md). The port pickers show it, and the simple blocks'
 * toolbox uses it to choose the ports of new blocks. Empty when no hub is connected.
 */
import { deviceName, LIVE_PORTS, type LiveReading } from '../../devices/live';
import type { PortName } from '../pybricks';

export type HintKind = 'motor' | 'color' | 'distance' | 'force' | 'other';

export interface PortHint {
  readonly kind: HintKind;
  /** For example "large motor". */
  readonly name: string;
}

/** By port: a device, `null` for an empty port; a port that is missing is unknown. */
export type PortHints = Readonly<Partial<Record<PortName, PortHint | null>>>;

export const NO_HINTS: PortHints = Object.freeze({});

let current: PortHints = NO_HINTS;

export function setPortHints(hints: PortHints): void {
  current = hints;
}

export function getPortHints(): PortHints {
  return current;
}

/**
 * What is plugged in, as a short string that only changes when a device does (the readings
 * themselves change several times a second): "A=motor:49 B=- ...", or "" without a reading.
 */
export function hintsKey(reading: LiveReading | null): string {
  if (!reading) return '';
  return LIVE_PORTS.map((port) => {
    const device = reading.ports[port];
    return `${port}=${device ? `${device.kind}:${device.typeId}` : '-'}`;
  }).join(' ');
}

const KINDS: readonly HintKind[] = ['motor', 'color', 'distance', 'force', 'other'];

/** The hints a key from `hintsKey` stands for. */
export function hintsFromKey(key: string): PortHints {
  if (key === '') return NO_HINTS;
  const hints: Partial<Record<PortName, PortHint | null>> = {};
  for (const part of key.split(' ')) {
    const match = /^([A-F])=(?:-|([a-z]+):(\d+))$/.exec(part);
    if (!match) continue;
    const port = match[1] as PortName;
    const kind = match[2] as HintKind | undefined;
    hints[port] =
      kind && KINDS.includes(kind) ? { kind, name: deviceName(Number(match[3])) } : null;
  }
  return hints;
}

export function hintsFromReading(reading: LiveReading | null): PortHints {
  return hintsFromKey(hintsKey(reading));
}

/** Ports with a device of this kind, in port order. */
export function portsWith(hints: PortHints, kind: HintKind): PortName[] {
  return LIVE_PORTS.filter((port) => hints[port]?.kind === kind);
}
