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
        <p>
          <Link href="/blocks">Blocks</Link>: snap blocks together, see the Python they make, and
          run it on your hub.
        </p>
        <p className="muted">
          Testing with a real hub? The <Link href="/hardware-test">hardware test</Link> walks
          through each check and produces a report for the compatibility table.
        </p>
        <p>
          <Link href="/program">Program &amp; Monitor</Link>: write MicroPython, run it on your hub,
          and watch its output as text and as a live plot.
        </p>
      </section>

      <noscript>
        <p className="notice notice-error">MatPilot needs JavaScript to be enabled.</p>
      </noscript>

      <MatPilotApp />
    </main>
  );
}
