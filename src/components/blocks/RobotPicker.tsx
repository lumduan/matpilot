'use client';

import Link from 'next/link';
import { useRobots } from '@/hooks/useRobots';
import type { DriveSource } from '@/lib/blocks/generator';
import { robotProblems, sameRobot, type RobotProfile } from '@/lib/robots/profile';

const NONE = '';

/**
 * The robot this program is for (ADR 0016, D4), beside the tabs. The program keeps its own copy
 * of the robot, so a teammate who opens it gets the same robot; when the robot changes on the
 * Robots page, the copy is updated only when asked.
 */
export function RobotPicker({
  robot,
  drive,
  disabled,
  onChoose,
}: {
  /** The program's copy of its robot. */
  robot: RobotProfile | null;
  drive: { readonly portsFrom: DriveSource; readonly wheelsFrom: DriveSource } | null;
  disabled: boolean;
  onChoose: (robot: RobotProfile | null) => void;
}) {
  const library = useRobots();
  const saved = robot ? library.robots.find((each) => each.id === robot.id) : undefined;
  const changed = robot && saved && !sameRobot(robot, saved) && robotProblems(saved).length === 0;
  const fromBlocks = [
    drive?.portsFrom === 'blocks' ? '“set movement motors”' : null,
    drive?.wheelsFrom === 'blocks' ? '“set wheel size”' : null,
  ].filter(Boolean);
  const title = robot
    ? `This program is for the robot “${robot.name}”: its drive motors are ports ${robot.drive.left} and ${robot.drive.right}, its wheels ${robot.wheels.diameterMm} mm, ${robot.wheels.trackMm} mm apart.${
        fromBlocks.length > 0
          ? ` The ${fromBlocks.join(' and ')} block in this program wins over the robot.`
          : ''
      }`
    : 'Choose the robot this program is for. Without one, the program uses ports A and B and 56 mm wheels, or what its “set movement motors” and “set wheel size” blocks say.';
  return (
    <div className="robot-picker" data-testid="robot-picker">
      <label className="robot-picker-label" title={title}>
        <span className="robot-picker-name">Robot</span>
        <select
          className="robot-picker-select"
          value={robot?.id ?? NONE}
          disabled={disabled}
          onChange={(event) => {
            const id = event.target.value;
            if (id === NONE) onChoose(null);
            else if (id !== robot?.id || !saved) {
              const chosen = library.robots.find((each) => each.id === id);
              if (chosen) onChoose(chosen);
            }
          }}
          data-testid="robot-picker-select"
        >
          <option value={NONE}>No robot</option>
          {library.robots.map((each) => {
            const broken = robotProblems(each).length > 0;
            return (
              <option key={each.id} value={each.id} disabled={broken}>
                {each.name}
                {broken ? ' (fix it on the Robots page)' : ''}
              </option>
            );
          })}
          {robot && !saved && <option value={robot.id}>{robot.name} (from this program)</option>}
        </select>
      </label>
      {changed && (
        <button
          type="button"
          className="button button-small"
          disabled={disabled}
          onClick={() => saved && onChoose(saved)}
          title={`“${robot.name}” was changed on the Robots page. Use those changes in this program.`}
          data-testid="robot-picker-update"
        >
          Update
        </button>
      )}
      {robot && !saved && (
        <button
          type="button"
          className="button button-small"
          onClick={() => library.save(robot)}
          title="Keep this program’s robot on the Robots page too."
          data-testid="robot-picker-keep"
        >
          Keep
        </button>
      )}
      {library.robots.length === 0 && !robot && (
        <Link href="/robots" className="robot-picker-link">
          Make one
        </Link>
      )}
      {robot && fromBlocks.length > 0 && (
        <span className="robot-picker-note" data-testid="robot-picker-note">
          blocks win
        </span>
      )}
    </div>
  );
}
