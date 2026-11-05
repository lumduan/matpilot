import type { ReactNode } from 'react';
import { SiteFooter } from '@/components/SiteFooter';
import { PROJECT_NAME, PROJECT_STATUS } from '@/lib/project';

/** Document pages: the site header, the page, and the footer. */
export default function SiteLayout({ children }: { children: ReactNode }) {
  return (
    <>
      <header className="site-header">
        <div className="container site-header-inner">
          <span className="wordmark">{PROJECT_NAME}</span>
          <span className="status-pill">{PROJECT_STATUS}</span>
        </div>
      </header>
      {children}
      <SiteFooter />
    </>
  );
}
