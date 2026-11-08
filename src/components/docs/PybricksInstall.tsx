import { TESTED_FIRMWARE_VERSION } from '@/lib/pybricks/baseline';
import { PYBRICKS } from '@/lib/links';
import {
  BlinkIcon,
  CableIcon,
  ComputerIcon,
  HoldButtonIcon,
  ListIcon,
  PowerOffIcon,
} from './icons';

/**
 * Putting Pybricks on a SPIKE Prime hub, in MatPilot's own words, pointing to Pybricks' own
 * installer and guide (their pages and videos are theirs: link, never copy).
 *
 * The steps follow Pybricks Code's installer for the Prime hub, at pybricks-code commit
 * ea9af98d1fd0a842ed76d3a7f83767f363bc1b17:
 * - the order (hold the button, connect USB, wait for the light, release the button):
 *   https://github.com/pybricks/pybricks-code/blob/ea9af98d1fd0a842ed76d3a7f83767f363bc1b17/src/firmware/bootloaderInstructions/BootloaderInstructions.tsx#L214-L306
 * - the Bluetooth button, the light's "pink-green-blue-off", turning the hub off and unplugging
 *   first, and the device to choose:
 *   https://github.com/pybricks/pybricks-code/blob/ea9af98d1fd0a842ed76d3a7f83767f363bc1b17/src/firmware/bootloaderInstructions/translations/en.json
 *   https://github.com/pybricks/pybricks-code/blob/ea9af98d1fd0a842ed76d3a7f83767f363bc1b17/src/firmware/bootloaderInstructions/BootloaderInstructions.tsx#L58-L62
 * The tools menu items and the restore path: https://pybricks.com/learn/getting-started/install-pybricks/
 */
export function PybricksInstall({ headingLevel = 2 }: { headingLevel?: 2 | 3 }) {
  const Heading = headingLevel === 2 ? 'h2' : 'h3';
  return (
    <section className="doc-section" id="install-pybricks" aria-labelledby="install-pybricks-title">
      <Heading id="install-pybricks-title">Put Pybricks on your hub</Heading>
      <p>
        MatPilot talks to hubs that run <strong>Pybricks</strong>, free firmware made by the
        Pybricks team. You put it on the hub once, with a USB cable; after that MatPilot connects
        over Bluetooth. Pybricks’ own installer does the work:
      </p>
      <ol className="doc-steps">
        <li>
          <ComputerIcon />
          <div>
            <strong>Open the installer.</strong> On a computer with Chrome or Edge, go to{' '}
            <a href={PYBRICKS.app} target="_blank" rel="noopener">
              code.pybricks.com
            </a>
            , open its tools menu and choose <strong>Install Pybricks Firmware</strong>. It asks a
            few questions first: the hub (SPIKE Prime), the licences, and a name for the hub.
          </div>
        </li>
        <li>
          <PowerOffIcon />
          <div>
            <strong>Get the hub ready.</strong> Turn the hub off and unplug its USB cable.
          </div>
        </li>
        <li>
          <HoldButtonIcon />
          <div>
            <strong>Hold the Bluetooth button</strong> on the hub, and keep holding it.
          </div>
        </li>
        <li>
          <CableIcon />
          <div>
            <strong>Plug in the USB cable</strong> (micro-USB) between the hub and the computer.
          </div>
        </li>
        <li>
          <BlinkIcon />
          <div>
            <strong>Wait for the light.</strong> When the Bluetooth light blinks pink, green, blue,
            let go of the button.
          </div>
        </li>
        <li>
          <ListIcon />
          <div>
            <strong>Choose the hub.</strong> In the browser’s pop-up, choose “LEGO Technic Large Hub
            in DFU Mode” and press Connect. Wait until the installer says it is done.
          </div>
        </li>
      </ol>
      <p className="doc-actions">
        <a className="button button-primary" href={PYBRICKS.app} target="_blank" rel="noopener">
          Open the Pybricks installer
        </a>
        <a className="button" href={PYBRICKS.installGuide} target="_blank" rel="noopener">
          Pybricks’ guide, with a video
        </a>
      </p>
      <ul className="doc-notes">
        <li>
          Linux needs a setting first (
          <a href={PYBRICKS.linux} target="_blank" rel="noopener">
            Pybricks on Linux
          </a>
          ); on Windows the installer may ask you to install a USB driver.
        </li>
        <li>
          Want the LEGO app back? The same tools menu has{' '}
          <strong>Restore official LEGO firmware</strong>, and it works the same way.
        </li>
        <li>
          MatPilot is tested with Pybricks v{TESTED_FIRMWARE_VERSION}. When you connect, it shows
          the version your hub has, and says so when it is another one.
        </li>
      </ul>
    </section>
  );
}
