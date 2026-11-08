import type { Metadata } from 'next';
import Link from 'next/link';
import { DocsNext } from '@/components/docs/DocsNav';
import { Shot } from '@/components/docs/Shot';
import { PROJECT_NAME } from '@/lib/project';

export const metadata: Metadata = {
  title: `For grown-ups – ${PROJECT_NAME}`,
  description:
    'For the adults helping: what MatPilot sends where, saving a team’s work on GitHub, the AI helper and its key, and checking a computer.',
};

export default function GrownUpsDocs() {
  return (
    <>
      <h1>For grown-ups</h1>
      <p className="home-lead">For the teachers, coaches and parents setting MatPilot up.</p>

      <section className="doc-section" aria-labelledby="privacy-title">
        <h2 id="privacy-title">What MatPilot sends, and where</h2>
        <p>
          MatPilot runs entirely in the browser. It has no server and no accounts, and it keeps
          programs, robots and mats in this browser. It sends something only in two cases, and only
          when someone asks:
        </p>
        <ul className="doc-notes">
          <li>
            <strong>GitHub</strong>, when you save or load on your team’s GitHub repository.
          </li>
          <li>
            <strong>The AI company you chose</strong>, when a child presses Ask in the AI helper,
            after you have turned it on with your own key.
          </li>
        </ul>
      </section>

      <section className="doc-section" aria-labelledby="github-title">
        <h2 id="github-title">Saving a team’s work on GitHub</h2>
        <p>
          Save and Load keep a program, a robot or a mat in a file on this computer, or in one
          GitHub repository the whole team shares. On the GitHub tab of Save, set the repository
          once: its name, a folder, your name for each save, and a token.
        </p>
        <ul className="doc-notes">
          <li>
            The token is needed to save, and to load from a private repository. Under{' '}
            <strong>How to get a token</strong>, the settings open GitHub’s new token page with
            MatPilot’s choices filled in (“Contents: Read and write”); choose only your team’s
            repository.
          </li>
          <li>
            On a shared computer, untick <strong>Remember the token</strong>: it is then forgotten
            when the page closes.
          </li>
          <li>MatPilot never silently replaces a teammate’s newer file: it asks first.</li>
        </ul>
        <Shot
          name="grown-ups-github"
          alt="The GitHub settings: repository, folder, your name, and the token."
          caption="GitHub for your team: set it once on this computer."
        />
      </section>

      <section className="doc-section" aria-labelledby="ai-title">
        <h2 id="ai-title">The AI helper</h2>
        <p>
          The AI helper explains a program, or reviews it, in words a child can follow. It is off
          until an adult turns it on with an API key from Anthropic, OpenAI or DeepSeek.
        </p>
        <ul className="doc-notes">
          <li>
            The key goes from this browser straight to that company. MatPilot has no server, and the
            key is never put in program files or GitHub saves.
          </li>
          <li>Make a key just for MatPilot, so you can delete it on its own.</li>
          <li>Set a daily limit of questions; the helper counts them in this browser.</li>
          <li>Nothing is sent until a child presses Ask.</li>
        </ul>
        <Shot
          name="grown-ups-ai"
          alt="The AI helper settings: the company, the model, the key and the daily limit."
          caption="Turning the AI helper on: for an adult, with their own key."
        />
      </section>

      <section className="doc-section" aria-labelledby="check-title">
        <h2 id="check-title">Checking a computer and a hub</h2>
        <p>
          The home page checks this browser and connects to a hub to read its name and Pybricks
          version: <Link href="/#check-title">Check this computer and your hub</Link>. The{' '}
          <Link href="/hardware-test">hardware test</Link> goes through every check with a hub and
          makes a report to send to MatPilot’s maintainers.
        </p>
      </section>
      <DocsNext from="/docs/grown-ups" />
    </>
  );
}
