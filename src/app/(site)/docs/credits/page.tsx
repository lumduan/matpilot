import type { Metadata } from 'next';
import { PybricksCredit } from '@/components/docs/PybricksCredit';
import { LDRAW, MATPILOT_SOURCE, OTHER_CREDITS, STUDIO } from '@/lib/links';
import { PROJECT_NAME, TRADEMARK_DISCLAIMER } from '@/lib/project';

export const metadata: Metadata = {
  title: `Credits – ${PROJECT_NAME}`,
  description:
    'The work MatPilot is built on: Pybricks, the LDraw Parts Library, BrickLink Studio, Blockly, MicroPython, three.js, PDF.js and more.',
};

export default function CreditsDocs() {
  return (
    <>
      <h1>Credits</h1>
      <p className="home-lead">
        MatPilot is small. It stands on the work of many people who share theirs for free. Thank
        you.
      </p>

      <PybricksCredit />

      <section className="doc-section" aria-labelledby="ldraw-title">
        <h2 id="ldraw-title">The LDraw Parts Library</h2>
        <p>
          The shapes and sizes of LEGO® parts that MatPilot uses to measure a model and draw it in
          3D come from the{' '}
          <a href={LDRAW.site} target="_blank" rel="noopener">
            LDraw Parts Library
          </a>
          , drawn by volunteers over many years. It is shared under the Creative Commons licences CC
          BY 4.0 and CC BY 2.0. MatPilot serves part of it unchanged, with its licence files, and a
          table of every part’s size worked out from it.
        </p>
      </section>

      <section className="doc-section" aria-labelledby="studio-title">
        <h2 id="studio-title">BrickLink Studio</h2>
        <p>
          <a href={STUDIO.download} target="_blank" rel="noopener">
            BrickLink Studio
          </a>{' '}
          is the LEGO Group’s free program for building LEGO® models on a computer. MatPilot reads
          the LDraw files it exports. MatPilot is not made by BrickLink or the LEGO Group.
        </p>
      </section>

      <section className="doc-section" aria-labelledby="open-title">
        <h2 id="open-title">Open-source software</h2>
        <ul className="doc-notes">
          {OTHER_CREDITS.map((credit) => (
            <li key={credit.name}>
              <a href={credit.url} target="_blank" rel="noopener">
                {credit.name}
              </a>
              : {credit.what}.
            </li>
          ))}
        </ul>
        <p>
          The licence of each, and exactly what MatPilot uses from it, is in{' '}
          <a href={`${MATPILOT_SOURCE}/blob/main/NOTICE`} target="_blank" rel="noopener">
            NOTICE
          </a>
          . MatPilot itself is open source under the MIT License:{' '}
          <a href={MATPILOT_SOURCE} target="_blank" rel="noopener">
            its code on GitHub
          </a>
          .
        </p>
      </section>

      <section className="doc-section" aria-labelledby="marks-title">
        <h2 id="marks-title">Trademarks</h2>
        <p className="muted">{TRADEMARK_DISCLAIMER}</p>
      </section>
    </>
  );
}
