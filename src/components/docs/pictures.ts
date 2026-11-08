/**
 * The Docs' screenshots in public/docs/: size, and where the parts the Docs point at are, in % of
 * the picture. Written by scripts/docs-pictures/docs_pictures.py; do not edit by hand.
 */
export const PICTURES = {
  'blocks-conditions': {
    file: 'blocks-conditions.webp',
    width: 658,
    height: 613,
    marks: {},
  },
  'blocks-page': {
    file: 'blocks-page.webp',
    width: 1280,
    height: 800,
    marks: {
      search: [10.5, 26.5],
      categories: [10.4, 31.2],
      start: [26.4, 29.4],
      run: [29.5, 13.5],
      connect: [40.6, 13.5],
      devices: [39.8, 14.6],
      view: [92.4, 7.8],
      python: [88.0, 39.3],
      undo: [63.4, 32.8],
      save: [11.4, 13.0],
      tabs: [11.2, 20.6],
      robot: [50.8, 21.0],
      panes: [80.9, 93.5],
      help: [44.7, 2.9],
    },
  },
  'blocks-port': {
    file: 'blocks-port.webp',
    width: 398,
    height: 280,
    marks: {},
  },
  'blocks-switch': {
    file: 'blocks-switch.webp',
    width: 1139,
    height: 498,
    marks: {
      plus: [9.7, 77.0],
      python: [80.4, 81.1],
    },
  },
  'blocks-turn': {
    file: 'blocks-turn.webp',
    width: 351,
    height: 365,
    marks: {},
  },
  'grown-ups-ai': {
    file: 'grown-ups-ai.webp',
    width: 544,
    height: 768,
    marks: {},
  },
  'grown-ups-github': {
    file: 'grown-ups-github.webp',
    width: 544,
    height: 643,
    marks: {},
  },
  'mats-page': {
    file: 'mats-page.webp',
    width: 1280,
    height: 900,
    marks: {
      add: [83.9, 5.8],
      robot: [14.4, 64.2],
      pose: [81.4, 61.8],
      tools: [98.7, 88.6],
    },
  },
  'mats-run': {
    file: 'mats-run.webp',
    width: 1280,
    height: 900,
    marks: {
      path: [19.5, 53.5],
      playback: [19.0, 96.4],
    },
  },
  'robots-model': {
    file: 'robots-model.webp',
    width: 864,
    height: 1776,
    marks: {
      file: [31.4, 8.1],
      view3d: [83.5, 15.5],
      front: [2.2, 54.9],
      ports: [85.5, 65.8],
      apply: [28.0, 98.0],
    },
  },
  'robots-page': {
    file: 'robots-page.webp',
    width: 1280,
    height: 1150,
    marks: {
      choice: [2.0, 9.4],
      name: [55.1, 20.3],
      drawing: [80.0, 23.5],
      model: [88.2, 81.1],
      calibrate: [83.9, 98.7],
      save: [96.6, 4.5],
    },
  },
} as const;

export type PictureName = keyof typeof PICTURES;
