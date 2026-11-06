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
  const file = {
    name: 'Robot car',
    savedBy: ' Ploy ',
    savedAt: '2026-11-06T03:42:00.000Z',
    python: 'print(1)\nprint(2)\n',
    workspace: STARTER_WORKSPACE,
  };

  it('round-trips, with the Python as readable lines', () => {
    const text = serializeProgramFile(file);
    const data = JSON.parse(text) as Record<string, unknown>;
    expect(data).toMatchObject({
      format: 'matpilot-blocks',
      version: 1,
      name: 'Robot car',
      savedBy: 'Ploy',
      python: ['print(1)', 'print(2)'],
    });
    expect(text.endsWith('}\n')).toBe(true);
    expect(parseProgramFile(text, 'ignored.json')).toEqual({
      ok: true,
      name: 'Robot car',
      savedBy: 'Ploy',
      savedAt: '2026-11-06T03:42:00.000Z',
      workspace: JSON.parse(JSON.stringify(STARTER_WORKSPACE)),
    });
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
      parseProgramFile('{"format":"matpilot-blocks","version":2,"workspace":{}}', 'x'),
    ).toMatchObject({ ok: false, message: /newer MatPilot/ });
    expect(parseProgramFile('{"format":"matpilot-blocks","version":1}', 'x')).toMatchObject({
      ok: false,
      message: /no blocks/,
    });
  });
});
