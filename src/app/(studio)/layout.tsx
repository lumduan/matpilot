import type { ReactNode } from 'react';

/**
 * Full-window editors (Blocks, Robots, Mats). Each page brings its own top bar and fills the
 * window, so nothing scrolls under the editor. How to use them, the credits and the footer's
 * notices are on the home page and in the Docs (/docs), which the top bar links to.
 */
export default function StudioLayout({ children }: { children: ReactNode }) {
  return children;
}
