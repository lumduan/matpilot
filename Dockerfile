# syntax=docker/dockerfile:1
#
# MatPilot toolchain and build image (docs/adr/0005-containerised-toolchain.md).
#
# The Node.js version below must equal .nvmrc, and PNPM_VERSION must equal the packageManager
# field in package.json. CI fails if they drift.
#
# Targets:
#   toolchain  Node.js + pnpm, nothing else. Used by the `dev` service in compose.yaml.
#   build      Installs dependencies, then runs lint, typecheck, test, and the static build.
#   export     Only the static site (out/). `docker build --target export --output type=local,dest=out .`
#   preview    The static site served by unprivileged nginx on port 8080, like a static host.

FROM node:26.13.0-trixie-slim@sha256:e4db4c914bf8ad241bd24804fc25d272d89bad97e68cdc8a1414862790a02c39 AS toolchain

ARG PNPM_VERSION=12.16.1

# Node.js 25+ no longer bundles corepack, so pnpm is installed with npm.
RUN npm install --global "pnpm@${PNPM_VERSION}" \
 && pnpm --version \
 && mkdir -p /app/node_modules /home/node/.local/share/pnpm/store \
 && chown -R node:node /app /home/node/.local

ENV NEXT_TELEMETRY_DISABLED=1
WORKDIR /app
USER node

# ---------------------------------------------------------------------------------------------

FROM toolchain AS build

COPY --chown=node:node package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN --mount=type=cache,id=matpilot-pnpm-store,target=/home/node/.local/share/pnpm/store,uid=1000,gid=1000 \
    CI=true pnpm install --frozen-lockfile

COPY --chown=node:node . .
RUN pnpm lint && pnpm typecheck && pnpm test && pnpm build

# ---------------------------------------------------------------------------------------------

FROM scratch AS export
COPY --from=build /app/out /

# ---------------------------------------------------------------------------------------------

FROM nginxinc/nginx-unprivileged:1.30.6-alpine@sha256:f5116ed4606f3eb015dd4a8e28cb9b351476dc0ad4bc6e9f93b19cec130cdf03 AS preview
COPY docker/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/out /usr/share/nginx/html
EXPOSE 8080
