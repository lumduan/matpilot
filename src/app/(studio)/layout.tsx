import type { ReactNode } from 'react';

/**
 * Full-window editors (the Blocks page). The page brings its own top bar and fills the window, so
 * nothing scrolls under the editor; it shows the footer's notices in its introduction instead.
 */
export default function StudioLayout({ children }: { children: ReactNode }) {
  return children;
}
