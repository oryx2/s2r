#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BASE_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"

if [[ -n "${LLAMA_BINARY:-}" && -x "${LLAMA_BINARY}" ]]; then
  echo "${LLAMA_BINARY}"
  exit 0
fi

# Prefer bundled runtime binary if present.
if [[ -x "${BASE_DIR}/runtime/llama-server" ]]; then
  echo "${BASE_DIR}/runtime/llama-server"
  exit 0
fi

if command -v llama-server >/dev/null 2>&1; then
  command -v llama-server
  exit 0
fi

# Fallback: try automatic install for non-technical users.
if command -v brew >/dev/null 2>&1; then
  echo "[INFO] llama-server not found, installing llama.cpp via Homebrew..."
  if brew list llama.cpp >/dev/null 2>&1; then
    :
  else
    brew install llama.cpp
  fi
  if command -v llama-server >/dev/null 2>&1; then
    command -v llama-server
    exit 0
  fi
fi

echo "[ERROR] llama-server not found." >&2
echo "[ERROR] Please install llama.cpp, or put llama-server at ${BASE_DIR}/runtime/llama-server" >&2
exit 2
