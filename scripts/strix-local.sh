#!/bin/sh
# Trusted local controller; repository authorization and provider keys stay in Preflyt.
set -eu
cd "$(dirname "$0")/.."
STRIX_PYTHON_BIN="${STRIX_PYTHON_BIN:-python3.12}"
STRIX_ENV_DIR=apps/api/.preflyt/strix-env
if [ ! -x "$STRIX_ENV_DIR/bin/python" ]; then
  "$STRIX_PYTHON_BIN" -m venv "$STRIX_ENV_DIR"
fi
if ! "$STRIX_ENV_DIR/bin/python" -c "import importlib.metadata as m; assert all(m.version(k)==v for k,v in {'strix-agent':'1.7.0','openai-agents':'0.19.4','litellm':'1.106.0'}.items())" >/dev/null 2>&1; then
  "$STRIX_ENV_DIR/bin/python" -m pip install -r tools/strix-runner/requirements.txt
fi
STRIX_SANDBOX_BASE="${STRIX_SANDBOX_BASE:-ghcr.io/usestrix/strix-sandbox@sha256:478e0b37ec83b2ba8c6e159593cb46d5dc9b624a45d6a9bb606851b83058d284}"
export STRIX_SANDBOX_BASE
if ! docker image inspect "$STRIX_SANDBOX_BASE" >/dev/null 2>&1; then
  docker pull "$STRIX_SANDBOX_BASE"
fi
exec "$STRIX_ENV_DIR/bin/python" tools/strix-runner/runner.py "$@"
