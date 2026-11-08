import { MATPILOT_SOURCE, PYBRICKS } from '@/lib/links';
import { HeartIcon } from './icons';

/**
 * What MatPilot owes Pybricks, said plainly and near the top: the hub runs Pybricks, MatPilot
 * speaks its protocol, compiles with its compiler, and every block makes its Python. The team and
 * the ways to support them are from https://pybricks.com/learn/intro/story-mission/ and Pybricks
 * Code's sponsor dialog (pybricks-code commit ea9af98d1fd0a842ed76d3a7f83767f363bc1b17,
 * src/sponsor/SponsorDialog.tsx). No Pybricks logo: using it would need their permission.
 */
export function PybricksCredit({ headingLevel = 2 }: { headingLevel?: 2 | 3 }) {
  const Heading = headingLevel === 2 ? 'h2' : 'h3';
  return (
    <section className="doc-credit" id="pybricks" aria-labelledby="pybricks-title">
      <Heading id="pybricks-title">Built on Pybricks</Heading>
      <p>
        MatPilot could not exist without{' '}
        <a href={PYBRICKS.site} target="_blank" rel="noopener">
          <strong>Pybricks</strong>
        </a>
        , free and open-source software for LEGO® hubs, made by Laurens Valk and David Lechner with
        contributors around the world. Pybricks does the hard parts; MatPilot adds blocks, robots
        and mats on top:
      </p>
      <ul className="doc-credit-list">
        <li>
          <strong>The firmware on your hub</strong> is Pybricks. It runs every program and keeps the
          motors and sensors working.
        </li>
        <li>
          <strong>Connecting and running</strong> use the Pybricks protocol, the same way Pybricks’
          own app talks to the hub.
        </li>
        <li>
          <strong>Every block makes Pybricks Python</strong>: <code>DriveBase</code>,{' '}
          <code>Motor</code>, <code>ColorSensor</code> and the rest are Pybricks’ names.
        </li>
        <li>
          <strong>Pybricks’ compiler</strong> turns that Python into the code the hub runs, right in
          your browser.
        </li>
      </ul>
      <p>
        Pybricks is free for everyone, and it stays that way through its supporters. If MatPilot
        helps your team, please{' '}
        <a href={PYBRICKS.sponsor} target="_blank" rel="noopener">
          sponsor Pybricks on GitHub
        </a>{' '}
        or{' '}
        <a href={PYBRICKS.patreon} target="_blank" rel="noopener">
          on Patreon
        </a>
        .
      </p>
      <p className="doc-actions">
        <a className="button" href={PYBRICKS.site} target="_blank" rel="noopener">
          pybricks.com
        </a>
        <a className="button" href={PYBRICKS.github} target="_blank" rel="noopener">
          Pybricks on GitHub
        </a>
        <a className="button" href={PYBRICKS.sponsor} target="_blank" rel="noopener">
          <HeartIcon />
          Support Pybricks
        </a>
      </p>
      <p className="muted">
        MatPilot is not made by the Pybricks team. Please ask about MatPilot{' '}
        <a href={`${MATPILOT_SOURCE}/issues`} target="_blank" rel="noopener">
          on MatPilot’s GitHub
        </a>
        , not them.
      </p>
    </section>
  );
}
