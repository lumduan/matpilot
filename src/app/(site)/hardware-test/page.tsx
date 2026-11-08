import type { Metadata } from 'next';
import Link from 'next/link';
import { HardwareTestApp } from '@/components/HardwareTestApp';
import { PROJECT_NAME } from '@/lib/project';
import { TESTED_FIRMWARE_VERSION } from '@/lib/pybricks/baseline';

export const metadata: Metadata = {
  title: `Hardware test – ${PROJECT_NAME}`,
  description:
    'Step-by-step check of MatPilot with a real LEGO® SPIKE Prime hub, with a report for the compatibility table.',
};

export default function HardwareTestPage() {
  return (
    <main className="container">
      <section className="intro">
        <p className="muted">
          <Link href="/">← Back to {PROJECT_NAME}</Link>
        </p>
        <h1>Hardware test</h1>
        <p>
          This page walks through the hardware checks in the project’s compatibility guide with a
          real hub. It records most results by itself and ends with a report you can copy. Nothing
          is sent anywhere: the report stays in this browser until you copy or save it.
        </p>
        <h2 className="subheading">Before you start</h2>
        <ul className="plain-list">
          <li>
            Use Chrome or Edge on Windows, macOS, ChromeOS, or Android, close to the hub. The
            Bluetooth link runs between this device and the hub.
          </li>
          <li>
            Turn on a LEGO® SPIKE Prime hub running Pybricks firmware (tested with v
            {TESTED_FIRMWARE_VERSION}; other versions are recorded too).
          </li>
          <li>Close Pybricks Code and any other app that is connected to the hub.</li>
          <li>On Android, allow “Nearby devices” (or Location) when the browser asks.</li>
          <li>
            On an unsupported browser (Firefox, Safari, iPhone, iPad), open this page anyway: the
            report then records the unsupported-browser behaviour.
          </li>
        </ul>
      </section>

      <noscript>
        <p className="notice notice-error">The hardware test needs JavaScript to be enabled.</p>
      </noscript>

      <HardwareTestApp />
    </main>
  );
}
