import { describe, expect, it } from 'vitest';
import {
  DRIVE_FINGERS,
  INPUT_OPTIONS,
  XBOX_PROFILE,
  buttonFinger,
  controllerProfile,
  inputFingers,
  inputOption,
} from './layout';
import { XBOX_BUTTONS } from './xbox';

describe('the Xbox layout', () => {
  it('draws every button the program reports, once', () => {
    const drawn = [
      ...XBOX_PROFILE.keys.map((key) => key.button),
      ...XBOX_PROFILE.sticks.map((stick) => stick.click),
    ];
    expect([...drawn].sort()).toEqual(XBOX_BUTTONS.map((button) => button.python).sort());
  });

  it('knows which finger reaches a control', () => {
    expect(buttonFinger(XBOX_PROFILE, 'A')).toBe('right thumb');
    expect(buttonFinger(XBOX_PROFILE, 'LB')).toBe('left index finger');
    expect(buttonFinger(XBOX_PROFILE, 'LJ')).toBe('left thumb');
    expect(inputFingers(XBOX_PROFILE, inputOption('RB_LB')!.input)).toEqual([
      'right index finger',
      'left index finger',
    ]);
    expect(inputFingers(XBOX_PROFILE, inputOption('TRIGGERS')!.input)).toEqual([
      'left index finger',
      'right index finger',
    ]);
    expect(DRIVE_FINGERS.ONE_STICK).toEqual(['left thumb']);
  });

  it('offers inputs with unique values whose buttons exist', () => {
    const values = INPUT_OPTIONS.map((option) => option.value);
    expect(new Set(values).size).toBe(values.length);
    const known = new Set<string>(XBOX_BUTTONS.map((button) => button.python));
    for (const option of INPUT_OPTIONS) {
      if (option.input.kind === 'pair') {
        expect(known.has(option.input.forward) && known.has(option.input.backward)).toBe(true);
      }
    }
    expect(controllerProfile(null).id).toBe('XBOX');
    expect(controllerProfile('NOPE').id).toBe('XBOX');
  });
});
