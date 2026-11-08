/**
 * The block categories' colours (./theme.ts explains the choice and the contrast). Kept apart from
 * the Blockly themes so pages that only show the colours, such as the Docs' list of every block,
 * do not load Blockly.
 */
export const CATEGORY_COLOURS = {
  setup: '#4b5563',
  output: '#1d4ed8',
  input: '#0e7490',
  flow: '#b45309',
  data: '#15803d',
  variables: '#be185d',
  sharedVariables: '#e10089',
  other: '#6d28d9',
  movement: '#a21caf',
  light: '#7e22ce',
  sound: '#9f1239',
  controller: '#3f6212',
  functions: '#4338ca',
} as const;
