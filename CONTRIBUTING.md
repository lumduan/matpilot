# Contributing to MatPilot

Thank you for helping. MatPilot is pre-alpha, so expect things to move. Please read
[docs/architecture.md](docs/architecture.md) and the [ADRs](docs/adr/) before larger changes.

## Ground rules

1. **English only.** All code, comments, identifiers, documentation, commit messages, issues, and
   pull requests are written in English.
2. **Cite Pybricks or test it on hardware.** Any claim about Pybricks behaviour (BLE protocol, UUIDs,
   commands, firmware strings, MicroPython APIs, timing) must either:
   - cite the upstream source with a permalink that contains a commit hash, for example
     `https://github.com/pybricks/pybricks-micropython/blob/<commit>/lib/pbio/include/pbio/protocol.h#L24`;
     or
   - be verified on hardware, stating the hub, firmware version, browser, OS, and date.

   Do not rely on memory, blog posts, or third-party tutorials. If the upstream source is missing or
   ambiguous, say so in the pull request instead of guessing.

3. **Browser-only and static.** No backend, API routes, Route Handlers, Server Actions, middleware,
   or anything else that needs a server at runtime ([ADR 0001](docs/adr/0001-browser-only-web-bluetooth.md),
   [ADR 0002](docs/adr/0002-static-export-no-server-features.md)).
4. **No third-party requests at runtime.** No CDN scripts, remote fonts, analytics, or telemetry.
   Self-host every asset. The exceptions are GitHub's API, called when a user saves or loads a
   block program on GitHub ([ADR 0011](docs/adr/0011-save-load-github.md)), and the AI helper's
   providers (Anthropic, OpenAI, DeepSeek), called only after an adult turns the helper on with
   their own key ([ADR 0015](docs/adr/0015-ai-helper.md)); the build fails if the page's Content
   Security Policy allows anything else.
5. **Keep BLE and protocol code framework-agnostic.** Web Bluetooth and Pybricks protocol logic
   lives in `src/lib/` as plain TypeScript. React code calls it through `src/hooks/`. ESLint
   enforces both directions.
6. **Millimetres** for every spatial unit ([ADR 0004](docs/adr/0004-millimetre-units.md)).

## Setup

The toolchain (Node.js 26.13.0, pnpm 12.16.1) runs in Docker
([ADR 0005](docs/adr/0005-containerised-toolchain.md)). You need Docker with Compose, nothing else.

```sh
docker compose up dev                       # dev server with hot reload, http://localhost:3300
docker compose run --rm dev pnpm <script>   # run any script below inside the container
docker compose up --build preview           # production static build, http://localhost:3301
```

- The source tree is bind-mounted, so edits on the host reload the dev server. `node_modules`
  lives in a Docker volume, with pnpm's package store inside it, and the container syncs it with
  the lockfile before every command.
- Containers run as the `node` user (uid 1000), so files they write (`.next/`, `out/`) belong to
  uid 1000 on the host. One exception: on Linux, Docker creates the `node_modules/` mount point in
  your checkout as an **empty directory owned by root**. It stays empty because the real
  `node_modules` lives in the volume, and git ignores it. Before a native (non-Docker) install,
  remove it with `rmdir node_modules`; no `sudo` is needed.
- Ports bind to `127.0.0.1`. Change them with `MATPILOT_DEV_PORT` and `MATPILOT_PREVIEW_PORT`, and
  the bind address with `MATPILOT_BIND`, in a `.env` file next to `compose.yaml`.
- The compose network uses a pinned subnet, `10.210.120.0/24`, instead of Docker's automatic
  allocation. Docker cannot see LAN segments behind your router and may hand one of them (for
  example a `192.168.x` home network) to the bridge, which cuts devices on that segment off from
  the host. If `10.210.120.0/24` is in use on your network, set `MATPILOT_SUBNET` in `.env` to
  another single `/24` that overlaps no host route (`ip route`) or Docker network. CI rejects a
  compose network without exactly one pinned `/24` outside `192.168.0.0/16` and `172.16.0.0/12`.
