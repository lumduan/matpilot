import type { ReactNode } from 'react';
import { DocsNav } from '@/components/docs/DocsNav';

/** The Docs: how to use MatPilot, with pictures, for children and the grown-ups helping them. */
export default function DocsLayout({ children }: { children: ReactNode }) {
  return (
    <div className="container container-wide docs">
      <DocsNav />
      <main className="docs-main">{children}</main>
    </div>
  );
}
