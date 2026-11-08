import { describe, expect, it } from 'vitest';
import { searchDocs, snippetOf, type DocSection } from './search';

const section = (
  page: string,
  title: string,
  text: string,
  id: string | null = title.toLowerCase().replace(/\W+/g, '-'),
  level = 2,
): DocSection => ({ page, pageTitle: page.split('/').pop() ?? '', id, title, level, text });

const SECTIONS: DocSection[] = [
  section('/docs/blocks', 'Blocks', 'Build a program by snapping blocks together.', null, 1),
  section('/docs/blocks', 'Conditions: if, else and switch', 'The Conditions category decides.'),
  section(
    '/docs/every-block',
    'print “Hello”',
    'Sends text or a number to the computer: it appears in the Monitor.',
    'block-mp_print',
    3,
  ),
  section(
    '/docs/every-block',
    'print or write?',
    '“print” sends text to the computer; “write” shows text on the hub’s lights.',
    'alike-1',
    3,
  ),
  section(
    '/docs/every-block',
    'write “Hello”',
    'Shows text on the hub’s 5×5 lights, one letter at a time.',
    'block-mp_light_write',
    3,
  ),
  section('/docs/get-started', 'Put Pybricks on your hub', 'Use Pybricks’ installer over USB.'),
  section('/docs/robots', 'A robot from its colour sensor', 'The colour sensor looks down.'),
];

describe('searching the Docs', () => {
  it('finds headings first, then text, in the Docs’ order', () => {
    const hits = searchDocs('print', SECTIONS).map((hit) => hit.href);
    expect(hits).toEqual(['/docs/every-block#block-mp_print', '/docs/every-block#alike-1']);
    expect(searchDocs('write', SECTIONS).map((hit) => hit.href)).toEqual([
      '/docs/every-block#alike-1',
      '/docs/every-block#block-mp_light_write',
    ]);
  });

  it('needs every word, by the start of a word, in either spelling', () => {
    expect(searchDocs('print writ', SECTIONS).map((hit) => hit.href)).toEqual([
      '/docs/every-block#alike-1',
    ]);
    expect(searchDocs('color', SECTIONS).map((hit) => hit.href)).toEqual([
      '/docs/robots#a-robot-from-its-colour-sensor',
    ]);
    expect(searchDocs('usb pybr', SECTIONS)).toHaveLength(1);
    expect(searchDocs('xyzzy', SECTIONS)).toEqual([]);
    expect(searchDocs('  ', SECTIONS)).toEqual([]);
  });

  it('shows how a section starts when its heading matches', () => {
    const [hit] = searchDocs('print hello', SECTIONS);
    expect(hit?.snippet).toBe('Sends text or a number to the computer: it appears in the Monitor.');
  });

  it('links the top of a page to the page itself', () => {
    expect(searchDocs('snapping', SECTIONS)[0]?.href).toBe('/docs/blocks');
  });

  it('shows the text around the first match', () => {
    const long = `${'Some words before the match. '.repeat(8)}The Monitor shows it. ${'More. '.repeat(30)}`;
    const piece = snippetOf(long, ['monitor']);
    expect(piece.startsWith('…')).toBe(true);
    expect(piece).toContain('Monitor shows it');
    expect(piece.endsWith('…')).toBe(true);
    expect(piece.length).toBeLessThanOrEqual(150);
    expect(snippetOf('Short text.', ['xyz'])).toBe('Short text.');
  });

  it('keeps to the most results', () => {
    const many = Array.from({ length: 30 }, (_, i) => section('/docs/x', `Motor ${i}`, ''));
    expect(searchDocs('motor', many)).toHaveLength(12);
  });
});
