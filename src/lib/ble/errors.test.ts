import { describe, expect, it } from 'vitest';
import { classifyRequestDeviceError, describeGattError, errorDetail, errorName } from './errors';

describe('classifyRequestDeviceError', () => {
  it('treats the spec cancellation error (NotFoundError) as a cancelled picker', () => {
    const cancelled = new DOMException(
      'User cancelled the requestDevice() chooser.',
      'NotFoundError',
    );
    expect(classifyRequestDeviceError(cancelled)).toEqual({ kind: 'cancelled' });
  });

  it('distinguishes a missing adapter from a cancelled picker', () => {
    const outcome = classifyRequestDeviceError(
      new DOMException('Bluetooth adapter not available.', 'NotFoundError'),
    );
    expect(outcome.kind === 'error' && outcome.error.kind).toBe('bluetooth-unavailable');
  });

  it.each(['SecurityError', 'NotAllowedError'])('maps %s to "blocked"', (name) => {
    const outcome = classifyRequestDeviceError(new DOMException('nope', name));
    expect(outcome.kind === 'error' && outcome.error.kind).toBe('blocked');
  });

  it('maps anything else to "unexpected" and keeps the detail', () => {
    const outcome = classifyRequestDeviceError(new TypeError('Invalid Service name'));
    expect(outcome.kind).toBe('error');
    if (outcome.kind !== 'error') return;
    expect(outcome.error.kind).toBe('unexpected');
    expect(outcome.error.detail).toBe('TypeError: Invalid Service name');
  });

  it('copes with non-Error values', () => {
    expect(classifyRequestDeviceError('weird').kind).toBe('error');
    expect(classifyRequestDeviceError(undefined).kind).toBe('error');
  });
});

describe('describeGattError', () => {
  it('describes connection failures', () => {
    expect(describeGattError(new DOMException('x', 'NetworkError'), 'connect').kind).toBe(
      'connect-failed',
    );
  });

  it('names the characteristic that could not be read', () => {
    expect(describeGattError(new Error('x'), 'read-firmware-revision').message).toMatch(
      /firmware revision/,
    );
    expect(describeGattError(new Error('x'), 'read-software-revision').message).toMatch(
      /protocol version/,
    );
  });
});

describe('error helpers', () => {
  it('extract name and detail defensively', () => {
    expect(errorName(new DOMException('m', 'NetworkError'))).toBe('NetworkError');
    expect(errorName(null)).toBeNull();
    expect(errorName({ name: 42 })).toBeNull();
    expect(errorDetail(new DOMException('Lost.', 'NetworkError'))).toBe('NetworkError: Lost.');
    expect(errorDetail('plain')).toBe('plain');
  });
});
