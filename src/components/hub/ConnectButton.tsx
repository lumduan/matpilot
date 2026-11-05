'use client';

import type { ConnectionSnapshot } from '@/lib/ble/hub-connection';

/** A compact Connect button for a top bar; once connected, the hub's name and Disconnect. */
export function ConnectButton({
  connection,
  onConnect,
  onDisconnect,
}: {
  connection: ConnectionSnapshot;
  onConnect: () => void;
  onDisconnect: () => void;
}) {
  const { link } = connection;
  if (link.status === 'ready') {
    return (
      <div className="hub-pill" data-testid="link-status" data-status={link.status}>
        <span className="hub-pill-dot" aria-hidden="true" />
        <span className="hub-pill-name" title={`Pybricks ${link.hub.firmwareRevision}`}>
          {link.hub.name ?? 'Hub'}
        </span>
        <button type="button" className="button button-small" onClick={onDisconnect}>
          Disconnect
        </button>
      </div>
    );
  }
  const busy = link.status === 'requesting' || link.status === 'connecting';
  return (
    <div className="hub-pill-wrap" data-testid="link-status" data-status={link.status}>
      <button type="button" className="button button-connect" onClick={onConnect} disabled={busy}>
        <BluetoothIcon />
        {busy ? 'Connecting…' : 'Connect hub'}
      </button>
      {link.status === 'connecting' && (
        <button type="button" className="button button-small" onClick={onDisconnect}>
          Cancel
        </button>
      )}
    </div>
  );
}

function BluetoothIcon() {
  return (
    <svg
      className="button-icon"
      viewBox="0 0 16 16"
      width="16"
      height="16"
      aria-hidden="true"
      focusable="false"
    >
      <path
        d="M4.5 4.75 11 10.5 7.75 13.25V2.75L11 5.5 4.5 11.25"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
