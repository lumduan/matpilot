import type { Metadata } from 'next';
import Link from 'next/link';
import { DocsNext } from '@/components/docs/DocsNav';
import { DOC_PAGES } from '@/components/docs/pages';
import { Shot } from '@/components/docs/Shot';
import {
  BlocksIcon,
  BookIcon,
  GrownUpIcon,
  HeartIcon,
  HubIcon,
  MatIcon,
  RobotIcon,
} from '@/components/docs/icons';
import { PROJECT_NAME } from '@/lib/project';

export const metadata: Metadata = {
  title: `Docs – ${PROJECT_NAME}`,
  description: 'How to use MatPilot, with pictures: blocks, robots, mats, and setting up a hub.',
};

const ICONS = [
  <BookIcon key="start" />,
  <HubIcon key="get-started" />,
  <BlocksIcon key="blocks" />,
  <RobotIcon key="robots" />,
  <MatIcon key="mats" />,
  <GrownUpIcon key="grown-ups" />,
  <HeartIcon key="credits" />,
];

export default function DocsHome() {
  return (
    <>
      <h1>MatPilot Docs</h1>
      <p className="home-lead">
        MatPilot lets you program a LEGO® SPIKE Prime robot with blocks, right in your browser.
        These pages show how, with pictures. Start with{' '}
        <Link href="/docs/get-started">Get started</Link> if your hub is new to MatPilot.
      </p>
      <Shot
        name="blocks-page"
        alt="The Blocks page: the block categories on the left, the blocks in the middle, the Python on the right."
        caption="The Blocks page, where you build programs."
      />
      <ul className="home-cards home-cards-links">
        {DOC_PAGES.slice(1).map((page, index) => (
          <li key={page.href}>
            {ICONS[index + 1]}
            <h2>
              <Link href={page.href}>{page.title}</Link>
            </h2>
            <p>{page.about}</p>
          </li>
        ))}
      </ul>
      <DocsNext from="/docs" />
    </>
  );
}
