import type { ReactNode } from 'react';
import {
  BlocksIcon,
  CodeIcon,
  PlayIcon,
  PortsIcon,
  SaveIcon,
  StopIcon,
  TabsIcon,
  TapIcon,
  UndoIcon,
} from './icons';

/** One thing the Blocks page does, with its picture. */
function Item({ icon, children }: { icon: ReactNode; children: ReactNode }) {
  return (
    <li>
      {icon}
      <div>{children}</div>
    </li>
  );
}

/**
 * How the Blocks page works, in short. This was the Blocks page's own introduction; it moved here
 * (the home page and the Docs) so the blocks get the whole window.
 */
export function BlocksBasics() {
  return (
    <ul className="doc-steps doc-steps-plain">
      <Item icon={<PlayIcon />}>
        <strong>Snap blocks together</strong> under “when the program starts” and press{' '}
        <strong>Run</strong>.
      </Item>
      <Item icon={<TapIcon />}>
        <strong>Tap a block’s picture</strong> to choose a port, a turn, a speed or a light picture.
      </Item>
      <Item icon={<BlocksIcon />}>
        <strong>Find blocks by colour</strong> on the left: Movement, Motors, Light, Sound, Control,
        Conditions (if, else and switch), Sensors and more.
      </Item>
      <Item icon={<CodeIcon />}>
        <strong>Python</strong> shows the code your blocks make. You can edit it too.
      </Item>
      <Item icon={<TabsIcon />}>
        <strong>Make blocks of your own</strong> in Functions, and keep them in tabs (+): each tab
        is a Python file that main uses.
      </Item>
      <Item icon={<UndoIcon />}>
        <strong>Undo</strong> (↶) takes back a change.
      </Item>
      <Item icon={<SaveIcon />}>
        <strong>Save</strong> and <strong>Load</strong> keep programs in a file, or in your team’s
        GitHub repository.
      </Item>
      <Item icon={<StopIcon />}>
        <strong>Stop</strong> ends the program, and every motor stops with it. Leaving the page or
        disconnecting stops it too. If the Bluetooth connection drops, the program keeps running on
        the hub: press the hub’s centre button to stop it.
      </Item>
      <Item icon={<PortsIcon />}>
        <strong>The bar above the blocks</strong> shows what is plugged into each port while no
        program runs.
      </Item>
    </ul>
  );
}
