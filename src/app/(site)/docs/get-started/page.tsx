import type { Metadata } from 'next';
import Link from 'next/link';
import { DocsNext } from '@/components/docs/DocsNav';
import { PybricksInstall } from '@/components/docs/PybricksInstall';
import { Shot } from '@/components/docs/Shot';
import { CableIcon, ComputerIcon, HubIcon } from '@/components/docs/icons';
import { PROJECT_NAME } from '@/lib/project';

export const metadata: Metadata = {
  title: `Get started – ${PROJECT_NAME}`,
  description:
    'What you need, putting Pybricks on a SPIKE Prime hub, connecting, and a first program.',
};

export default function GetStarted() {
  return (
    <>
      <h1>Get started</h1>

      <section className="doc-section" aria-labelledby="need-title">
        <h2 id="need-title">What you need</h2>
        <ul className="doc-steps doc-steps-plain">
          <li>
            <HubIcon />
            <div>
              <strong>A LEGO® SPIKE Prime hub</strong> with a charged battery.
            </div>
          </li>
          <li>
            <CableIcon />
            <div>
              <strong>Its USB cable</strong> (micro-USB), only to put Pybricks on the hub.
            </div>
          </li>
          <li>
            <ComputerIcon />
            <div>
              <strong>A computer with Chrome or Edge</strong>: Windows, macOS, ChromeOS or Android.
              Firefox, Safari, iPads and iPhones cannot use Bluetooth from a web page, so they
              cannot connect to a hub.
            </div>
          </li>
        </ul>
      </section>

      <PybricksInstall />

      <section className="doc-section" aria-labelledby="connect-title">
        <h2 id="connect-title">Connect to your hub</h2>
        <ol className="doc-numbered">
          <li>Turn the hub on with its centre button.</li>
          <li>
            Open the <Link href="/blocks">Blocks</Link> page and press <strong>Connect hub</strong>{' '}
            (top right).
          </li>
          <li>
            The browser lists the hubs near you that run Pybricks. Choose yours and press{' '}
            <strong>Pair</strong> or <strong>Connect</strong>.
          </li>
          <li>
            The button now shows your hub’s name, and the bar above the blocks shows what is plugged
            into each port.
          </li>
        </ol>
        <Shot
          name="blocks-page"
          alt="The Blocks page with Connect hub at the top right and the port bar above the blocks."
          marks={[
            { at: 'connect', label: 'Connect hub: press it, then choose your hub.' },
            { at: 'devices', label: 'What is plugged into each port, once the hub is connected.' },
            { at: 'run', label: 'Run starts your program on the hub.' },
          ]}
        />
      </section>

      <section className="doc-section" aria-labelledby="first-title">
        <h2 id="first-title">Your first program</h2>
        <p>
          The Blocks page starts with a small program: motor A turns a quarter turn, four times.
          Plug a motor into port A and press <strong>Run</strong>. Press <strong>Stop</strong> to
          end it early: every motor stops with it.
        </p>
        <p>
          Now change it. Tap the <strong>A</strong> on the motor block to choose another port, or
          drag in blocks from the categories on the left. The{' '}
          <Link href="/docs/blocks">Blocks</Link> page of the Docs shows each part.
        </p>
      </section>

      <section className="doc-section" aria-labelledby="trouble-title">
        <h2 id="trouble-title">If the hub is not in the list</h2>
        <ul className="doc-notes">
          <li>
            Is the hub on, and is Pybricks on it? A hub with the LEGO® app’s firmware is not listed.
          </li>
          <li>
            Is it connected to something else, such as Pybricks Code in another tab? Disconnect it
            there first.
          </li>
          <li>Is Bluetooth on, on the computer?</li>
          <li>
            The home page checks this computer and your hub:{' '}
            <Link href="/#check-title">Check this computer and your hub</Link>.
          </li>
        </ul>
      </section>
      <DocsNext from="/docs/get-started" />
    </>
  );
}
