/**
 * Maps Web Bluetooth failures to user-facing states.
 *
 * Errors are matched by their `name` (a DOMException name per the Web Bluetooth
 * specification, https://webbluetoothcg.github.io/web-bluetooth/), not by `instanceof`, so
 * the mapping works for any thrown object.
 */

export type ProbeErrorKind =
  | 'api-unavailable'
  | 'bluetooth-unavailable'
  | 'blocked'
  | 'connect-failed'
  | 'read-failed'
  | 'unexpected';

export interface ProbeError {
  readonly kind: ProbeErrorKind;
  readonly title: string;
  readonly message: string;
  /** Technical detail ("NetworkError: ...") for bug reports, or `null`. */
  readonly detail: string | null;
}

export type RequestDeviceOutcome =
  { readonly kind: 'cancelled' } | { readonly kind: 'error'; readonly error: ProbeError };

/** Which GATT step was running when an error happened. */
export type GattStage = 'connect' | 'read-firmware-revision' | 'read-software-revision';

export function errorName(error: unknown): string | null {
  if (typeof error === 'object' && error !== null && 'name' in error) {
    const { name } = error as { name: unknown };
    return typeof name === 'string' ? name : null;
  }
  return null;
}

export function errorMessage(error: unknown): string {
  if (typeof error === 'object' && error !== null && 'message' in error) {
    const { message } = error as { message: unknown };
    if (typeof message === 'string') return message;
  }
  return String(error);
}

export function errorDetail(error: unknown): string {
  const name = errorName(error);
  const message = errorMessage(error);
  return name && message ? `${name}: ${message}` : name || message;
}

/** Shown when `navigator.bluetooth` is missing at the moment the user clicks Connect. */
export function apiUnavailableError(): ProbeError {
  return {
    kind: 'api-unavailable',
    title: 'Web Bluetooth is not available',
    message: 'This browser does not provide Web Bluetooth. See the compatibility checks above.',
    detail: null,
  };
}

/**
 * Classifies a rejection from `navigator.bluetooth.requestDevice()`.
 *
 * The specification rejects with `NotFoundError` when the user closes the device picker
 * without choosing a device, so that is treated as a normal "no hub selected" outcome, not an
 * error. Chrome also uses `NotFoundError` when the Bluetooth adapter is missing or the API is
 * disabled; those are told apart by their message on a best-effort basis.
 */
export function classifyRequestDeviceError(error: unknown): RequestDeviceOutcome {
  const name = errorName(error);
  const detail = errorDetail(error);

  if (name === 'NotFoundError') {
    if (/adapter|disabled/i.test(errorMessage(error))) {
      return {
        kind: 'error',
        error: {
          kind: 'bluetooth-unavailable',
          title: 'Bluetooth is not available',
          message:
            'The browser could not use a Bluetooth adapter. Check that Bluetooth is turned on and that the browser is allowed to use it.',
          detail,
        },
      };
    }
    return { kind: 'cancelled' };
  }

  if (name === 'SecurityError' || name === 'NotAllowedError') {
    return {
      kind: 'error',
      error: {
        kind: 'blocked',
        title: 'The browser blocked the Bluetooth request',
        message:
          'The request must start from a click on a page served over HTTPS or localhost, and Bluetooth must not be blocked for this site in the browser settings.',
        detail,
      },
    };
  }

  return {
    kind: 'error',
    error: {
      kind: 'unexpected',
      title: 'Could not open the device picker',
      message: 'The browser rejected the Bluetooth device request.',
      detail,
    },
  };
}

/** Describes a failure while connecting to the hub or reading its Device Information. */
export function describeGattError(error: unknown, stage: GattStage): ProbeError {
  const detail = errorDetail(error);
  if (stage === 'connect') {
    return {
      kind: 'connect-failed',
      title: 'Could not connect to the hub',
      message:
        'The hub was selected but the connection failed. Make sure the hub is on, close to this device, and not connected to another app, then try again.',
      detail,
    };
  }
  const what = stage === 'read-firmware-revision' ? 'firmware revision' : 'protocol version';
  return {
    kind: 'read-failed',
    title: 'Could not read hub information',
    message:
      errorName(error) === 'NotFoundError'
        ? `The hub does not expose its ${what} in the Device Information service. It may not be running Pybricks firmware.`
        : `Connected, but reading the ${what} failed. Try connecting again.`,
    detail,
  };
}
