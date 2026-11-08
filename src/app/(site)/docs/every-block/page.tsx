import type { Metadata } from 'next';
import Link from 'next/link';
import { BlockChip } from '@/components/docs/BlockChip';
import { DocsNext } from '@/components/docs/DocsNav';
import {
  ALIKE,
  REFERENCE,
  entryId,
  referenceEntries,
  type BlockReference,
} from '@/lib/blocks/reference';
import { BLOCK_SYNONYMS } from '@/lib/blocks/words';
import { PROJECT_NAME } from '@/lib/project';

export const metadata: Metadata = {
  title: `Every block – ${PROJECT_NAME}`,
  description:
    'Every MatPilot block: what it does, when to use it, the Python it makes, and which blocks look alike, such as print and write.',
};

const ENTRIES = referenceEntries();

/** The first entry of a block type, for links. */
const entryOf = (type: string) => ENTRIES.find((entry) => entry.block.type === type)!;

function Entry({ block, colour }: { readonly block: BlockReference; readonly colour: string }) {
  const synonyms = BLOCK_SYNONYMS[block.type] ?? [];
  return (
    <article className="doc-block">
      <h3 id={entryId(block)}>
        <BlockChip words={block.words} shape={block.shape} colour={block.colour ?? colour} />
      </h3>
      <dl>
        <dt>What it does</dt>
        <dd>{block.what}</dd>
        <dt>Use it when</dt>
        <dd>{block.when}</dd>
        {block.alike && (
          <>
            <dt>Compare with</dt>
            <dd>{block.alike}</dd>
          </>
        )}
        <dt>Python</dt>
        <dd>
          <pre className="doc-python">
            <code>{block.python}</code>
          </pre>
        </dd>
        {block.alsoIn && (
          <>
            <dt>Also in</dt>
            <dd>{block.alsoIn.join(', ')}</dd>
          </>
        )}
        {synonyms.length > 0 && (
          <>
            <dt>Search words</dt>
            <dd>{synonyms.join(', ')}</dd>
          </>
        )}
      </dl>
    </article>
  );
}

export default function EveryBlockDocs() {
  return (
    <>
      <h1>Every block</h1>
      <p className="home-lead">
        What each block does, when to use it, and the Python it makes. To find one quickly, type in{' '}
        <strong>Search the Docs</strong>, or in the search box on the{' '}
        <Link href="/docs/blocks">Blocks</Link> page.
      </p>

      <nav className="doc-categories" aria-label="Block categories">
        <a href="#alike">Look-alikes</a>
        {REFERENCE.map((category) => (
          <a key={category.id} href={`#cat-${category.id}`}>
            <span className="doc-cat-dot" style={{ background: category.colour }} />
            {category.name}
          </a>
        ))}
      </nav>

      <section className="doc-section" aria-labelledby="alike">
        <h2 id="alike">Blocks that look alike</h2>
        <div className="doc-alike-list">
          {ALIKE.map((pair, index) => (
            <div className="doc-alike" key={pair.question}>
              <h3 id={`alike-${index + 1}`}>{pair.question}</h3>
              <p>{pair.answer}</p>
              <p className="doc-alike-blocks">
                {pair.types.map((type) => {
                  const { category, block } = entryOf(type);
                  return (
                    <a key={type} href={`#${entryId(block)}`}>
                      <BlockChip
                        words={block.words}
                        shape={block.shape}
                        colour={block.colour ?? category.colour}
                      />
                    </a>
                  );
                })}
              </p>
            </div>
          ))}
        </div>
      </section>

      {REFERENCE.map((category) => (
        <section key={category.id} className="doc-section" aria-labelledby={`cat-${category.id}`}>
          <h2 id={`cat-${category.id}`}>
            <span className="doc-cat-dot" style={{ background: category.colour }} />
            {category.name}
          </h2>
          <p>{category.about}</p>
          <div className="doc-blocks">
            {category.blocks.map((block) => (
              <Entry key={entryId(block)} block={block} colour={category.colour} />
            ))}
          </div>
        </section>
      ))}
      <DocsNext from="/docs/every-block" />
    </>
  );
}
