import type { Metadata } from 'next';
import Link from 'next/link';
import { BlocksBasics } from '@/components/docs/BlocksBasics';
import { DocsNext } from '@/components/docs/DocsNav';
import { Shot } from '@/components/docs/Shot';
import { PROJECT_NAME } from '@/lib/project';

export const metadata: Metadata = {
  title: `Blocks – ${PROJECT_NAME}`,
  description:
    'The Blocks page with pictures: the categories, Run and Stop, the picture fields, if, else and switch, Python, tabs, Undo, Save and Load.',
};

export default function BlocksDocs() {
  return (
    <>
      <h1>Blocks</h1>
      <p className="home-lead">
        Build a program by snapping blocks together, then run it on your hub. Every block also
        becomes a line of Python, so you can see real code grow as you build.
      </p>

      <section className="doc-section" aria-labelledby="tour-title">
        <h2 id="tour-title">The Blocks page</h2>
        <Shot
          name="blocks-page"
          alt="The Blocks page, with numbers on its parts."
          marks={[
            { at: 'search', label: 'Search: type a word, such as “wait” or “turn”.' },
            { at: 'categories', label: 'The block categories. Tap one to see its blocks.' },
            {
              at: 'start',
              label: '“when the program starts”: put your blocks under it, in order.',
            },
            { at: 'run', label: 'Run sends the program to the hub and starts it.' },
            { at: 'connect', label: 'Connect hub, over Bluetooth; USB beside it, for a cable.' },
            { at: 'devices', label: 'What is plugged into each port, live.' },
            { at: 'view', label: 'Blocks, or Python on the whole page.' },
            { at: 'python', label: 'The Python your blocks make.' },
            { at: 'undo', label: 'Undo and redo.' },
            { at: 'save', label: 'Load, Save and Start over.' },
            { at: 'tabs', label: 'Tabs: + adds a tab for blocks of your own.' },
            { at: 'robot', label: 'The robot this program drives.' },
            { at: 'panes', label: 'Python, Monitor, Plotter and the AI helper.' },
            { at: 'help', label: 'Help: opens this page.' },
          ]}
        />
        <BlocksBasics />
        <p className="doc-tip">
          What does each block do, and which one should you use? <strong>print</strong> or{' '}
          <strong>write</strong>? See <Link href="/docs/every-block">Every block</Link>: every
          block, when to use it, the Python it makes, and the blocks that look alike.
        </p>
      </section>

      <section className="doc-section" aria-labelledby="pictures-title">
        <h2 id="pictures-title">Pictures on blocks</h2>
        <p>
          Many blocks have a picture you can tap. It opens a bigger picture to choose from: no
          numbers to remember.
        </p>
        <div className="doc-pair">
          <Shot
            name="blocks-port"
            alt="The port picker: a drawing of the hub with ports A to F."
            caption="Ports: tap where the motor or sensor is plugged in. With a hub connected, each port says what it sees."
          />
          <Shot
            name="blocks-turn"
            alt="The turn dial: the robot seen from above, turned to where it will face."
            caption="Turns: drag the robot on the dial to where it should face."
          />
        </div>
      </section>

      <section className="doc-section" aria-labelledby="conditions-title">
        <h2 id="conditions-title">Conditions: if, else and switch</h2>
        <p>
          The <strong>Conditions</strong> category has the blocks that decide. Each question block
          (the six-sided ones) is true or false: “colour sensor sees red”, “distance sensor is
          closer than 100 mm”, “touch sensor is pressed”.
        </p>
        <ul className="doc-notes">
          <li>
            <strong>if</strong> does the blocks inside only when the question is true.
          </li>
          <li>
            <strong>if … else</strong> does one thing or the other.
          </li>
          <li>
            <strong>else if</strong> asks another question when the first one was false.
          </li>
          <li>
            <strong>switch on</strong> checks one thing once, such as the colour the sensor sees,
            then does the case that matches, or “otherwise”. Press ⊕ for another case and ⊖ to
            remove the last one.
          </li>
        </ul>
        <div className="doc-pair">
          <Shot
            name="blocks-conditions"
            alt="The Conditions category open: if, if else, else if, switch on, and the question blocks."
            caption="The Conditions category."
          />
          <Shot
            name="blocks-switch"
            alt="A switch on the colour sensor with a case for red, blue and yellow, and its Python."
            caption="A switch on the colour sensor, and the Python it makes: an if … elif … else."
            marks={[
              { at: 'plus', label: '⊕ adds a case; ⊖ removes the last one.' },
              { at: 'python', label: 'The colour is read once, into switch_value.' },
            ]}
          />
        </div>
        <p className="doc-tip">
          Put a switch inside <strong>repeat forever</strong> so the robot keeps checking.
        </p>
      </section>

      <section className="doc-section" aria-labelledby="python-title">
        <h2 id="python-title">Python</h2>
        <p>
          Press <strong>Python</strong> to see the code your blocks make. It changes as you move
          blocks. Press <strong>Edit</strong> to change the Python itself: when you press{' '}
          <strong>Update blocks</strong>, MatPilot turns it back into blocks, and marks any line it
          cannot turn into a block.
        </p>
      </section>

      <section className="doc-section" aria-labelledby="tabs-title">
        <h2 id="tabs-title">Blocks of your own, in tabs</h2>
        <p>
          In <strong>Functions</strong>, a “define” block makes a block of your own, such as
          “square” that drives a square. Give it inputs with ⊕, like the length of a side. Keep such
          blocks in their own tab (the + beside “main”): each tab becomes a Python file that main
          uses, so long programs stay tidy.
        </p>
      </section>

      <section className="doc-section" aria-labelledby="robot-title">
        <h2 id="robot-title">Which robot</h2>
        <p>
          Choose your robot above the blocks (<strong>Robot</strong>), and the movement blocks use
          its wheels and ports. Make the robot first on the <Link href="/docs/robots">Robots</Link>{' '}
          page.
        </p>
      </section>

      <section className="doc-section" aria-labelledby="safe-title">
        <h2 id="safe-title">Stopping safely</h2>
        <p>
          <strong>Stop</strong> ends the program and every motor stops with it. If the Bluetooth
          connection drops while a program runs, the program keeps going on the hub: press the hub’s
          centre button to stop it.
        </p>
      </section>
      <DocsNext from="/docs/blocks" />
    </>
  );
}
