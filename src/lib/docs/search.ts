/**
 * Searching the Docs (asked for on 2026-11-08: "a search in the Docs too"). The Docs are static
 * pages; the search reads them from the site itself the first time it is used (./sections.ts and
 * src/hooks/useDocsSearch.ts), so it always matches what the pages say. Every heading with an id
 * is a place to land: a page's sections, and each block on "Every block".
 *
 * A query word matches a word that starts with it, in either spelling (colour/color, as the block
 * search: ../blocks/words.ts). Every query word must match. Sections whose heading matches come
 * first; the Docs' order is kept otherwise.
 */
import { normalise } from '../blocks/words';

/** One part of a Docs page: the text from one heading to the next. */
export interface DocSection {
  /** The page's address, such as `/docs/blocks`. */
  readonly page: string;
  readonly pageTitle: string;
  /** The heading's id, for `page#id`; null for the top of a page. */
  readonly id: string | null;
  readonly title: string;
  /** 1 for the page's title, 2 for a section, 3 for a part of one. */
  readonly level: number;
  /** The section's words, spaces collapsed. */
  readonly text: string;
}

export interface DocHit {
  readonly section: DocSection;
  /** Where it is: the page's address and the heading's id. */
  readonly href: string;
  /** A short piece of the text around the first match. */
  readonly snippet: string;
}

/** At most this many results are shown. */
export const MAX_DOC_HITS = 12;

const SNIPPET_CHARS = 140;

const wordsOf = (text: string) => normalise(text).split(' ').filter(Boolean);

const matches = (query: readonly string[], words: readonly string[]) =>
  query.filter((word) => words.some((each) => each.startsWith(word))).length;

/** A piece of `text` around the first query word it contains, or its start. */
export function snippetOf(text: string, query: readonly string[]): string {
  const lower = text.toLowerCase();
  let at = -1;
  for (const word of query) {
    // The query is normalised (color); the text may spell it the other way (colour).
    for (const spelling of [word, ...RESPELLINGS.map(([from, to]) => word.replace(from, to))]) {
      at = lower.indexOf(spelling);
      if (at >= 0) break;
    }
    if (at >= 0) break;
  }
  if (at < 0 || text.length <= SNIPPET_CHARS) return trimTo(text, 0);
  return trimTo(text, Math.max(0, at - 40));
}

/** normalise()'s spellings, back to the other one. */
const RESPELLINGS: readonly [string, string][] = [
  ['color', 'colour'],
  ['gray', 'grey'],
  ['center', 'centre'],
  ['meter', 'metre'],
];

function trimTo(text: string, from: number): string {
  let start = from;
  if (start > 0) {
    const space = text.indexOf(' ', start);
    start = space >= 0 && space - start < 20 ? space + 1 : start;
  }
  const end = Math.min(text.length, start + SNIPPET_CHARS);
  let piece = text.slice(start, end);
  if (end < text.length) {
    const space = piece.lastIndexOf(' ');
    piece = `${space > SNIPPET_CHARS / 2 ? piece.slice(0, space) : piece}…`;
  }
  return start > 0 ? `…${piece}` : piece;
}

/** The sections that match every word of `query`, best first. */
export function searchDocs(
  query: string,
  sections: readonly DocSection[],
  max = MAX_DOC_HITS,
): DocHit[] {
  const words = wordsOf(query);
  if (words.length === 0) return [];
  const scored: { section: DocSection; score: number; index: number; whole: boolean }[] = [];
  sections.forEach((section, index) => {
    const title = wordsOf(section.title);
    const all = [...title, ...wordsOf(section.text), ...wordsOf(section.pageTitle)];
    if (matches(words, all) < words.length) return;
    // The heading counts most; a whole heading matched counts more still.
    const inTitle = matches(words, title);
    const whole = inTitle === words.length ? 2 : 0;
    scored.push({ section, score: inTitle * 3 + whole, index, whole: whole > 0 });
  });
  scored.sort((a, b) => b.score - a.score || a.index - b.index);
  return scored.slice(0, max).map(({ section, whole }) => ({
    section,
    href: section.id ? `${section.page}#${section.id}` : section.page,
    // The heading says it all: show how the section starts. Otherwise, where the words are.
    snippet: whole ? snippetOf(section.text, []) : snippetOf(section.text, words),
  }));
}
