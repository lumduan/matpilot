# ADR 0005: The development toolchain runs in Docker

- Status: Accepted
- Date: 2026-11-04

## Context

MatPilot pins exact tool versions: Node.js 26.13.0 (`.nvmrc`, `engines`) and pnpm 12.16.1
(`packageManager`). Installing those on a developer machine or a shared server has side effects. On
the maintainer's home server, a version manager whose default follows "latest LTS" would switch every
project on the machine to the new Node.js version. A slightly different local version makes the exact
`engines` pin fail.

The maintainer decided on 2026-11-04 that the project uses a Docker container instead of host-
installed Node.js.

## Decision

1. **The toolchain runs in Docker.** `Dockerfile` defines the image: the official
   `node:26.13.0-trixie-slim` image, pinned by digest, plus pnpm 12.16.1. Node.js and pnpm are not
   installed on the host.
2. **`compose.yaml` is the developer entry point.** The `dev` service runs the dev server, and
   `docker compose run --rm dev pnpm <script>` runs any project script against the bind-mounted
   source. `node_modules` and the pnpm store live in Docker volumes.
3. **`docker build --target export`** runs the whole CI pipeline (lint, typecheck, test, build) in
   the container and outputs `out/`. The `preview` target serves that output with unprivileged
   nginx, the way a static host would.
4. **Versions stay in agreement.** The Node.js version in `Dockerfile` equals `.nvmrc`, and the pnpm
   version equals `packageManager`. CI checks both and also builds the image.
5. Native installs remain possible for contributors who prefer them, using the same pinned versions.
   GitHub Actions keeps a native job, because it is faster and caches better.

## Consequences

- Nothing needs to be installed on the host except Docker, and there is no interaction with other
  projects' Node.js versions.
- The exact `engines.node` pin (`26.13.0`) is safe: the container always provides that version.
- Changing the Node.js or pnpm version touches three places (`Dockerfile`, `.nvmrc`,
  `package.json`); CI catches a partial change.
- Containers run as uid 1000. On a host whose user has another uid, files written to the bind mount
  belong to uid 1000.
- Docker is a development and verification tool only. The app itself is still static files with no
  server ([ADR 0002](0002-static-export-no-server-features.md)); production hosting configuration is
  out of scope for this repository.
