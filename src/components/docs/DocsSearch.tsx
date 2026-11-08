'use client';

import Link from 'next/link';
import { useMemo, useState } from 'react';
import { useDocsSearch } from '@/hooks/useDocsSearch';
import { searchDocs } from '@/lib/docs/search';
import { DOC_PAGES } from './pages';

/** The Docs' search box, at the top of their menu: every page, every section, every block. */
export function DocsSearch() {
  const { sections, state, load } = useDocsSearch(DOC_PAGES);
  const [query, setQuery] = useState('');
  const hits = useMemo(() => (sections ? searchDocs(query, sections) : []), [query, sections]);
  const open = query.trim() !== '';

  return (
    <div className="docs-search" role="search">
      <input
        type="search"
        placeholder="Search the Docs"
        aria-label="Search the Docs"
        value={query}
        onFocus={load}
        onChange={(event) => {
          load();
          setQuery(event.target.value);
        }}
        onKeyDown={(event) => {
          if (event.key === 'Escape') setQuery('');
        }}
        data-testid="docs-search"
      />
      {open && (
        <div className="docs-search-results" data-testid="docs-search-results" aria-live="polite">
          {state === 'loading' && <p className="docs-search-note">Reading the Docs…</p>}
          {state === 'failed' && (
            <p className="docs-search-note">
              The Docs could not be read. Check the connection, then type again.
            </p>
          )}
          {sections && hits.length === 0 && (
            <p className="docs-search-note">
              Nothing matches “{query.trim()}”. Try another word, such as wait, print or colour.
            </p>
          )}
          {hits.length > 0 && (
            <ul>
              {hits.map((hit) => (
                <li key={hit.href}>
                  <Link href={hit.href} onClick={() => setQuery('')}>
                    <span className="docs-hit-page">{hit.section.pageTitle}</span>
                    <strong className="docs-hit-title">{hit.section.title}</strong>
                    {hit.snippet && <span className="docs-hit-text">{hit.snippet}</span>}
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
