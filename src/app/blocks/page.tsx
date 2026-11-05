import type { Metadata } from 'next';
import Link from 'next/link';
import { BlocksApp } from '@/components/blocks/BlocksApp';
import { PROJECT_NAME } from '@/lib/project';

export const metadata: Metadata = {
  title: `Blocks – ${PROJECT_NAME}`,
  description:
    'Program a LEGO SPIKE Prime hub with Pybricks firmware by snapping blocks together, see the Python they make, and watch the output as text and as a live plot.',
};

export default function BlocksPage() {
  return (
    <main className="container container-wide">
      <section className="intro">
        <p className="muted">
          <Link href="/">← Back to {PROJECT_NAME}</Link>
        </p>
        <h1>Blocks</h1>
        <p>
          Snap blocks together to program your hub. Put your motors and sensors in “set up”, build
          the program under “when the program starts”, and press Run. Each block is one Pybricks
          command; the Python it makes is shown beside the blocks.
        </p>
        <p className="muted">
          Stop ends the program, and every motor stops with it. Leaving or disconnecting also stops
          it first. If the Bluetooth connection drops, the program keeps running on the hub: press
          the hub’s centre button to stop it.
        </p>
      </section>

      <noscript>
        <p className="notice notice-error">This page needs JavaScript to be enabled.</p>
      </noscript>

      <BlocksApp />
    </main>
  );
}
