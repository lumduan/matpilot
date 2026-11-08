import type { ReactNode } from 'react';
import Link from 'next/link';
import { SiteFooter } from '@/components/SiteFooter';
import { SiteNav } from '@/components/SiteNav';
import { PROJECT_NAME, PROJECT_STATUS } from '@/lib/project';

/** Document pages (home, Docs, Program): the site header with the pages, the page, the footer. */
export default function SiteLayout({ children }: { children: ReactNode }) {
  return (
    <>
      <header className="site-header">
        <div className="container site-header-inner">
          <Link href="/" className="wordmark" data-testid="site-home">
            {PROJECT_NAME}
          </Link>
          <span className="status-pill">{PROJECT_STATUS}</span>
          <SiteNav />
        </div>
      </header>
      {children}
      <SiteFooter />
    </>
  );
}
