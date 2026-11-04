import type { Metadata } from 'next';
import Link from 'next/link';
import { ProgramApp } from '@/components/program/ProgramApp';
import { PROJECT_NAME } from '@/lib/project';

export const metadata: Metadata = {
  title: `Program & Monitor – ${PROJECT_NAME}`,
  description:
    'Write a MicroPython program, run it on a LEGO SPIKE Prime hub with Pybricks firmware, and watch its output as text and as a live plot.',
};

export default function ProgramPage() {
  return (
    <main className="container container-wide">
      <section className="intro">
        <p className="muted">
          <Link href="/">← Back to {PROJECT_NAME}</Link>
        </p>
        <h1>Program &amp; Monitor</h1>
        <p>
          Write a Pybricks MicroPython program, press Run, and watch what it prints: as text in the
          monitor, and as a live graph in the plotter. The program is compiled in this browser and
          sent to the hub over Bluetooth; nothing goes to a server.
        </p>
        <p className="muted">
          Stop ends the program. Leaving or disconnecting also stops it first. If the Bluetooth
          connection drops, the program keeps running on the hub: press the hub’s centre button to
          stop it.
        </p>
      </section>

      <noscript>
        <p className="notice notice-error">This page needs JavaScript to be enabled.</p>
      </noscript>

      <ProgramApp />
    </main>
  );
}
