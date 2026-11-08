/**
 * What went wrong connecting over USB, in the same shape as the Bluetooth errors
 * (../ble/errors.ts), so the page shows both the same way. Web Serial's error names are from the
 * WICG spec (commit 418b5afa699646664f1548161cf6deab43adb0db, index.bs): requestPort() rejects
 * with NotFoundError when no port was chosen and SecurityError when not allowed; open() rejects
 * with NetworkError when the port cannot be opened.
 */
import { errorDetail, errorName, type ProbeError, type RequestDeviceOutcome } from '../ble/errors';
import { UsbCommandError, UsbTimeoutError } from './serial-link';

export function usbUnavailableError(): ProbeError {
  return {
    kind: 'api-unavailable',
    title: 'USB is not available in this browser',
    message:
      'Connecting with a USB cable needs Web Serial: Chrome or Edge on a computer. Use Bluetooth instead.',
    detail: null,
  };
}

export function classifyRequestPortError(error: unknown): RequestDeviceOutcome {
  const name = errorName(error);
  if (name === 'NotFoundError' || name === 'AbortError') return { kind: 'cancelled' };
  if (name === 'SecurityError' || name === 'NotAllowedError') {
    return {
      kind: 'error',
      error: {
        kind: 'blocked',
        title: 'The browser blocked the USB request',
        message:
          'The request must start from a click on a page served over HTTPS or localhost, and serial ports must not be blocked for this site in the browser settings.',
        detail: errorDetail(error),
      },
    };
  }
  return {
    kind: 'error',
    error: {
      kind: 'unexpected',
      title: 'Could not open the port picker',
      message: 'The browser rejected the USB request.',
      detail: errorDetail(error),
    },
  };
}

/** A failure after the port was chosen: opening it, or the hub's first answers. */
export function describeUsbError(error: unknown): ProbeError {
  const detail = errorDetail(error);
  if (errorName(error) === 'NetworkError' || errorName(error) === 'InvalidStateError') {
    return {
      kind: 'connect-failed',
      title: 'Could not open the USB port',
      message:
        'Another program or browser tab may be using the hub (Pybricks Code, for example): close it and try again. On Linux, your user must be allowed to use serial ports (the dialout group).',
      detail,
    };
  }
  if (error instanceof UsbTimeoutError || error instanceof UsbCommandError) {
    return {
      kind: 'read-failed',
      title: 'The hub did not answer over USB',
      message:
        'Connecting with a cable needs Pybricks v4.1.1 or newer on the hub; older Pybricks, and the LEGO® app’s firmware, only charge over USB. Update Pybricks, or connect with Bluetooth.',
      detail,
    };
  }
  return {
    kind: 'connect-failed',
    title: 'Could not connect to the hub over USB',
    message: 'Unplug the cable, plug it in again, and try again.',
    detail,
  };
}
