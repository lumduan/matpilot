/** The Docs pages, in reading order: the side menu and the "Next" links follow this list. */
export const DOC_PAGES = [
  { href: '/docs', title: 'Start here', about: 'What MatPilot is, and where to go next.' },
  {
    href: '/docs/get-started',
    title: 'Get started',
    about: 'What you need, Pybricks on the hub, your first program, and an EV3.',
  },
  {
    href: '/docs/blocks',
    title: 'Blocks',
    about: 'The Blocks page: blocks, pictures, if and switch, Python, tabs.',
  },
  {
    href: '/docs/robots',
    title: 'Robots',
    about: 'Your robot’s size, wheels, motors and sensors, from a ruler or a LEGO® model.',
  },
  {
    href: '/docs/mats',
    title: 'Mats',
    about: 'A competition mat on the screen, and a try-out run.',
  },
  {
    href: '/docs/grown-ups',
    title: 'For grown-ups',
    about: 'Saving on GitHub, the AI helper, and checking a computer.',
  },
  {
    href: '/docs/credits',
    title: 'Credits',
    about: 'Pybricks, LDraw, BrickLink Studio and the other work MatPilot is built on.',
  },
] as const;

export type DocHref = (typeof DOC_PAGES)[number]['href'];
