'use client';

import type { ConnectionSnapshot } from '@/lib/ble/hub-connection';

/**
 * A compact Connect button for a top bar, with a USB button beside it when the browser can use a
 * cable (docs/adr/0018-usb-connection.md); once connected, the hub's name and Disconnect.
 */
export function ConnectButton({
  connection,
  onConnect,
  onConnectUsb,
  onDisconnect,
}: {
  connection: ConnectionSnapshot;
  onConnect: () => void;
  /** Shown only when given: the browser has Web Serial. */
  onConnectUsb?: (() => void) | undefined;
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
        {link.hub.via === 'usb' && (
          <span className="hub-pill-via" title="Connected with a USB cable" data-testid="link-via">
            USB
          </span>
        )}
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
      {onConnectUsb && !busy && (
        <button
          type="button"
          className="button button-small button-usb"
          onClick={onConnectUsb}
          title="Connect with a USB cable (the hub needs Pybricks v4.1.1 or newer)"
          data-testid="connect-usb"
        >
          <UsbIcon />
          USB
        </button>
      )}
      {link.status === 'connecting' && (
        <button type="button" className="button button-small" onClick={onDisconnect}>
          Cancel
        </button>
      )}
    </div>
  );
}

function UsbIcon() {
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
        d="M8 14.5v-12M8 2.5 6.5 4.5h3zM8 11 4.5 8.5V6.5M8 9.5l3.5-2V5.5"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <circle cx="4.5" cy="5.5" r="1.1" fill="currentColor" />
      <rect x="10.5" y="4" width="2" height="2" fill="currentColor" />
      <circle cx="8" cy="14" r="1.3" fill="currentColor" />
    </svg>
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
