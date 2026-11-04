import { SUPPORT_STATEMENT, type CompatibilityReport } from '@/lib/compat';
import { StatusBadge } from './StatusBadge';

interface CompatibilityPanelProps {
  readonly report: CompatibilityReport | null;
  readonly checking: boolean;
  readonly onRecheck: () => void;
}

export function CompatibilityPanel({ report, checking, onRecheck }: CompatibilityPanelProps) {
  return (
    <section className="card" aria-labelledby="compat-heading" aria-busy={checking}>
      <div className="card-header">
        <h2 id="compat-heading">1. Device compatibility</h2>
        <button type="button" className="button" onClick={onRecheck} disabled={checking}>
          Run checks again
        </button>
      </div>

      {report === null ? (
        <p role="status">Checking this browser…</p>
      ) : (
        <>
          <ul className="checks">
            {report.checks.map((check) => (
              <li key={check.id} className="check" data-check={check.id} data-status={check.status}>
                <StatusBadge status={check.status} />
                <div>
                  <h3>{check.title}</h3>
                  <p>{check.explanation}</p>
                </div>
              </li>
            ))}
          </ul>

          {report.ready ? (
            <p className="notice notice-ok" role="status" data-testid="compat-summary">
              All checks passed. You can connect to a hub.
            </p>
          ) : (
            <div className="notice notice-error" role="alert" data-testid="compat-summary">
              <p>
                <strong>This browser or device cannot connect to a hub.</strong>
              </p>
              <p>{SUPPORT_STATEMENT}</p>
            </div>
          )}
        </>
      )}
    </section>
  );
}
