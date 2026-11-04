#!/bin/sh
# Entrypoint for the `dev` service in compose.yaml.
#
# node_modules lives in a Docker volume, not in the bind-mounted source tree, so it is synced with
# the lockfile before every command. When nothing changed, this takes about a second.
set -eu

CI=true pnpm install --frozen-lockfile --prefer-offline

exec "$@"
