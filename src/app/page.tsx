import Link from 'next/link';
import { MatPilotApp } from '@/components/MatPilotApp';

export default function HomePage() {
  return (
    <main className="container">
      <section className="intro">
        <h1>Program and drive SPIKE Prime robots from your browser</h1>
        <p>
          MatPilot is a block-based programming and control app for LEGO SPIKE Prime hubs running
          Pybricks firmware, built for classrooms and robotics competitions. Everything runs in your
          browser over Bluetooth; there is no server and no account.
        </p>
        <p className="muted">
          This early build checks whether your browser can talk to a hub and reads basic information
          from one. Block programming comes later.
        </p>
        <p className="muted">
          Testing with a real hub? The <Link href="/hardware-test">hardware test</Link> walks
          through each check and produces a report for the compatibility table.
        </p>
      </section>

      <noscript>
        <p className="notice notice-error">MatPilot needs JavaScript to be enabled.</p>
      </noscript>

      <MatPilotApp />
    </main>
  );
}
