import type { ConnectionSnapshot } from '@/lib/ble/hub-connection';

export function linkSummary(snapshot: ConnectionSnapshot): string {
  const { link } = snapshot;
  switch (link.status) {
    case 'idle':
      return 'Not connected.';
    case 'requesting':
      return 'Choose your hub in the browser’s list.';
    case 'no-device-selected':
      return 'No hub selected.';
    case 'connecting':
      return `Connecting to ${link.deviceName ?? 'the hub'}…`;
    case 'ready':
      return `Connected to ${link.hub.name ?? 'the hub'}${link.hub.via === 'usb' ? ' by USB' : ''} · Pybricks ${link.hub.firmwareRevision}`;
    case 'disconnected':
      return link.reason === 'lost' ? 'Connection lost.' : 'Disconnected.';
    case 'error':
      return `${link.error.title}. ${link.error.message}`;
  }
}

export function programSummary(snapshot: ConnectionSnapshot, compiling: boolean): string | null {
  if (compiling) return 'Compiling…';
  const { program } = snapshot;
  switch (program.phase) {
    case 'uploading':
      return `Sending to the hub… ${Math.round((program.sent / Math.max(1, program.total)) * 100)}%`;
    case 'starting':
      return 'Starting…';
    case 'running':
      return 'Running.';
    case 'stopping':
      return 'Stopping…';
    case 'idle':
      return null;
  }
}
