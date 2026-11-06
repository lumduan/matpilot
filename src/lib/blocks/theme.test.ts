import { describe, expect, it } from 'vitest';
import { SHARED_BLOCK_DEFINITIONS, SHARED_BLOCK_STYLE } from './shared';
import { CATEGORY_COLOURS, getThemes } from './theme';

/** WCAG contrast of white text on `hex`. */
function contrastWithWhite(hex: string): number {
  const channel = (index: number) => {
    const value = parseInt(hex.slice(1 + index * 2, 3 + index * 2), 16) / 255;
    return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
  };
  const luminance = 0.2126 * channel(0) + 0.7152 * channel(1) + 0.0722 * channel(2);
  return 1.05 / (luminance + 0.05);
}

describe('block colours', () => {
  it('are dark enough for the white block text (4.5:1)', () => {
    const low = Object.entries(CATEGORY_COLOURS)
      .map(([name, colour]) => [name, Math.round(contrastWithWhite(colour) * 100) / 100] as const)
      .filter(([, contrast]) => contrast < 4.5);
    expect(low).toEqual([]);
  });

  it('give the 🌐 blocks of shared variables a pink of their own, in both themes', () => {
    for (const definition of SHARED_BLOCK_DEFINITIONS) {
      expect(definition.style).toBe(SHARED_BLOCK_STYLE);
    }
    const { light, dark } = getThemes();
    for (const theme of [light, dark]) {
      expect(theme.blockStyles[SHARED_BLOCK_STYLE]?.colourPrimary).toBe(
        CATEGORY_COLOURS.sharedVariables,
      );
      expect(theme.blockStyles['variable_blocks']?.colourPrimary).toBe(CATEGORY_COLOURS.variables);
    }
    expect(CATEGORY_COLOURS.sharedVariables).not.toBe(CATEGORY_COLOURS.variables);
  });
});
