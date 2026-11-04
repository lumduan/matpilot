'use client';

import { useCompatibility } from '@/hooks/useCompatibility';
import { CompatibilityPanel } from './CompatibilityPanel';
import { HubPanel } from './HubPanel';

/** Client-side root: everything below runs only in the browser. */
export function MatPilotApp() {
  const { report, checking, recheck } = useCompatibility();
  return (
    <>
      <CompatibilityPanel report={report} checking={checking} onRecheck={recheck} />
      <HubPanel compatible={report?.ready === true} checking={checking} />
    </>
  );
}
