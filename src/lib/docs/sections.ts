/**
 * A Docs page's sections, read from its HTML (./search.ts): the text under each heading, up to
 * the next. Only the page's own content counts (`.docs-main`), without its "Next" link.
 */
import type { DocSection } from './search';

const HEADINGS = new Set(['H1', 'H2', 'H3']);

/** The sections of a Docs page; `doc` is the page parsed, for example by DOMParser. */
export function sectionsOfPage(doc: Document, page: string, pageTitle: string): DocSection[] {
  const main = doc.querySelector('.docs-main');
  if (!main) return [];
  const sections: DocSection[] = [];
  let current: { id: string | null; title: string; level: number; text: string[] } = {
    id: null,
    title: pageTitle,
    level: 1,
    text: [],
  };
  const close = () => {
    const text = current.text.join(' ').replace(/\s+/g, ' ').trim();
    sections.push({
      page,
      pageTitle,
      id: current.id,
      title: current.title,
      level: current.level,
      text,
    });
  };
  const walk = (node: Node) => {
    if (node.nodeType === 3) {
      current.text.push(node.textContent ?? '');
      return;
    }
    if (node.nodeType !== 1) return;
    const element = node as Element;
    if (element.classList.contains('docs-next') || element.tagName === 'SCRIPT') return;
    if (HEADINGS.has(element.tagName)) {
      const title = (element.textContent ?? '').replace(/\s+/g, ' ').trim();
      if (element.tagName === 'H1') {
        current.title = title || pageTitle;
        return;
      }
      close();
      current = { id: element.id || null, title, level: Number(element.tagName[1]), text: [] };
      return;
    }
    // A picture's description is part of what the page says.
    if (element.tagName === 'IMG') {
      const alt = element.getAttribute('alt');
      if (alt) current.text.push(alt);
    }
    for (const child of Array.from(element.childNodes)) walk(child);
  };
  walk(main);
  close();
  return sections.filter((section) => section.level === 1 || section.title !== '');
}
