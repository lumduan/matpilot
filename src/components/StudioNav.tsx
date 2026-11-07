'use client';

import Link from 'next/link';
import { useEffect, useRef } from 'react';

/** The full-window pages (ADR 0016, D1): Blocks and Robots, with Mats to come. */
const PAGES = [
  { id: 'blocks', href: '/blocks', label: 'Blocks' },
  { id: 'robots', href: '/robots', label: 'Robots' },
] as const;

export type StudioPage = (typeof PAGES)[number]['id'];

/**
 * The pages in the top bar: links side by side on a wide screen, a small menu on a phone. The
 * page's own name is its heading for screen readers.
 */
export function StudioNav({ current }: { current: StudioPage }) {
  const menu = useRef<HTMLDetailsElement>(null);
  const label = PAGES.find((page) => page.id === current)?.label ?? '';
  // Close the phone menu when a click lands outside it.
  useEffect(() => {
    const close = (event: PointerEvent) => {
      const element = menu.current;
      if (element?.open && !element.contains(event.target as Node)) element.open = false;
    };
    document.addEventListener('pointerdown', close);
    return () => document.removeEventListener('pointerdown', close);
  }, []);
  const links = PAGES.map((page) => (
    <Link
      key={page.id}
      href={page.href}
      className="studio-nav-link"
      aria-current={page.id === current ? 'page' : undefined}
      data-testid={`nav-${page.id}`}
    >
      {page.label}
    </Link>
  ));
  return (
    <>
      <h1 className="visually-hidden">{label}</h1>
      <nav className="studio-nav" aria-label="Pages">
        {links}
      </nav>
      <details className="studio-nav-menu" ref={menu}>
        <summary aria-label={`Page: ${label}. Other pages`}>{label}</summary>
        <nav aria-label="Pages">{links}</nav>
      </details>
    </>
  );
}
