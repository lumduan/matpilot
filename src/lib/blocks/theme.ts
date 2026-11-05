/**
 * Light and dark Blockly themes in MatPilot's colours (src/app/globals.css). Block colours are
 * the same in both: each is dark enough for Blockly's white block text (contrast of at least
 * 4.5:1). Built-in block styles are mapped onto MatPilot's categories: conditions and loops are
 * Flow, numbers and text are Data.
 */
import * as Blockly from 'blockly/core';

export const CATEGORY_COLOURS = {
  setup: '#4b5563',
  output: '#1d4ed8',
  input: '#0e7490',
  flow: '#b45309',
  data: '#15803d',
  variables: '#be185d',
  other: '#6d28d9',
} as const;

const blockStyles = {
  mp_setup_blocks: { colourPrimary: CATEGORY_COLOURS.setup },
  mp_start_blocks: { colourPrimary: CATEGORY_COLOURS.flow, hat: 'cap' },
  mp_output_blocks: { colourPrimary: CATEGORY_COLOURS.output },
  mp_input_blocks: { colourPrimary: CATEGORY_COLOURS.input },
  mp_other_blocks: { colourPrimary: CATEGORY_COLOURS.other },
  loop_blocks: { colourPrimary: CATEGORY_COLOURS.flow },
  logic_blocks: { colourPrimary: CATEGORY_COLOURS.flow },
  math_blocks: { colourPrimary: CATEGORY_COLOURS.data },
  text_blocks: { colourPrimary: CATEGORY_COLOURS.data },
  variable_blocks: { colourPrimary: CATEGORY_COLOURS.variables },
};

const categoryStyles = {
  mp_setup_category: { colour: CATEGORY_COLOURS.setup },
  mp_output_category: { colour: CATEGORY_COLOURS.output },
  mp_input_category: { colour: CATEGORY_COLOURS.input },
  loop_category: { colour: CATEGORY_COLOURS.flow },
  math_category: { colour: CATEGORY_COLOURS.data },
  variable_category: { colour: CATEGORY_COLOURS.variables },
  mp_other_category: { colour: CATEGORY_COLOURS.other },
};

const fontStyle = { family: 'system-ui, -apple-system, "Segoe UI", sans-serif', size: 12 };

let themes: { light: Blockly.Theme; dark: Blockly.Theme } | null = null;

export function getThemes(): { light: Blockly.Theme; dark: Blockly.Theme } {
  themes ??= {
    light: Blockly.Theme.defineTheme('matpilot-light', {
      name: 'matpilot-light',
      base: Blockly.Themes.Classic,
      blockStyles,
      categoryStyles,
      fontStyle,
      componentStyles: {
        workspaceBackgroundColour: '#f6f7f9',
        toolboxBackgroundColour: '#ffffff',
        toolboxForegroundColour: '#1b1f24',
        flyoutBackgroundColour: '#e9edf1',
        flyoutForegroundColour: '#1b1f24',
        flyoutOpacity: 1,
        scrollbarColour: '#b9c1ca',
        insertionMarkerColour: '#000000',
        insertionMarkerOpacity: 0.2,
      },
    }),
    dark: Blockly.Theme.defineTheme('matpilot-dark', {
      name: 'matpilot-dark',
      base: Blockly.Themes.Classic,
      blockStyles,
      categoryStyles,
      fontStyle,
      componentStyles: {
        workspaceBackgroundColour: '#111418',
        toolboxBackgroundColour: '#1a1f25',
        toolboxForegroundColour: '#e6e9ed',
        flyoutBackgroundColour: '#20262d',
        flyoutForegroundColour: '#e6e9ed',
        flyoutOpacity: 1,
        scrollbarColour: '#3d4650',
        insertionMarkerColour: '#ffffff',
        insertionMarkerOpacity: 0.3,
      },
    }),
  };
  return themes;
}
