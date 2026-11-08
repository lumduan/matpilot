import Link from 'next/link';
import { MatPilotApp } from '@/components/MatPilotApp';
import { BlocksBasics } from '@/components/docs/BlocksBasics';
import { PybricksCredit } from '@/components/docs/PybricksCredit';
import { PybricksInstall } from '@/components/docs/PybricksInstall';
import { Shot } from '@/components/docs/Shot';
import {
  BlocksIcon,
  BluetoothIcon,
  BookIcon,
  ComputerIcon,
  HubIcon,
  MatIcon,
  RobotIcon,
} from '@/components/docs/icons';

export default function HomePage() {
  return (
    <main className="container home">
      <section className="home-hero">
        <h1>Program your LEGO® SPIKE Prime robot with blocks</h1>
        <p className="home-lead">
          Snap blocks together, see the Python they make, and run it on your hub. MatPilot is free,
          runs in your browser, and needs no account. It is made for classrooms and robot
          competitions.
        </p>
        <p className="doc-actions">
          <Link className="button button-primary" href="/blocks" data-testid="home-start">
            Start with blocks
          </Link>
          <Link className="button" href="/docs">
            Read the Docs
          </Link>
        </p>
        <Shot
          name="blocks-page"
          alt="The Blocks page: blocks on the left, their Python on the right."
        />
      </section>

      <section className="doc-section" aria-labelledby="start-title">
        <h2 id="start-title">Get started in four steps</h2>
        <ol className="home-cards">
          <li>
            <ComputerIcon />
            <h3>A computer</h3>
            <p>
              With Chrome or Edge, on Windows, macOS, ChromeOS or Android. iPads, iPhones and
              Firefox cannot connect to a hub.
            </p>
          </li>
          <li>
            <HubIcon />
            <h3>Pybricks on the hub</h3>
            <p>
              Once, with a USB cable: <a href="#install-pybricks">see below</a>.
            </p>
          </li>
          <li>
            <BluetoothIcon />
            <h3>Connect</h3>
            <p>
              Turn the hub on, press <strong>Connect hub</strong> and choose your hub.
            </p>
          </li>
          <li>
            <BlocksIcon />
            <h3>Blocks and Run</h3>
            <p>
              Snap blocks together and press <strong>Run</strong>. The hub does what they say.
            </p>
          </li>
        </ol>
      </section>

      <PybricksInstall />

      <section className="doc-section" aria-labelledby="blocks-title">
        <h2 id="blocks-title">The Blocks page</h2>
        <BlocksBasics />
        <p>
          <Link href="/docs/blocks">More about blocks, with pictures</Link>
        </p>
      </section>

      <section className="doc-section" aria-labelledby="more-title">
        <h2 id="more-title">Robots and mats</h2>
        <ul className="home-cards home-cards-links">
          <li>
            <RobotIcon />
            <h3>
              <Link href="/robots">Robots</Link>
            </h3>
            <p>
              Tell MatPilot about your robot: its wheels, its motors and sensors. Measure it, or
              make it from a LEGO® model built in BrickLink Studio.
            </p>
          </li>
          <li>
            <MatIcon />
            <h3>
              <Link href="/mats">Mats</Link>
            </h3>
            <p>
              Put a competition mat on the screen, place your robot on it, and try a program on the
              mat before the real run.
            </p>
          </li>
          <li>
            <BookIcon />
            <h3>
              <Link href="/docs">Docs</Link>
            </h3>
            <p>Every page explained, with pictures: for children, and for the grown-ups helping.</p>
          </li>
        </ul>
      </section>

      <PybricksCredit />

      <section className="doc-section" aria-labelledby="check-title">
        <h2 id="check-title">Check this computer and your hub</h2>
        <p className="muted">
          For grown-ups setting up. Write MicroPython yourself on{' '}
          <Link href="/program">Program &amp; Monitor</Link>; testing with a real hub, the{' '}
          <Link href="/hardware-test">hardware test</Link> walks through each check and makes a
          report.
        </p>
        <noscript>
          <p className="notice notice-error">MatPilot needs JavaScript to be enabled.</p>
        </noscript>
        <MatPilotApp />
      </section>
    </main>
  );
}
