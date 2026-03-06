#!/usr/bin/env bash
set -euo pipefail

BASE_DIR="$(cd "$(dirname "$0")/.." && pwd)"
MODEL_PATH="${MODEL_PATH:-$BASE_DIR/models/Qwen3.5-0.8B}"
SERVED_MODEL_NAME="${SERVED_MODEL_NAME:-qwen3.5-0.8b}"
HOST="${HOST:-127.0.0.1}"
PORT="${PORT:-18279}"
LLAMA_BINARY="${LLAMA_BINARY:-}"
MMPROJ_PATH="${MMPROJ_PATH:-}"

if [[ ! -d "$MODEL_PATH" ]]; then
  echo "[ERROR] MODEL_PATH not found: $MODEL_PATH" >&2
  echo "Run: $BASE_DIR/bin/s2r model download --repo-id Qwen/Qwen3.5-0.8B" >&2
  exit 2
fi

if [[ ! -x "$BASE_DIR/bin/s2r" ]]; then
  echo "[ERROR] missing swift binary: $BASE_DIR/bin/s2r" >&2
  echo "Please reinstall the app package." >&2
  exit 2
fi

if [[ -n "$LLAMA_BINARY" && ! -x "$LLAMA_BINARY" ]]; then
  echo "[ERROR] LLAMA_BINARY is not executable: $LLAMA_BINARY" >&2
  exit 2
fi

if [[ -z "$LLAMA_BINARY" ]]; then
  LLAMA_BINARY="$(bash "$BASE_DIR/scripts/ensure_llama_server.sh")"
fi

ARGS=(model serve --model-path "$MODEL_PATH" --model-name "$SERVED_MODEL_NAME" --host "$HOST" --port "$PORT" --llama-binary "$LLAMA_BINARY")
if [[ -n "$MMPROJ_PATH" ]]; then
  ARGS+=(--mmproj-path "$MMPROJ_PATH")
fi

exec "$BASE_DIR/bin/s2r" "${ARGS[@]}"
