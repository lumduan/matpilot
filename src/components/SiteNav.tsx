'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { PAGES } from './StudioNav';

/** The pages in the site header (home, Docs, Program): the same pages as the editors' top bar. */
export function SiteNav() {
  const path = usePathname() ?? '/';
  return (
    <nav className="site-nav" aria-label="Pages">
      {PAGES.map((page) => (
        <Link
          key={page.id}
          href={page.href}
          className="studio-nav-link"
          aria-current={path === page.href || path.startsWith(`${page.href}/`) ? 'page' : undefined}
          data-testid={`site-nav-${page.id}`}
        >
          {page.label}
        </Link>
      ))}
    </nav>
  );
}
