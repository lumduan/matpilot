'use client';

import type { ConnectionSnapshot } from '@/lib/ble/hub-connection';
import { linkSummary } from './status';

/** Connect / Disconnect and the link status, shared by /program and /blocks. */
export function HubCard({
  connection,
  onConnect,
  onConnectUsb,
  onDisconnect,
}: {
  connection: ConnectionSnapshot;
  onConnect: () => void;
  /** Shown only when given: the browser can connect with a USB cable. */
  onConnectUsb?: (() => void) | undefined;
  onDisconnect: () => void;
}) {
  const ready = connection.link.status === 'ready';
  const busyLink =
    connection.link.status === 'requesting' || connection.link.status === 'connecting';
  return (
    <section className="card" aria-labelledby="hub-heading">
      <div className="card-header">
        <h2 id="hub-heading">Hub</h2>
        {ready || connection.link.status === 'connecting' ? (
          <button type="button" className="button" onClick={onDisconnect}>
            Disconnect
          </button>
        ) : (
          <div className="button-row">
            <button
              type="button"
              className="button button-primary"
              onClick={onConnect}
              disabled={busyLink}
            >
              Connect to hub
            </button>
            {onConnectUsb && (
              <button
                type="button"
                className="button"
                onClick={onConnectUsb}
                disabled={busyLink}
                title="Connect with a USB cable (the hub needs Pybricks v4.1.1 or newer)"
                data-testid="connect-usb"
              >
                Connect with USB
              </button>
            )}
          </div>
        )}
      </div>
      <p
        className={connection.link.status === 'error' ? 'notice notice-error' : 'muted'}
        data-testid="link-status"
        data-status={connection.link.status}
        aria-live="polite"
      >
        {linkSummary(connection)}
      </p>
      {connection.flags.batteryLow && (
        <p className="notice notice-warn" role="status">
          <strong>Battery low.</strong> Charge the hub soon; motors may behave differently.
        </p>
      )}
    </section>
  );
}
