'use client';

import { useCallback, useRef, useState } from 'react';
import type { DocSection } from '@/lib/docs/search';
import { sectionsOfPage } from '@/lib/docs/sections';

export type DocsSearchState = 'idle' | 'loading' | 'ready' | 'failed';

/**
 * The Docs' sections for the Docs search (src/lib/docs/search.ts). The pages are read from this
 * site, the first time `load()` is called, so the search matches what they say now. A page that
 * cannot be read is left out; the search fails only if none can be read, and may be tried again.
 */
export function useDocsSearch(pages: readonly { readonly href: string; readonly title: string }[]) {
  const [sections, setSections] = useState<DocSection[] | null>(null);
  const [state, setState] = useState<DocsSearchState>('idle');
  const started = useRef(false);

  const load = useCallback(() => {
    if (started.current) return;
    started.current = true;
    setState('loading');
    const parser = new DOMParser();
    void Promise.allSettled(
      pages.map(async (page) => {
        const response = await fetch(page.href, { credentials: 'same-origin' });
        if (!response.ok) throw new Error(`${page.href}: HTTP ${response.status}`);
        const doc = parser.parseFromString(await response.text(), 'text/html');
        return sectionsOfPage(doc, page.href, page.title);
      }),
    ).then((results) => {
      const read = results.flatMap((result) =>
        result.status === 'fulfilled' ? [result.value] : [],
      );
      if (read.length === 0) {
        started.current = false;
        setState('failed');
        return;
      }
      setSections(read.flat());
      setState('ready');
    });
  }, [pages]);

  return { sections, state, load };
}
