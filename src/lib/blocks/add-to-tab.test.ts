import * as Blockly from 'blockly/core';
import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import { addToTab } from './add-to-tab';
import { FUNCTION_BLOCKS } from './functions';
import { generateTabs } from './generator';
import { stepsToBlocks } from './incoming';
import { loadWorkspace, registerBlocks } from './register';
import { MAIN_TAB_ID, linkTab, type ProgramTab } from './tabs';

const opened: Blockly.Workspace[] = [];
beforeAll(() => registerBlocks());
afterEach(() => {
  for (const workspace of opened.splice(0)) workspace.dispose();
});

/** main with "when the program starts", and a tab "r1" with these blocks. */
function program(r1: object[] = []): ProgramTab[] {
  const tabs: ProgramTab[] = [];
  for (const [id, name] of [
    [MAIN_TAB_ID, 'main'],
    ['tab-r1', 'r1'],
  ] as const) {
    const workspace = new Blockly.Workspace();
    opened.push(workspace);
    tabs.push({ id, name, workspace });
    linkTab(workspace, () => tabs, null);
  }
  loadWorkspace(tabs[0]!.workspace, {
    blocks: { languageVersion: 0, blocks: [{ type: 'mp_program', x: 0, y: 0 }] },
  });
  Blockly.serialization.workspaces.load(
    { blocks: { languageVersion: 0, blocks: r1 } },
    tabs[1]!.workspace,
  );
  return tabs;
}

/** The path from the Mats page: turn, then move. */
const path = () =>
  stepsToBlocks([
    { kind: 'turn', degrees: 90 },
    { kind: 'straight', mm: 300 },
  ])!;

describe('blocks added to the open tab', () => {
  it('go at the end of main’s program', () => {
    const tabs = program();
    const added = addToTab(tabs[0]!.workspace, { name: 'main', isMain: true }, path());
    expect(added).toMatchObject({
      blocks: 2,
      attached: true,
      message: 'Added 2 blocks at the end of main.',
    });
    expect(generateTabs(tabs).loose).toEqual([]);
  });

  it('go into a new block of your own in a tab without one, which main can call', () => {
    const tabs = program();
    const added = addToTab(tabs[1]!.workspace, { name: 'r1', isMain: false }, path());
    expect(added).toMatchObject({
      blocks: 2,
      attached: true,
      message:
        'Added 2 blocks in a new block of your own, “path”, in the tab r1. Use it in main: Functions › path.',
    });
    const generated = generateTabs(tabs);
    expect(generated.loose).toEqual([]);
    expect(generated.problems).toEqual([]);
    const r1 = generated.files.find((file) => file.name === 'r1.py')?.code ?? '';
    expect(r1).toMatch(/def path\(\):\n {4}robot\.turn\(90\)\n {4}robot\.straight\(300\)/);
  });

  it('go at the end of the tab’s last block of your own', () => {
    const define = (id: string, name: string, y: number) => ({
      type: FUNCTION_BLOCKS.define,
      id,
      x: 0,
      y,
      fields: { NAME: name },
      inputs: { DO: { block: { type: 'mp_sound_beep' } } },
    });
    const tabs = program([define('d1', 'first', 0), define('d2', 'run1', 300)]);
    const added = addToTab(tabs[1]!.workspace, { name: 'r1', isMain: false }, path());
    expect(added).toMatchObject({
      blocks: 2,
      attached: true,
      message: 'Added 2 blocks at the end of “run1” in the tab r1.',
    });
    const r1 = generateTabs(tabs).files.find((file) => file.name === 'r1.py')?.code ?? '';
    expect(r1).toMatch(
      /def run1\(\):\n {4}hub\.speaker\.beep\(\)\n {4}robot\.turn\(90\)\n {4}robot\.straight\(300\)/,
    );
  });
});
