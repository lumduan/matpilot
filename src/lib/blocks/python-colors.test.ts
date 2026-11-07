import { describe, expect, it } from 'vitest';
import { colouredPieces, pythonTokens } from './python-colors';

const kinds = (code: string) =>
  pythonTokens(code).map((token) => `${code.slice(token.from, token.to)}:${token.kind}`);

describe('Python colours', () => {
  it('colour Python as VS Code does: keywords, names, text, numbers, comments', () => {
    const code = [
      'from setup import hub, Color',
      'import tab2',
      '# says hi',
      'for count in range(4):',
      '    hub.display.icon(Icon.HAPPY)',
      '    tab2.square(-200)',
      "    x = 'a\\n' + str(5)",
      '    print(True and None)',
      'def square(side):',
      '    return LEFT_WHEEL_PORT',
    ].join('\n');
    expect(kinds(code)).toEqual([
      'from:control',
      'setup:module',
      'import:control',
      'hub:variable',
      'Color:class',
      'import:control',
      'tab2:module',
      '# says hi:comment',
      'for:control',
      'count:variable',
      'in:keyword',
      'range:function',
      '(:bracket1',
      '4:number',
      '):bracket1',
      'hub:variable',
      'display:variable',
      'icon:function',
      '(:bracket1',
      'Icon:class',
      'HAPPY:constant',
      '):bracket1',
      'tab2:module',
      'square:function',
      '(:bracket1',
      '200:number',
      '):bracket1',
      'x:variable',
      "'a:string",
      '\\n:escape',
      "':string",
      'str:function',
      '(:bracket1',
      '5:number',
      '):bracket1',
      'print:function',
      '(:bracket1',
      'True:keyword',
      'and:keyword',
      'None:keyword',
      '):bracket1',
      'def:keyword',
      'square:function',
      '(:bracket1',
      'side:variable',
      '):bracket1',
      'return:control',
      'LEFT_WHEEL_PORT:constant',
    ]);
  });

  it('colour nested brackets by depth, as VS Code does', () => {
    expect(kinds('f([{}])').filter((each) => !each.startsWith('f:'))).toEqual([
      '(:bracket1',
      '[:bracket2',
      '{:bracket3',
      '}:bracket3',
      ']:bracket2',
      '):bracket1',
    ]);
  });

  it('keep every character, in order, for the read-only view', () => {
    const code = 'hub.light.on(Color.RED)  # red\nwait(500)\n';
    expect(
      colouredPieces(code)
        .map((piece) => piece.text)
        .join(''),
    ).toBe(code);
  });
});
