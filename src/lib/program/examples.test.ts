import { describe, expect, it } from 'vitest';
import { DEFAULT_PROGRAM_SOURCE, EXAMPLE_PROGRAMS, describeExampleSelection } from './examples';

const [hello, angle] = EXAMPLE_PROGRAMS;

describe('EXAMPLE_PROGRAMS', () => {
  it('has unique ids and titles', () => {
    expect(new Set(EXAMPLE_PROGRAMS.map((e) => e.id)).size).toBe(EXAMPLE_PROGRAMS.length);
    expect(new Set(EXAMPLE_PROGRAMS.map((e) => e.title)).size).toBe(EXAMPLE_PROGRAMS.length);
  });

  it('starts the editor on the first example', () => {
    expect(DEFAULT_PROGRAM_SOURCE).toBe(hello?.source);
  });
});

describe('describeExampleSelection', () => {
  it('names the example the editor holds unchanged, whatever was loaded last', () => {
    expect(describeExampleSelection(angle!.source, 'hello')).toEqual({
      current: angle,
      editedFrom: null,
    });
    expect(describeExampleSelection(hello!.source, null).current).toBe(hello);
  });

  it('reports an edited copy of the last loaded example', () => {
    const edited = angle!.source.replace('SAMPLE_MS = 50', 'SAMPLE_MS = 20');
    expect(describeExampleSelection(edited, angle!.id)).toEqual({
      current: null,
      editedFrom: angle,
    });
  });

  it('reports the user’s own program when nothing was loaded, or the id is unknown', () => {
    expect(describeExampleSelection('print(1)\n', null)).toEqual({
      current: null,
      editedFrom: null,
    });
    expect(describeExampleSelection('print(1)\n', 'removed-example').editedFrom).toBeNull();
  });

  it('treats any change, even whitespace, as an edit', () => {
    expect(describeExampleSelection(`${hello!.source}\n`, hello!.id).current).toBeNull();
  });
});
