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
 * Putting Pybricks v4 on a LEGO MINDSTORMS EV3 (asked for on 2026-11-08 for EV3 support, ADR 0019),
 * in MatPilot's own words, pointing to Pybricks' own installer.
 *
 * Sources (PC = pybricks-code at ea9af98d1fd0a842ed76d3a7f83767f363bc1b17, FW = pybricks-micropython
 * at c860b6a00301fb7c6ecd429da11dcb5a6c557c7a, ED = ev3dev.github.io at 1f1981bbb258):
 * - The installer offers "MINDSTORMS EV3": PC src/components/hubPicker/HubPicker.tsx#L69-L74.
 * - The EV3's steps, in this order: turn it off; hold the right button; press the centre button to
 *   turn it on; when the screen says "Updating...", release both buttons; connect the USB cable:
 *   PC src/firmware/bootloaderInstructions/BootloaderInstructions.tsx#L174-L331 (the EV3 branches
 *   at #L177, #L240, #L267-L277, #L292-L304, #L319-L328; the right button at #L127-L128), with the
 *   words in PC src/firmware/bootloaderInstructions/translations/en.json. Pybricks' own notes put
 *   the cable in first and say it may stay plugged in: FW bricks/ev3/README.md#L30-L35.
 * - The device to choose in the browser's dialog, "LEGO EV3 Firmware Update":
 *   PC src/firmware/bootloaderInstructions/BootloaderInstructions.tsx#L59.
 * - Linux needs udev rules first; the Windows driver note is not shown for EV3:
 *   PC src/firmware/bootloaderInstructions/BootloaderInstructions.tsx#L426 #L445.
 * - Restoring LEGO's firmware asks which (1.09H, 1.09E or MakeCode): PC src/firmware/sagas.ts
 *   #L1354-L1410, PC .../translations/en.json "selectEV3FirmwareType".
 * - Pybricks needs no microSD card; it is installed as a firmware update: FW bricks/ev3/README.md
 *   #L26-L27. Pybricks calls the EV3 firmware "highly experimental": FW bricks/ev3/README.md#L74.
 * - ev3dev runs from a microSD card and never touches the EV3's firmware; to switch back, shut
 *   down and remove the card: ED index.md#L80-L84. It starts from the card on LEGO's firmware
 *   (the MINDSTORMS splash first): ED docs/getting-started.md#L173-L178.
 * - The EV3's screen can show its firmware version (v4.1.0b5 and newer): FW CHANGELOG.md#L92.
 * - Back button turns the EV3 off; holding back and centre for several seconds restarts a frozen
 *   one: FW bricks/ev3/README.md#L56-L62.
 */
export function PybricksInstallEv3() {
  return (
    <section className="doc-section" aria-labelledby="ev3-title">
      <h2 id="ev3-title">LEGO® MINDSTORMS EV3 (coming soon)</h2>
      <p>
        MatPilot is learning to program the EV3 too: first over a USB cable, then over Bluetooth.
        You can get an EV3 ready now. Like SPIKE Prime, it needs <strong>Pybricks v4</strong>, which
        Pybricks’ installer puts on the brick itself: no microSD card is needed. Pybricks calls its
        EV3 firmware newer and less tested than SPIKE Prime’s.
      </p>
      <ol className="doc-steps">
        <li>
          <PowerOffIcon />
          <div>
            <strong>Using ev3dev, or another system on a microSD card?</strong> Turn the EV3 off
            with its back button and take the card out. Keep it: ev3dev never changes the brick’s
            own firmware, and starts from its card only while the card is in.
          </div>
        </li>
        <li>
          <ComputerIcon />
          <div>
            <strong>Open the installer.</strong> On a computer with Chrome or Edge, go to{' '}
            <a href={PYBRICKS.app} target="_blank" rel="noopener">
              code.pybricks.com
            </a>
            , open its tools menu, choose <strong>Install Pybricks Firmware</strong>, and pick{' '}
            <strong>MINDSTORMS EV3</strong>.
          </div>
        </li>
        <li>
          <HoldButtonIcon />
          <div>
            <strong>With the EV3 off, hold its right button</strong>, and keep holding it.
          </div>
        </li>
        <li>
          <BlinkIcon />
          <div>
            <strong>Press the centre button</strong> to turn the EV3 on. When the screen says
            “Updating…”, let go of both buttons.
          </div>
        </li>
        <li>
          <CableIcon />
          <div>
            <strong>Plug in the USB cable</strong> between the EV3 and the computer (Pybricks’ notes
            say it may also stay plugged in from the start).
          </div>
        </li>
        <li>
          <ListIcon />
          <div>
            <strong>Choose the brick.</strong> In the browser’s pop-up, choose “LEGO EV3 Firmware
            Update” and press Connect. Wait until the installer says it is done; the EV3 then starts
            Pybricks.
          </div>
        </li>
      </ol>
      <ul className="doc-notes">
        <li>
          On Linux, the installer first asks for a setting (
          <a href={PYBRICKS.linux} target="_blank" rel="noopener">
            Pybricks on Linux
          </a>
          ).
        </li>
        <li>
          The EV3’s screen can show which firmware it has. Turn it off with the back button; if it
          ever freezes, hold the back and centre buttons for a few seconds to restart it.
        </li>
        <li>
          Want LEGO’s firmware back? The tools menu’s{' '}
          <strong>Restore official LEGO firmware</strong> works the same way and asks which version
          (1.09H, 1.09E or MakeCode). To use ev3dev again, restore LEGO’s firmware first, then put
          the card back in.
        </li>
        <li>
          Until MatPilot can program the EV3, Pybricks Code (
          <a href={PYBRICKS.app} target="_blank" rel="noopener">
            code.pybricks.com
          </a>
          ) can.
        </li>
      </ul>
    </section>
  );
}