- When you change the Node.js or pnpm version, change `Dockerfile`, `.nvmrc`, and
  `packageManager` together. CI fails if they disagree.

Without Docker: `nvm install` (reads `.nvmrc`), `npm install --global pnpm@12.16.1`,
`pnpm install`, `pnpm dev`.

Web Bluetooth needs a secure context. `http://localhost` counts as secure. To test from a phone or
another computer, put the app behind an HTTPS address.

Next.js collects anonymous CLI telemetry by default. This affects only your machine, not the app.
To opt out: `pnpm exec next telemetry disable`, or set `NEXT_TELEMETRY_DISABLED=1` (CI does this).

## Scripts

| Script           | What it does                                                                |
| ---------------- | --------------------------------------------------------------------------- |
| `pnpm dev`       | Development server with hot reload                                          |
| `pnpm build`     | Static export to `out/`, then `scripts/verify-export.mjs` checks the output |
| `pnpm lint`      | ESLint (zero warnings allowed) and a Prettier format check                  |
| `pnpm typecheck` | Generates Next.js route types, then runs `tsc --noEmit` (strict mode)       |
| `pnpm test`      | Vitest unit tests                                                           |
| `pnpm format`    | Formats every file with Prettier                                            |

Before opening a pull request, run the same steps as CI:

```sh
pnpm install --frozen-lockfile && pnpm lint && pnpm typecheck && pnpm test && pnpm build
```

## Tests

Put pure logic (parsing, decoding, classification, state machines) behind functions in `src/lib/`
and unit-test it with Vitest next to the source (`*.test.ts`). Tests run in Node.js: mock browser
globals such as `navigator` explicitly (`vi.stubGlobal`, or pass a fake object), and use fake GATT
objects for BLE code. Never call a real device from a unit test.

Hardware results go in [docs/compatibility.md](docs/compatibility.md), in the "Verified on hardware"
column, with date, browser, OS, and firmware version.

### Golden files for the compiler

`src/lib/pybricks/__golden__/mpy-cross-v6/` holds programs compiled by pybricksdev's compiler, and
`compiler.golden.test.ts` requires the browser compiler to produce the same bytes. After adding a
program there, or changing compiler versions, regenerate them with:

```sh
scripts/golden/generate-mpy-cross-v6.sh   # throwaway Python container; nothing is installed on the host
```

## Commit messages

Use [Conventional Commits](https://www.conventionalcommits.org/en/v1.0.0/):

```
<type>(<optional scope>): <summary in the imperative, lower case, no final period>

<optional body: what and why>
```

Types: `feat`, `fix`, `docs`, `test`, `refactor`, `perf`, `build`, `ci`, `chore`, `style`, `revert`.
Mark breaking changes with `!` after the type or a `BREAKING CHANGE:` footer.

Examples:

```
feat(ble): read the hub capabilities characteristic
fix(compat): treat a missing getAvailability() as a failed check
docs(adr): record the decision to keep units in millimetres
```

## Dependencies

Versions in `package.json` are pinned exactly. Upgrade deliberately, one tool at a time, and keep the
lockfile committed. Note two intentional holds:

- **TypeScript 6.x, not 7.x.** TypeScript 7 does not ship the JavaScript compiler API that
  `typescript-eslint` needs (its peer range is `<6.1.0`).
- **ESLint 9.x, not 10.x.** Several plugins that `eslint-config-next` depends on do not declare
  ESLint 10 support yet.

pnpm 12 rejects packages published less than 24 hours ago (`minimumReleaseAge`). Prefer waiting a
day before adopting a new release. If a fresh release is genuinely needed, list each affected
package **with its exact version** under `minimumReleaseAgeExclude` in `pnpm-workspace.yaml`,
together with the date after which the entry can be removed. A warm local pnpm store can hide this
check, so test with an empty store (`pnpm install --frozen-lockfile --store-dir <empty dir>`)
before pushing.

## License

By contributing, you agree that your contributions are licensed under the [MIT License](LICENSE).
