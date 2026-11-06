import { describe, expect, it } from 'vitest';
import {
  DEFAULT_PROGRAM_NAME,
  PROGRAM_NAME_MAX_LENGTH,
  cleanProgramName,
  isProgramFileName,
  parseProgramFile,
  programFileName,
  programNameFromFileName,
  serializeProgramFile,
} from './program-file';
import { STARTER_WORKSPACE } from './starter';

describe('program names', () => {
  it('keeps letters in any script and spaces, and removes what file systems refuse', () => {
    expect(cleanProgramName('  Robot   car  ')).toBe('Robot car');
    expect(cleanProgramName('หุ่นยนต์ เดินตามเส้น')).toBe('หุ่นยนต์ เดินตามเส้น');
    expect(cleanProgramName('a/b\\c:d*e?f"g<h>i|j')).toBe('a b c d e f g h i j');
    expect(cleanProgramName('..hidden')).toBe('hidden');
    expect(cleanProgramName('line\none\ttab')).toBe('line one tab');
    expect(cleanProgramName('x'.repeat(100))).toHaveLength(PROGRAM_NAME_MAX_LENGTH);
    expect(cleanProgramName(' / ')).toBe('');
  });

  it('makes file names and reads names back from them', () => {
    expect(programFileName('Robot car')).toBe('Robot car.matpilot.json');
    expect(programFileName('  ')).toBe(`${DEFAULT_PROGRAM_NAME}.matpilot.json`);
    expect(programNameFromFileName('Robot car.matpilot.json')).toBe('Robot car');
    expect(programNameFromFileName('Robot car.MATPILOT.JSON')).toBe('Robot car');
    expect(programNameFromFileName('downloads/Robot car (1).json')).toBe('Robot car (1)');
    expect(programNameFromFileName('.matpilot.json')).toBe('matpilot');
    expect(isProgramFileName('a.matpilot.json')).toBe(true);
    expect(isProgramFileName('.matpilot.json')).toBe(false);
    expect(isProgramFileName('a.json')).toBe(false);
  });
});

describe('program files', () => {
  const starter = JSON.parse(JSON.stringify(STARTER_WORKSPACE)) as object;
  const moves = { blocks: { languageVersion: 0, blocks: [] } };
  const file = {
    name: 'Robot car',
    savedBy: ' Ploy ',
    savedAt: '2026-11-06T03:42:00.000Z',
    python: [
      { name: 'main.py', code: 'import moves\nmoves.square(200)\n' },
      { name: 'moves.py', code: 'def square(side):\n    pass\n' },
    ],
    tabs: [
      { name: 'main', workspace: starter },
      { name: 'moves', workspace: moves },
    ],
  };

  it('round-trips every tab, with each Python file as readable lines', () => {
    const text = serializeProgramFile(file);
    const data = JSON.parse(text) as Record<string, unknown>;
    expect(data).toMatchObject({
      format: 'matpilot-blocks',
      version: 2,
      name: 'Robot car',
      savedBy: 'Ploy',
      python: [
        { file: 'main.py', lines: ['import moves', 'moves.square(200)'] },
        { file: 'moves.py', lines: ['def square(side):', '    pass'] },
      ],
      tabs: [{ name: 'main' }, { name: 'moves' }],
    });
    expect(text.endsWith('}\n')).toBe(true);
    expect(parseProgramFile(text, 'ignored.json')).toEqual({
      ok: true,
      name: 'Robot car',
      savedBy: 'Ploy',
      savedAt: '2026-11-06T03:42:00.000Z',
      tabs: [
        { name: 'main', workspace: starter },
        { name: 'moves', workspace: moves },
      ],
    });
  });

  it('opens a file from before tabs (version 1) as a program with only main', () => {
    const text = JSON.stringify({
      format: 'matpilot-blocks',
      version: 1,
      name: 'Old one',
      python: ['print(1)'],
      workspace: starter,
    });
    expect(parseProgramFile(text, 'x')).toMatchObject({
      ok: true,
      name: 'Old one',
      tabs: [{ name: 'main', workspace: starter }],
    });
  });

  it('calls the first tab main, and refuses damaged tabs', () => {
    const tabs = (list: unknown) =>
      JSON.stringify({ format: 'matpilot-blocks', version: 2, tabs: list });
    expect(parseProgramFile(tabs([{ name: 'start', workspace: {} }]), 'x')).toMatchObject({
      ok: true,
      tabs: [{ name: 'main' }],
    });
    for (const bad of [
      [
        { name: 'main', workspace: {} },
        { name: 'main', workspace: {} },
      ],
      [{ name: 'main', workspace: {} }, { name: 'moves' }],
      [{ name: 'main', workspace: {} }, { workspace: {} }],
      Array.from({ length: 11 }, (_, i) => ({ name: `t${i}`, workspace: {} })),
    ]) {
      expect(parseProgramFile(tabs(bad), 'x')).toMatchObject({ ok: false, message: /damaged/ });
    }
    expect(parseProgramFile(tabs([]), 'x')).toMatchObject({ ok: false, message: /no blocks/ });
  });

  it('names a program from its file name when the file has no name', () => {
    const text = JSON.stringify({ format: 'matpilot-blocks', version: 1, workspace: {} });
    expect(parseProgramFile(text, 'Line follower')).toMatchObject({
      ok: true,
      name: 'Line follower',
      savedBy: '',
      savedAt: '',
    });
  });

  it('explains files it cannot open', () => {
    expect(parseProgramFile('not json', 'x')).toMatchObject({ ok: false, message: /not JSON/ });
    expect(parseProgramFile('{"blocks":{}}', 'x')).toMatchObject({
      ok: false,
      message: /not a MatPilot/,
    });
    expect(
      parseProgramFile('{"format":"matpilot-blocks","version":3,"tabs":[]}', 'x'),
    ).toMatchObject({ ok: false, message: /newer MatPilot/ });
    expect(parseProgramFile('{"format":"matpilot-blocks","version":1}', 'x')).toMatchObject({
      ok: false,
      message: /no blocks/,
    });
  });
});
