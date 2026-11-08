/**
 * Small pictures for the home page and the Docs: drawn here, in the text colour, so they work in
 * light and dark mode and need no image files. Each is decoration; the words beside it say the
 * same thing.
 */
import type { ReactNode } from 'react';

function Icon({ children, size = 40 }: { children: ReactNode; size?: number }) {
  return (
    <svg
      className="doc-icon"
      viewBox="0 0 24 24"
      width={size}
      height={size}
      aria-hidden="true"
      focusable="false"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      {children}
    </svg>
  );
}

export const ComputerIcon = () => (
  <Icon>
    <rect x="3" y="4" width="18" height="12" rx="1.5" />
    <path d="M2 19.5h20M9 16v3.5M15 16v3.5" />
  </Icon>
);

/** The hub, from the front: the 5×5 lights and the centre button. */
export const HubIcon = () => (
  <Icon>
    <rect x="5" y="2.5" width="14" height="19" rx="3" />
    <path
      d="M9 7h.01M12 7h.01M15 7h.01M9 10h.01M12 10h.01M15 10h.01M9 13h.01M12 13h.01M15 13h.01"
      strokeWidth="2.2"
    />
    <circle cx="12" cy="17.5" r="1.6" />
  </Icon>
);

export const PowerOffIcon = () => (
  <Icon>
    <path d="M12 3v8" />
    <path d="M6.3 6.8a8 8 0 1 0 11.4 0" />
  </Icon>
);

export const CableIcon = () => (
  <Icon>
    <rect x="9" y="2.5" width="6" height="6" rx="1" />
    <path d="M10.5 2.5V1M13.5 2.5V1M12 8.5v4a4 4 0 0 1-4 4H6a3 3 0 0 0-3 3v2" />
  </Icon>
);

export const UnplugIcon = () => (
  <Icon>
    <rect x="9" y="2.5" width="6" height="6" rx="1" />
    <path d="M12 8.5v3M12 14.5v2.5a3 3 0 0 1-3 3H5" />
    <path d="M4 4l16 16" />
  </Icon>
);

/** A finger holding a round button down. */
export const HoldButtonIcon = () => (
  <Icon>
    <circle cx="12" cy="16.5" r="4" />
    <path d="M10 12.5V5a2 2 0 0 1 4 0v7.5" />
    <path d="M7 9.5 5 8M17 9.5l2-1.5" />
  </Icon>
);

/** A light blinking pink, green and blue. */
export function BlinkIcon() {
  return (
    <svg
      className="doc-icon doc-icon-blink"
      viewBox="0 0 36 12"
      width="72"
      height="24"
      aria-hidden="true"
      focusable="false"
    >
      <circle cx="6" cy="6" r="4.5" fill="#e0559b" />
      <circle cx="18" cy="6" r="4.5" fill="#2e9e5b" />
      <circle cx="30" cy="6" r="4.5" fill="#2f6fe0" />
    </svg>
  );
}

export const ListIcon = () => (
  <Icon>
    <rect x="3.5" y="3.5" width="17" height="17" rx="2" />
    <path d="M7.5 8.5h9M7.5 12h9M7.5 15.5h5" />
  </Icon>
);

export const BluetoothIcon = () => (
  <Icon>
    <path d="m7 7.5 10 9-5 4.5V3l5 4.5-10 9" />
  </Icon>
);

export const BlocksIcon = () => (
  <Icon>
    <path d="M4 4.5h7v3h2v-3h7v6H4z" />
    <path d="M4 13.5h7v3h2v-3h7v6H4z" />
  </Icon>
);

export const PlayIcon = () => (
  <Icon>
    <circle cx="12" cy="12" r="9" />
    <path d="M10 8.5v7l5.5-3.5z" fill="currentColor" />
  </Icon>
);

export const StopIcon = () => (
  <Icon>
    <circle cx="12" cy="12" r="9" />
    <rect x="9" y="9" width="6" height="6" fill="currentColor" />
  </Icon>
);

export const CodeIcon = () => (
  <Icon>
    <path d="m8 7-5 5 5 5M16 7l5 5-5 5M13.5 4.5l-3 15" />
  </Icon>
);

export const TapIcon = () => (
  <Icon>
    <path d="M9 11V5.5a1.5 1.5 0 0 1 3 0V11" />
    <path d="M12 9.5a1.5 1.5 0 0 1 3 0V11M15 10.5a1.5 1.5 0 0 1 3 0v3.5a6 6 0 0 1-6 6h-1a5 5 0 0 1-4.2-2.3L4.5 14a1.5 1.5 0 0 1 2.5-1.6L9 15" />
  </Icon>
);

export const TabsIcon = () => (
  <Icon>
    <path d="M3 8.5h18v11H3z" />
    <path d="M3 8.5V5h6l1.5 3.5M10.5 8.5 12 5h5l1.5 3.5" />
  </Icon>
);

export const UndoIcon = () => (
  <Icon>
    <path d="M9 14 4 9l5-5" />
    <path d="M4 9h10a6 6 0 0 1 0 12h-3" />
  </Icon>
);

export const SaveIcon = () => (
  <Icon>
    <path d="M12 3v12M7 10l5 5 5-5" />
    <path d="M4 17v3h16v-3" />
  </Icon>
);

export const PortsIcon = () => (
  <Icon>
    <rect x="6" y="3" width="12" height="18" rx="2.5" />
    <path d="M3 7h3M3 12h3M3 17h3M18 7h3M18 12h3M18 17h3" />
  </Icon>
);

export const RobotIcon = () => (
  <Icon>
    <rect x="6" y="5" width="12" height="11" rx="2" />
    <circle cx="6" cy="16.5" r="3" />
    <circle cx="18" cy="16.5" r="3" />
    <path d="M10 9h.01M14 9h.01" strokeWidth="2.4" />
  </Icon>
);

export const MatIcon = () => (
  <Icon>
    <rect x="2.5" y="5" width="19" height="14" rx="1.5" />
    <path d="M5.5 15.5c3-6 6 2 9-3s3-2 4-1" />
  </Icon>
);

export const HeartIcon = () => (
  <Icon>
    <path d="M12 20s-7.5-4.6-7.5-10A4.3 4.3 0 0 1 12 7.4 4.3 4.3 0 0 1 19.5 10C19.5 15.4 12 20 12 20z" />
  </Icon>
);

export const BookIcon = () => (
  <Icon>
    <path d="M4 5.5A2.5 2.5 0 0 1 6.5 3H20v15H6.5A2.5 2.5 0 0 0 4 20.5z" />
    <path d="M4 20.5A2.5 2.5 0 0 0 6.5 23H20v-5" />
  </Icon>
);

export const GrownUpIcon = () => (
  <Icon>
    <circle cx="9" cy="7" r="3" />
    <path d="M3.5 20a5.5 5.5 0 0 1 11 0" />
    <circle cx="17.5" cy="10" r="2.2" />
    <path d="M15 20a4 4 0 0 1 6.5-3" />
  </Icon>
);
