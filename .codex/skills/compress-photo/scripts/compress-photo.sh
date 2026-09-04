#!/usr/bin/env bash
set -euo pipefail

MAX_BYTES=$((5 * 1024 * 1024))
NODE_VERSION="16.20.2"
PNG_TO_JPG=0

usage() {
  cat >&2 <<'EOF'
Usage:
  compress-photo.sh <photo-path>
  compress-photo.sh --png-to-jpg <photo-path>
EOF
  exit 1
}

human_size() {
  local bytes="$1"
  if (( bytes >= 1048576 )); then
    awk -v b="$bytes" 'BEGIN { printf "%.2f MB", b / 1048576 }'
  else
    awk -v b="$bytes" 'BEGIN { printf "%.0f KB", b / 1024 }'
  fi
}

get_size() {
  stat -f%z "$1" 2>/dev/null || stat -c%s "$1"
}

ensure_node16() {
  local arch tar_name node_dir folder
  arch="$(uname -m)"
  case "$arch" in
    arm64)
      folder="arm64"
      tar_name="node-v${NODE_VERSION}-darwin-arm64.tar.gz"
      ;;
    x86_64)
      folder="x64"
      tar_name="node-v${NODE_VERSION}-darwin-x64.tar.gz"
      ;;
    *)
      echo "Unsupported architecture: $arch" >&2
      exit 1
      ;;
  esac

  NODE_DIR="/tmp/node-v${NODE_VERSION}-darwin-${folder}"
  NODE_BIN="${NODE_DIR}/bin/node"
  NPX_CLI="${NODE_DIR}/lib/node_modules/npm/bin/npx-cli.js"

  if [[ ! -x "${NODE_BIN}" || ! -f "${NPX_CLI}" ]]; then
    rm -rf "${NODE_DIR}"
    echo "Downloading Node ${NODE_VERSION} for Squoosh CLI..."
    curl -fsSL "https://nodejs.org/dist/v${NODE_VERSION}/${tar_name}" | tar xz -C /tmp
  fi

  if [[ ! -x "${NODE_BIN}" || ! -f "${NPX_CLI}" ]]; then
    echo "Node ${NODE_VERSION} download is incomplete in ${NODE_DIR}" >&2
    exit 1
  fi
}

squoosh_cli() {
  # npx may spawn the package via `env node`; keep Node 16 first on PATH
  PATH="${NODE_DIR}/bin:${PATH}" "${NODE_BIN}" "${NPX_CLI}" --yes @squoosh/cli "$@"
}

compress_once() {
  local source="$1"
  local out_dir="$2"
  local quality="$3"
  local mode="$4"

  case "$mode" in
    mozjpeg)
      squoosh_cli --mozjpeg "{\"quality\":${quality}}" -d "$out_dir" "$source"
      ;;
    oxipng)
      squoosh_cli --oxipng "{\"quality\":${quality}}" -d "$out_dir" "$source"
      ;;
    *)
      echo "Unsupported compression mode: ${mode}" >&2
      exit 1
      ;;
  esac
}

pick_output_file() {
  local out_dir="$1"
  local outputs
  shopt -s nullglob
  outputs=("$out_dir"/*)
  shopt -u nullglob
  if ((${#outputs[@]} != 1)); then
    echo "Expected one output file in $out_dir, got ${#outputs[@]}" >&2
    exit 1
  fi
  printf '%s\n' "${outputs[0]}"
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --png-to-jpg)
      PNG_TO_JPG=1
      shift
      ;;
    -h|--help)
      usage
      ;;
    --)
      shift
      break
      ;;
    -*)
      echo "Unknown option: $1" >&2
      usage
      ;;
    *)
      break
      ;;
  esac
done

[[ $# -eq 1 ]] || usage

PHOTO="$1"
if [[ ! -f "$PHOTO" ]]; then
  echo "File not found: $PHOTO" >&2
  exit 1
fi

PHOTO="$(cd "$(dirname "$PHOTO")" && pwd)/$(basename "$PHOTO")"
ext="${PHOTO##*.}"
ext_lower="$(printf '%s' "$ext" | tr '[:upper:]' '[:lower:]')"

case "$ext_lower" in
  jpg|jpeg)
    if (( PNG_TO_JPG )); then
      echo "--png-to-jpg can only be used with PNG inputs" >&2
      exit 1
    fi
    MODE="mozjpeg"
    TARGET="$PHOTO"
    ;;
  png)
    if (( PNG_TO_JPG )); then
      MODE="mozjpeg"
      TARGET="${PHOTO%.*}.jpg"
    else
      MODE="oxipng"
      TARGET="$PHOTO"
    fi
    ;;
  *)
    echo "Unsupported format: .$ext (expected .jpeg, .jpg, or .png)" >&2
    exit 1
    ;;
esac

before_size="$(get_size "$PHOTO")"
ensure_node16

QUALITIES=(75 70 65 60 55 50 45 40 35)
BEST_FILE=""
BEST_SIZE=0
BEST_QUALITY=0
SUCCESS=0

cleanup_best_file() {
  if [[ -n "${BEST_FILE}" && -f "${BEST_FILE}" ]]; then
    rm -f "${BEST_FILE}"
  fi
}

trap cleanup_best_file EXIT

for quality in "${QUALITIES[@]}"; do
  TMP="$(mktemp -d)"
  compress_once "$PHOTO" "$TMP" "$quality" "$MODE"
  output_file="$(pick_output_file "$TMP")"
  output_size="$(get_size "$output_file")"

  if [[ -z "$BEST_FILE" || "$output_size" -lt "$BEST_SIZE" ]]; then
    if [[ -n "$BEST_FILE" && -f "$BEST_FILE" ]]; then
      rm -f "$BEST_FILE"
    fi
    BEST_FILE="$(mktemp)"
    mv "$output_file" "$BEST_FILE"
    BEST_SIZE="$output_size"
    BEST_QUALITY="$quality"
  fi

  rm -rf "$TMP"

  if (( output_size < MAX_BYTES )); then
    SUCCESS=1
    break
  fi
done

mv "$BEST_FILE" "$TARGET"
BEST_FILE=""

# After PNG→JPG, drop the original PNG so the folder has one attachment file.
if (( PNG_TO_JPG )) && [[ -f "$PHOTO" && "$PHOTO" != "$TARGET" ]]; then
  rm -f "$PHOTO"
fi

after_size="$(get_size "$TARGET")"
ratio="$(awk -v a="$after_size" -v b="$before_size" 'BEGIN { printf "%.1f", (a / b) * 100 }')"

echo "${TARGET}"
echo "  before: $(human_size "$before_size")"
echo "  after:  $(human_size "$after_size") (${ratio}%)"
echo "  quality: ${BEST_QUALITY}"
echo "  codec: ${MODE}"

if (( SUCCESS == 0 )); then
  echo "Warning: file is still >= 5 MB after retrying stronger compression and may be rejected by mos.ru" >&2
  exit 2
fi
