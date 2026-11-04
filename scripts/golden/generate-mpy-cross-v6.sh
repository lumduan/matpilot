#!/bin/sh
# Regenerates the golden .mpy files with the same compiler pybricksdev uses (PyPI mpy-cross-v6).
# Runs in a throwaway container on Docker's default bridge; installs nothing on the host.
#
#   scripts/golden/generate-mpy-cross-v6.sh
#
# MPY_CROSS_V6_VERSION matches pybricksdev v2.3.2's lock file (poetry.lock: mpy-cross-v6 1.1.2).
# pybricksdev itself packs the multi-file upload golden (hello.multi-mpy.bin).
set -eu
MPY_CROSS_V6_VERSION=1.1.2
PYBRICKSDEV_VERSION=2.3.2
PYTHON_IMAGE=python:3.13-slim@sha256:ae14d4ce8771606477a81446e7ef429edd6762305fc50c84507c1041fa8285d1
ROOT=$(cd "$(dirname "$0")/../.." && pwd)
docker run --rm \
  --user "$(id -u):$(id -g)" \
  -e HOME=/tmp -e PIP_DISABLE_PIP_VERSION_CHECK=1 -e PYTHONPATH=/tmp/pkgs \
  -v "$ROOT/scripts/golden:/scripts:ro" \
  -v "$ROOT/src/lib/pybricks/__golden__/mpy-cross-v6:/golden" \
  "$PYTHON_IMAGE" \
  sh -c "pip install --quiet --target /tmp/pkgs mpy-cross-v6==$MPY_CROSS_V6_VERSION pybricksdev==$PYBRICKSDEV_VERSION && python /scripts/make_goldens.py /golden"
