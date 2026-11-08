import * as Blockly from 'blockly/core';
import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import { NO_HINTS, type PortHints } from './fields/hints';
import { generateTabs } from './generator';
import { hardwareWarnings, missingDevice, type HardwareUse } from './hardware';
import { loadWorkspace, registerBlocks } from './register';
import { controllerFlyout } from './simple-toolbox';
import { MAIN_TAB_ID, linkTab, type ProgramTab } from './tabs';
import type { FlyoutItem } from './toolbox';

const motor = { kind: 'motor', name: 'medium motor' } as const;
/** The maintainer's car on 2026-11-08: motors on A and B, nothing on C to F. */
const CAR: PortHints = { A: motor, B: motor, C: null, D: null, E: null, F: null };

const opened: Blockly.Workspace[] = [];
beforeAll(() => registerBlocks());
afterEach(() => {
  for (const workspace of opened.splice(0)) workspace.dispose();
});

/** The program a flyout's first block makes under "when the program starts". */
function programOf(item: FlyoutItem) {
  const { kind: _kind, ...state } = item;
  void _kind;
  const workspace = new Blockly.Workspace();
  opened.push(workspace);
  const program: ProgramTab[] = [{ id: MAIN_TAB_ID, name: 'main', workspace }];
  linkTab(workspace, () => program, null);
  loadWorkspace(workspace, {
    blocks: {
      languageVersion: 0,
      blocks: [{ type: 'mp_program', x: 0, y: 0, next: { block: state } }],
    },
  });
  return generateTabs(program);
}

const group = (hints: PortHints) =>
  controllerFlyout({ hints, movement: null }).find((item) => item.kind === 'block')!;

const types = (item: FlyoutItem): string[] => JSON.stringify(item).match(/mp_[a-z_]+/g) ?? [];

describe('the ports the program needs, against what the hub sees', () => {
  it('names the empty port that would stop a controller program with a motor block', () => {
    // The ready-made group as it was before 2026-11-08, with "A ↻ and B ↺ runs motors C ↻".
    const motorBlock = { type: 'mp_ctrl_motor', fields: { SOURCE: 'A_B', MOTORS: 'C+' } };
    const program = programOf({
      kind: 'block',
      type: 'mp_ctrl_use',
      fields: { CONTROLLER: 'XBOX' },
      next: {
        block: {
          type: 'mp_forever',
          inputs: {
            DO: {
              block: {
                type: 'mp_ctrl_drive',
                fields: { STYLE: 'ONE_STICK' },
                next: { block: motorBlock },
              },
            },
          },
        },
      },
    } as FlyoutItem);
    expect(program.hardware.map((use) => [use.port, use.device, use.what])).toEqual([
      ['C', 'Motor', '“A ↻ and B ↺ runs motors C ↻”'],
      ['A', 'Motor', 'the robot’s left wheel'],
      ['B', 'Motor', 'the robot’s right wheel'],
    ]);
    const warnings = hardwareWarnings(program.hardware, CAR);
    expect(warnings.map((warning) => warning.message)).toEqual([
      'Port C is empty, but “A ↻ and B ↺ runs motors C ↻” needs a motor there. The program would stop as soon as it starts. Plug a motor into C, or choose another port.',
    ]);
    expect(warnings[0]?.blockId).toBe(program.hardware[0]?.blockId);
  });

  it('says when a port has another device, and checks nothing without a hub', () => {
    const uses: HardwareUse[] = [
      {
        port: 'D',
        device: 'ColorSensor',
        blockId: 'b1',
        tabId: 'main',
        what: '“colour sensor D sees red”',
      },
      {
        port: 'D',
        device: 'ColorSensor',
        blockId: 'b2',
        tabId: 'main',
        what: '“colour sensor D colour”',
      },
      { port: 'E', device: 'UltrasonicSensor', blockId: null, tabId: 'main', what: 'x' },
    ];
    const hints: PortHints = { D: { kind: 'force', name: 'force sensor' } };
    expect(hardwareWarnings(uses, hints).map((warning) => warning.message)).toEqual([
      'Port D has a force sensor, but “colour sensor D sees red” needs a colour sensor there. Plug a colour sensor into D, or choose another port.',
    ]);
    expect(hardwareWarnings(uses, NO_HINTS)).toEqual([]);
    expect(hardwareWarnings(uses, { D: { kind: 'color', name: 'colour sensor' } })).toEqual([]);
  });
});

describe('the ready-made controller group', () => {
  it('only drives: no motor block, which needs a motor on its port', () => {
    for (const hints of [NO_HINTS, CAR, { ...CAR, D: motor }]) {
      expect(types(group(hints))).toEqual(['mp_ctrl_use', 'mp_forever', 'mp_ctrl_drive']);
    }
    expect(hardwareWarnings(programOf(group(CAR)).hardware, CAR)).toEqual([]);
  });
});

describe('a run that stopped on a missing device', () => {
  const program = () => programOf(group(NO_HINTS));
  it('names the port from the traceback’s line', () => {
    // The ready-made group of before 2026-11-08 (with the motor block), as it ran on the car.
    const files = [
      {
        name: 'main.py',
        code: 'MOTOR_C_PORT = Port.C\nhub = PrimeHub()\nmotor_c = Motor(MOTOR_C_PORT)\n',
      },
    ];
    const output = [
      'Traceback (most recent call last):',
      '  File "main.py", line 3, in <module>',
      'OSError: [Errno 19] ENODEV:',
      '',
      'A sensor or motor is not connected to the specified port:',
    ];
    expect(missingDevice(output, files)).toEqual({
      port: 'C',
      device: 'Motor',
      name: 'motor_c',
      file: 'main.py',
      line: 3,
      message:
        'The program stopped at its start: port C has no motor (line 3 of main.py: motor_c = Motor(MOTOR_C_PORT)). Plug a motor into C, or change the port in the blocks.',
    });
  });

  it('says nothing for other errors, or a line that makes no device', () => {
    const files = program().files.map(({ name, code }) => ({ name, code }));
    expect(missingDevice(['Program started.', 'hello'], files)).toBeNull();
    expect(
      missingDevice(
        ['  File "main.py", line 1, in <module>', 'OSError: [Errno 19] ENODEV:'],
        files,
      ),
    ).toBeNull();
  });
});
