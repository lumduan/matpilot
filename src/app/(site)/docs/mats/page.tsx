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
            { at: 'tools', label: 'Move, Ruler and Area.' },
            { at: 'tabs', label: 'Mat, Path and Run: what the panel shows.' },
          ]}
        />
      </section>

      <section className="doc-section" aria-labelledby="tools-title">
        <h2 id="tools-title">The tools</h2>
        <p>
          On the <strong>Mat</strong> tab:
        </p>
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
        </ul>
      </section>

      <section className="doc-section" aria-labelledby="path-title">
        <h2 id="path-title">Make a path</h2>
        <p>
          Open the <strong>Path</strong> tab: a bar of pictures appears over the mat.
        </p>
        <ol className="doc-numbered">
          <li>
            With <strong>Drive to</strong> on, tap on the mat where the robot should go, point by
            point. It turns to face each point, then drives straight to it. Drag a point’s number to
            move it.
          </li>
          <li>
            With <strong>Back up to</strong> on, the robot turns its back to the point and reverses
            there. The mat shows that part in orange.
          </li>
          <li>
            <strong>Forward</strong>, <strong>Backward</strong>, <strong>Turn</strong>,{' '}
            <strong>Wait</strong> and <strong>Speed</strong> add a move after the picked one.
            <ul className="doc-notes">
              <li>
                A turn puts a round handle around the robot: drag it, and a faint robot turns with
                it, with the angle written on the mat. Or tap a picture: a quarter turn, an eighth,
                or turning around.
              </li>
              <li>
                A drive has a handle past the robot’s nose: pull it to make the drive longer or
                shorter.
              </li>
              <li>A wait has − and + for half seconds; a speed has a lever from slow to fast.</li>
            </ul>
          </li>
          <li>
            The list on the Path tab shows every move in order, with boxes to type exact numbers.
            Tap a move’s number to pick it: new moves go after it, and the faint robot shows where
            the robot is then. <strong>Undo</strong> takes the last change back.
          </li>
          <li>
            <strong>Run it on the mat</strong> to watch it. <strong>Send to Blocks</strong> makes it
            blocks: on the Blocks page, open the tab it goes in and press{' '}
            <strong>Add at the end of …</strong>.
          </li>
        </ol>
        <Shot
          name="mats-path"
          alt="The Path tab: the bar of pictures over the mat, a path with a part backed up in orange, and a turn's round handle around the robot."
          marks={[
            { at: 'tap', label: 'Drive to, or Back up to: what a tap on the mat does.' },
            { at: 'add', label: 'Add a move: forward, backward, turn, wait or speed.' },
            { at: 'turns', label: 'Pictures of turns: tap one.' },
            { at: 'dial', label: 'Or drag the round handle: the angle shows on the mat.' },
            { at: 'back', label: 'A part driven backward.' },
            { at: 'list', label: 'Every move, with exact numbers.' },
          ]}
        />
        <p>
          The path stays with the mat in this browser, so it is still there tomorrow. It is not put
          in the mat’s file.
        </p>
      </section>

      <section className="doc-section" aria-labelledby="run-title">
        <h2 id="run-title">Try a program on the mat</h2>
        <p>
          On the <strong>Run</strong> tab, choose the program from the Blocks page and press Run.
          MatPilot runs it on the screen, without a hub: the robot drives, its colour sensor reads
          the mat, and you can play it back, faster or slower.
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
