export {
  evaluateCompatibility,
  type AvailabilityResult,
  type CheckId,
  type CheckResult,
  type CheckStatus,
  type CompatibilityEnvironment,
  type CompatibilityReport,
} from './checks';
export {
  AVAILABILITY_TIMEOUT_MS,
  collectEnvironment,
  runCompatibilityCheck,
  watchBluetoothAvailability,
  type GlobalsLike,
  type NavigatorLike,
} from './environment';
export {
  assessPlatform,
  describePlatform,
  detectPlatform,
  type BrowserName,
  type OsName,
  type PlatformAssessment,
  type PlatformInfo,
} from './platform';
export {
  SUPPORTED_BROWSERS,
  SUPPORTED_PLATFORMS,
  SUPPORT_STATEMENT,
  UNSUPPORTED_BROWSERS_SENTENCE,
} from './support';
