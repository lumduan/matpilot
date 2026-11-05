/**
 * Small pictures for the simple blocks: category icons, direction arrows and colour swatches.
 * MatPilot's own drawings, as SVG `data:` URIs (the Content Security Policy allows `data:`
 * images). White strokes, because they sit on the coloured blocks and the coloured menus.
 */

const svg = (body: string, size = 24) =>
  `data:image/svg+xml,${encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${body}</svg>`,
  )}`;

export interface Picture {
  readonly src: string;
  readonly width: number;
  readonly height: number;
  readonly alt: string;
}

const picture = (src: string, alt: string, size = 24): Picture => ({
  src,
  width: size,
  height: size,
  alt,
});

/** One per category, at the start of each simple block. */
export const ICONS = {
  movement: svg(
    '<rect x="7" y="4" width="10" height="16" rx="2.5"/><path d="M4 8v8M20 8v8"/><path d="M10 9.5 12 7.5l2 2"/>',
  ),
  motor: svg(
    '<circle cx="12" cy="12" r="2.6"/><path d="M19.5 12a7.5 7.5 0 1 1-2.7-5.8"/><path d="M17.3 3.2l-.5 3.1 3.1.5"/>',
  ),
  light: svg(
    '<rect x="3.5" y="3.5" width="17" height="17" rx="3"/><path d="M8 8h.01M12 8h.01M16 8h.01M8 12h.01M12 12h.01M16 12h.01M8 16h.01M12 16h.01M16 16h.01" stroke-width="2.6"/>',
  ),
  sound: svg(
    '<path d="M4 9.5h3.5L12 5.5v13l-4.5-4H4z"/><path d="M15.5 9a4 4 0 0 1 0 6M18 6.5a7.5 7.5 0 0 1 0 11"/>',
  ),
  colour: svg(
    '<rect x="5" y="3.5" width="14" height="17" rx="3"/><circle cx="12" cy="12" r="3.2"/><path d="M12 12h.01" stroke-width="2.6"/>',
  ),
  distance: svg(
    '<circle cx="7.5" cy="12" r="4"/><circle cx="16.5" cy="12" r="4"/><path d="M7.5 12h.01M16.5 12h.01" stroke-width="2.6"/>',
  ),
  touch: svg(
    '<rect x="4" y="11" width="16" height="9" rx="2"/><path d="M9 11V6.5a3 3 0 0 1 6 0V11"/>',
  ),
} as const;

export function icon(name: keyof typeof ICONS) {
  return { type: 'field_image', src: ICONS[name], width: 24, height: 24, alt: '' };
}

/** Forward and backward, for the movement blocks. */
export const FORWARD = picture(svg('<path d="M12 19.5V5M6 10.5 12 4.5l6 6"/>', 20), 'forward', 20);
export const BACKWARD = picture(svg('<path d="M12 4.5V19M6 13.5l6 6 6-6"/>', 20), 'backward', 20);

/** Clockwise and counterclockwise, seen from the motor's face. */
export const CLOCKWISE = picture(
  svg('<path d="M19 12a7 7 0 1 1-2.6-5.5"/><path d="M16.8 2.8l-.4 3.7 3.7.4"/>', 20),
  'clockwise',
  20,
);
export const COUNTERCLOCKWISE = picture(
  svg('<path d="M5 12a7 7 0 1 0 2.6-5.5"/><path d="M7.2 2.8l.4 3.7-3.7.4"/>', 20),
  'counterclockwise',
  20,
);

/** Swatch colours, close to what the hub light and the sensor show. */
export const SWATCH_COLOURS: Readonly<Record<string, string>> = {
  RED: '#e53935',
  ORANGE: '#fb8c00',
  YELLOW: '#fdd835',
  GREEN: '#43a047',
  CYAN: '#26c6da',
  BLUE: '#1e88e5',
  VIOLET: '#8e24aa',
  MAGENTA: '#d81b60',
  WHITE: '#ffffff',
};

/** A colour swatch for an image dropdown; "no colour" is a crossed-out circle. */
export function swatch(value: string, label: string): Picture {
  const fill = SWATCH_COLOURS[value];
  const body = fill
    ? `<circle cx="12" cy="12" r="8" fill="${fill}" stroke="#fff" stroke-width="2"/>`
    : '<circle cx="12" cy="12" r="8" stroke="#fff" stroke-width="2" stroke-dasharray="3 2.4"/><path d="M7 17 17 7"/>';
  return picture(svg(body, 22), label, 22);
}
