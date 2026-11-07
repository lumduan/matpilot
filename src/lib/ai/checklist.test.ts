import { describe, expect, it } from 'vitest';
import { promptChecklist } from './checklist';

const CODE = 'def square(size):\n    robot.straight(size)\n    robot.turn(90)\n';
const ticks = (question: string) =>
  Object.fromEntries(promptChecklist(question, 'review', CODE).map((item) => [item.id, item.ok]));

describe('the prompt checklist', () => {
  it('ticks nothing for an empty prompt', () => {
    expect(ticks('')).toEqual({ ask: false, part: false, expect: false, answer: false });
  });

  it('ticks every item of a good English prompt', () => {
    expect(
      ticks('Why does my robot not stop after the square? I want it to stop. Give me a hint.'),
    ).toEqual({ ask: true, part: true, expect: true, answer: true });
  });

  it('understands Thai', () => {
    expect(ticks('ทำไมหุ่นไม่หยุด อยากให้หยุดตรงเส้นดำ อธิบายทีละขั้นตอน')).toEqual({
      ask: true,
      part: true,
      expect: true,
      answer: true,
    });
  });

  it('counts a line number or a name from the program as the part', () => {
    expect(ticks('what is line 2 for')).toMatchObject({ part: true });
    expect(ticks('what is square for')).toMatchObject({ part: true });
    expect(ticks('what is this for')).toMatchObject({ part: false });
  });
});
