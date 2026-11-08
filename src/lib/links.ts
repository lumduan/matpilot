/**
 * Pages on other sites that MatPilot links to. These are links a person follows; MatPilot itself
 * never fetches them (CLAUDE.md, hard constraint 3), so they need no place in the CSP.
 *
 * Checked on 2026-11-08 (the BrickLink pages were offline for maintenance that day; their URLs are
 * the ones BrickLink's own help centre links to).
 */

/** Pybricks: the firmware on the hub, its protocol, its compiler and its Python API. */
export const PYBRICKS = {
  site: 'https://pybricks.com',
  /** Pybricks Code; its tools menu has "Install Pybricks Firmware" and "Restore official LEGO firmware". */
  app: 'https://code.pybricks.com',
  installGuide: 'https://pybricks.com/learn/getting-started/install-pybricks/',
  whatYouNeed: 'https://pybricks.com/learn/getting-started/what-do-you-need/',
  linux: 'https://pybricks.com/project/pybricks-on-linux/',
  story: 'https://pybricks.com/learn/intro/story-mission/',
  github: 'https://github.com/pybricks',
  firmwareSource: 'https://github.com/pybricks/pybricks-micropython',
  sponsor: 'https://github.com/sponsors/pybricks',
  patreon: 'https://www.patreon.com/pybricks',
} as const;

/** BrickLink Studio, the LEGO Group's free building program, which exports LDraw files. */
export const STUDIO = {
  download: 'https://www.bricklink.com/v3/studio/download.page',
  exportHelp:
    'https://studiohelp.bricklink.com/hc/en-us/articles/6502197862679-Exporting-to-other-formats',
} as const;

/** The LDraw Parts Library: the shapes and sizes of LEGO parts (ADR 0017). */
export const LDRAW = {
  site: 'https://www.ldraw.org',
} as const;

/** Other open-source work MatPilot is built with (NOTICE has each licence). */
export const OTHER_CREDITS = [
  {
    name: 'Blockly',
    what: 'the block editor',
    url: 'https://github.com/RaspberryPiFoundation/blockly',
  },
  {
    name: 'CodeMirror and Lezer',
    what: 'the Python editor, and reading Python back into blocks',
    url: 'https://codemirror.net',
  },
  {
    name: 'MicroPython',
    what: 'running a program on a mat, in the browser',
    url: 'https://micropython.org',
  },
  { name: 'three.js', what: 'a LEGO® model in 3D', url: 'https://threejs.org' },
  { name: 'PDF.js', what: 'drawing a mat from its PDF', url: 'https://mozilla.github.io/pdf.js/' },
  {
    name: 'The Anthropic and OpenAI SDKs',
    what: 'the AI helper’s requests',
    url: 'https://github.com/anthropics/anthropic-sdk-typescript',
  },
  { name: 'Next.js and React', what: 'the pages', url: 'https://nextjs.org' },
] as const;

/** MatPilot's own source. */
export const MATPILOT_SOURCE = 'https://github.com/lumduan/matpilot';
