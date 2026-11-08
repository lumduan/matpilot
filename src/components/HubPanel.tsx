import Link from 'next/link';
import { useHubProbe } from '@/hooks/useHubProbe';
import type { HubInfo, HubProbeState } from '@/lib/ble';
import { assessFirmwareBaseline, TESTED_FIRMWARE_VERSION } from '@/lib/pybricks/baseline';

interface HubPanelProps {
  /** True only when every compatibility check passed. */
  readonly compatible: boolean;
  readonly checking: boolean;
}

export function HubPanel({ compatible, checking }: HubPanelProps) {
  const { state, connect, disconnect } = useHubProbe();
  const showDisconnect = state.status === 'connecting' || state.status === 'connected';
  const canConnect = compatible && state.status !== 'requesting';

  return (
    <section className="card" aria-labelledby="hub-heading">
      <div className="card-header">
        <h2 id="hub-heading">2. Hub probe</h2>
        {showDisconnect ? (
          <button type="button" className="button" onClick={disconnect}>
            Disconnect
          </button>
        ) : (
          <button
            type="button"
            className="button button-primary"
            onClick={connect}
            disabled={!canConnect}
          >
            Connect to hub
          </button>
        )}
      </div>

      <p className="muted">
        Connects to a LEGO® SPIKE Prime hub running Pybricks firmware and reads its name, firmware
        revision, and protocol version. Read-only: MatPilot does not write anything to the hub.
        Tested with Pybricks v{TESTED_FIRMWARE_VERSION}.
      </p>

      {!compatible && (
        <p className="muted" data-testid="connect-disabled-reason">
          {checking
            ? 'Connect to hub is available once the compatibility checks finish.'
            : 'Connect to hub is disabled because a compatibility check failed.'}
        </p>
      )}

      <div aria-live="polite" data-testid="hub-status" data-status={state.status}>
        <ProbeStatus state={state} />
      </div>
    </section>
  );
}

function hubLabel(name: string | null): string {
  return name ? `“${name}”` : 'the hub';
}

/** Human-readable hub probe state. Also used by the hardware test page. */
export function ProbeStatus({ state }: { state: HubProbeState }) {
  switch (state.status) {
    case 'idle':
      return (
        <p className="muted">
          Turn on the hub, then click Connect to hub. The browser lists only nearby hubs running
          Pybricks firmware.
        </p>
      );
    case 'requesting':
      return <p className="notice">Choose your hub in the browser’s device picker.</p>;
    case 'no-device-selected':
      return (
        <div className="notice">
          <p>
            <strong>No hub selected.</strong>
          </p>
          <p>
            The device picker was closed without choosing a hub. Click Connect to hub to try again.
          </p>
        </div>
      );
    case 'connecting':
      return (
        <p className="notice">
          Connecting to {hubLabel(state.deviceName)} and reading its information…
        </p>
      );
    case 'connected':
      return <HubDetails hub={state.hub} />;
    case 'disconnected':
      if (state.reason === 'user') {
        return (
          <div className="notice">
            <p>
              <strong>Disconnected.</strong>
            </p>
            <p>Disconnected from {hubLabel(state.deviceName)}.</p>
          </div>
        );
      }
      return (
        <div className="notice notice-warn">
          <p>
            <strong>Hub disconnected.</strong>
          </p>
          <p>
            {state.reason === 'connection-lost-during-setup'
              ? `The connection to ${hubLabel(state.deviceName)} was lost before its information could be read.`
              : `The connection to ${hubLabel(state.deviceName)} was lost.`}{' '}
            The hub may have been turned off or moved out of range. Click Connect to hub to connect
            again.
          </p>
        </div>
      );
    case 'error':
      return (
        <div className="notice notice-error" role="alert">
          <p>
            <strong>{state.error.title}.</strong>
          </p>
          <p>{state.error.message}</p>
          {state.error.detail && (
            <details>
              <summary>Technical details</summary>
              <code>{state.error.detail}</code>
            </details>
          )}
        </div>
      );
  }
}

function HubDetails({ hub }: { hub: HubInfo }) {
  const baseline = assessFirmwareBaseline(hub.firmwareVersion);
  return (
    <div className="notice notice-ok">
      <p>
        <strong>Connected to {hubLabel(hub.name)}.</strong>
      </p>
      <dl className="hub-info">
        <dt>Device name</dt>
        <dd data-testid="hub-name">{hub.name ?? '(no name reported)'}</dd>
        <dt>Firmware revision</dt>
        <dd data-testid="hub-firmware">
          <code>{hub.firmwareRevision || '(empty)'}</code>
          <span className="muted"> {baseline.message}</span>
          {baseline.comparison === 'older' && (
            <>
              {' '}
              <Link href="/docs/get-started#install-pybricks">How to update Pybricks</Link>
            </>
          )}
        </dd>
        <dt>Protocol version</dt>
        <dd data-testid="hub-protocol">
          <code>{hub.protocolRevision || '(empty)'}</code>
          <span className="muted"> Pybricks BLE protocol (Software Revision String)</span>
        </dd>
      </dl>
    </div>
  );
}
