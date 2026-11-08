import type { Metadata } from 'next';
import Link from 'next/link';
import { DocsNext } from '@/components/docs/DocsNav';
import { Shot } from '@/components/docs/Shot';
import { PROJECT_NAME } from '@/lib/project';

export const metadata: Metadata = {
  title: `Mats – ${PROJECT_NAME}`,
  description:
    'Put a competition mat on the screen, place a robot on it, draw a path, and try a block program on the mat before the real run.',
};

export default function MatsDocs() {
  return (
    <>
      <h1>Mats</h1>
      <p className="home-lead">
        Put your competition mat on the screen at its real size. Place your robot on it, measure,
        draw a path, and try a program on the mat before you try it on the table.
      </p>

      <section className="doc-section" aria-labelledby="add-title">
        <h2 id="add-title">Add a mat</h2>
        <ol className="doc-numbered">
          <li>
            Open <Link href="/mats">Mats</Link> and press <strong>Add a mat</strong>.
          </li>
          <li>
            Choose the mat’s PDF, the printing file a competition gives out: MatPilot reads its real
            size from it. A photo or a picture works too; then you type its size.
          </li>
          <li>Choose the competition’s rules, if there are any, to check your robot’s size.</li>
        </ol>
        <Shot
          name="mats-page"
          alt="The Mats page: the mat with a robot on it, and the mat's and robot's settings on the right."
          marks={[
            { at: 'add', label: 'Add a mat, and Load or Save one.' },
            { at: 'robot', label: 'Your robot on the mat: drag it, or turn it by its handle.' },
            { at: 'pose', label: 'Or type where it stands and which way it faces.' },
            { at: 'tools', label: 'Move, Ruler, Area and Path.' },
          ]}
        />
      </section>

      <section className="doc-section" aria-labelledby="tools-title">
        <h2 id="tools-title">The tools</h2>
        <ul className="doc-notes">
          <li>
            <strong>Move</strong>: drag the robot, or the mat to look around.
          </li>
          <li>
            <strong>Ruler</strong>: measure from one point to another, in millimetres.
          </li>
          <li>
            <strong>Area</strong>: mark the start area and the targets.
          </li>
          <li>
            <strong>Path</strong>: tap where the robot should go. MatPilot works out the turns and
            moves, and can add them to your program on the Blocks page.
          </li>
        </ul>
      </section>

      <section className="doc-section" aria-labelledby="run-title">
        <h2 id="run-title">Try a program on the mat</h2>
        <p>
          Under <strong>Run a program on the mat</strong>, choose the program from the Blocks page
          and press Run. MatPilot runs it on the screen, without a hub: the robot drives, its colour
          sensor reads the mat, and you can play it back, faster or slower.
        </p>
        <Shot
          name="mats-run"
          alt="After a run on the mat: the path the robot drove, and the play bar."
          marks={[
            { at: 'path', label: 'The path the robot drove.' },
            { at: 'playback', label: 'Play it back, or drag to any moment.' },
          ]}
        />
        <p>
          <strong>How sure is it?</strong> A real robot never drives exactly the same twice. Once
          your robot is measured on the floor, MatPilot shows where it may really end, from many
          pretend runs.
        </p>
      </section>
      <DocsNext from="/docs/mats" />
    </>
  );
}
