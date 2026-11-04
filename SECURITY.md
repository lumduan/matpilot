# Security policy

## Reporting a vulnerability

**Please do not report security vulnerabilities in public issues, discussions, or pull requests.**

Report them privately through GitHub Security Advisories:

1. Open this repository on GitHub and go to the **Security** tab.
2. Click **Report a vulnerability**.
3. Describe the problem, the affected version or commit, steps to reproduce, and the impact you
   expect.

The report is visible only to you and the maintainers. We will work with you on a fix and a
coordinated disclosure, and credit you in the advisory unless you prefer otherwise.

MatPilot is a volunteer project, so reports are handled on a best-effort basis.

## Supported versions

MatPilot is pre-alpha. Only the latest commit on the default branch receives security fixes.

## Scope

In scope, for example:

- Script injection or other ways to run untrusted code in the MatPilot page.
- Anything that makes the app send data to a third-party origin, or load code from one.
- Anything that makes the app write to a hub without the user's explicit action.
- Supply-chain problems in this repository's build or CI configuration.

Out of scope (please report these upstream):

- Vulnerabilities in browsers or in their Web Bluetooth implementations.
- Vulnerabilities in Pybricks firmware: report them to the
  [Pybricks project](https://github.com/pybricks).
- Vulnerabilities in LEGO or Microsoft hardware or firmware.
