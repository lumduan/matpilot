'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { DocsSearch } from './DocsSearch';
import { DOC_PAGES } from './pages';

/** The Docs' own menu, with their search: beside the page on a wide screen, above it on a phone. */
export function DocsNav() {
  const path = (usePathname() ?? '/docs').replace(/\/$/, '') || '/docs';
  return (
    <nav className="docs-nav" aria-label="Docs">
      <DocsSearch />
      <ol>
        {DOC_PAGES.map((page) => (
          <li key={page.href}>
            <Link
              href={page.href}
              aria-current={path === page.href ? 'page' : undefined}
              data-testid={`docs-nav-${page.href.split('/').pop()}`}
            >
              {page.title}
            </Link>
          </li>
        ))}
      </ol>
    </nav>
  );
}

/** "Next: …" at the end of a page, to read the Docs in order. */
export function DocsNext({ from }: { from: string }) {
  const index = DOC_PAGES.findIndex((page) => page.href === from);
  const next = index >= 0 ? DOC_PAGES[index + 1] : undefined;
  if (!next) return null;
  return (
    <p className="docs-next">
      <Link href={next.href}>
        Next: <strong>{next.title}</strong> <span aria-hidden="true">→</span>
      </Link>
    </p>
  );
}
