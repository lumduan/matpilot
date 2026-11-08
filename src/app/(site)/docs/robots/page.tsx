import type { Metadata } from 'next';
import Link from 'next/link';
import { DocsNext } from '@/components/docs/DocsNav';
import { Shot } from '@/components/docs/Shot';
import { LDRAW, STUDIO } from '@/lib/links';
import { PROJECT_NAME } from '@/lib/project';

export const metadata: Metadata = {
  title: `Robots – ${PROJECT_NAME}`,
  description:
    'Describe your robot to MatPilot: its size, wheels, motors and sensors, measured with a ruler, on the floor, or from a LEGO model built in BrickLink Studio.',
};

export default function RobotsDocs() {
  return (
    <>
      <h1>Robots</h1>
      <p className="home-lead">
        Tell MatPilot about your robot once: how big it is, its wheels, and which ports its motors
        and sensors use. Then the movement blocks drive the right distances, and the robot can try
        programs on a mat.
      </p>

      <section className="doc-section" aria-labelledby="page-title">
        <h2 id="page-title">The Robots page</h2>
        <Shot
          name="robots-page"
          alt="The Robots page: a robot's numbers on the left, its drawing and facts on the right."
          marks={[
            { at: 'choice', label: 'Your robots. New makes another one.' },
            { at: 'name', label: 'Its name, size and wheels, in millimetres.' },
            { at: 'drawing', label: 'The robot drawn to scale, seen from above.' },
            { at: 'model', label: 'Make it from a LEGO® model (below).' },
            { at: 'calibrate', label: 'Measure it on the floor with the hub.' },
            { at: 'save', label: 'Save it as a file, or on your team’s GitHub.' },
          ]}
        />
      </section>

      <section className="doc-section" aria-labelledby="measure-title">
        <h2 id="measure-title">Measure it with a ruler</h2>
        <ul className="doc-notes">
          <li>
            <strong>Wheel size</strong>: the first number printed on the tyre, such as 56 for the
            SPIKE Prime wheel (56 mm across).
          </li>
          <li>
            <strong>Track</strong>: from the middle of one wheel to the middle of the other.
          </li>
          <li>
            <strong>Ports</strong>: which port each motor and sensor is plugged into. Say which
            wheel motor is on the left.
          </li>
        </ul>
        <p>
          A ruler is close, not exact. <strong>Measure on the floor</strong> runs two short moves
          with your hub and corrects the wheel size and the track, so the robot drives as far and
          turns as much as the program says.
        </p>
      </section>

      <section className="doc-section" id="lego-model" aria-labelledby="model-title">
        <h2 id="model-title">Make it from a LEGO® model</h2>
        <p>
          Built your robot in{' '}
          <a href={STUDIO.download} target="_blank" rel="noopener">
            BrickLink Studio
          </a>
          , the LEGO Group’s free building program? MatPilot can measure the model for you.
        </p>
        <ol className="doc-numbered">
          <li>
            In Studio, choose <strong>File → Export As</strong> and save it as{' '}
            <strong>LDraw (.ldr or .mpd)</strong> (
            <a href={STUDIO.exportHelp} target="_blank" rel="noopener">
              Studio’s help
            </a>
            ). Studio’s own .io file does not work: export it first.
          </li>
          <li>
            On the Robots page, press <strong>Make from a LEGO model…</strong> and choose the file.
          </li>
          <li>
            MatPilot finds the hub, the wheels, the motors and the sensors, and shows the model in
            3D. Drag it to turn it. Check the arrow points to the front; if not, press{' '}
            <strong>Turn the front round</strong>.
          </li>
          <li>Give each motor and sensor the port it is plugged into on the real robot.</li>
          <li>
            Press <strong>Use these numbers</strong>. The robot keeps the model, so you can open it
            again later.
          </li>
        </ol>
        <Shot
          name="robots-model"
          alt="The LEGO model window: the model in 3D, drawings from above and the side, and the ports."
          marks={[
            { at: 'file', label: 'Choose the LDraw file you exported from Studio.' },
            { at: 'view3d', label: 'The model in 3D: drag to turn it, scroll to zoom.' },
            { at: 'front', label: 'Where MatPilot thinks the front is, and why.' },
            { at: 'ports', label: 'The ports: one for each motor and sensor it found.' },
            { at: 'apply', label: 'Use these numbers for your robot.' },
          ]}
        />
        <p className="muted">
          The shapes and sizes of the parts come from the{' '}
          <a href={LDRAW.site} target="_blank" rel="noopener">
            LDraw Parts Library
          </a>
          , made by volunteers. See the <Link href="/docs/credits">Credits</Link>.
        </p>
      </section>
      <DocsNext from="/docs/robots" />
    </>
  );
}
