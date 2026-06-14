#!/usr/bin/env bash
set -euo pipefail

MAX_BYTES=$((5 * 1024 * 1024))
QUALITY=75
NODE_VERSION="16.20.2"

usage() {
  echo "Usage: compress-photo.sh <photo-path>" >&2
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

  node_dir="/tmp/node-v${NODE_VERSION}-darwin-${folder}"
  if [[ ! -x "${node_dir}/bin/node" ]]; then
    echo "Downloading Node ${NODE_VERSION} for Squoosh CLI..."
    curl -fsSL "https://nodejs.org/dist/v${NODE_VERSION}/${tar_name}" | tar xz -C /tmp
  fi

  export PATH="${node_dir}/bin:${PATH}"
}

[[ $# -eq 1 ]] || usage

PHOTO="$1"
if [[ ! -f "$PHOTO" ]]; then
  echo "File not found: $PHOTO" >&2
  exit 1
fi

PHOTO="$(cd "$(dirname "$PHOTO")" && pwd)/$(basename "$PHOTO")"
ext="${PHOTO##*.}"
ext_lower="$(printf '%s' "$ext" | tr '[:upper:]' '[:lower:]')"

before_size="$(stat -f%z "$PHOTO" 2>/dev/null || stat -c%s "$PHOTO")"
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT

ensure_node16

case "$ext_lower" in
  jpg|jpeg)
    npx --yes @squoosh/cli --mozjpeg "{\"quality\":${QUALITY}}" -d "$TMP" "$PHOTO"
    ;;
  png)
    npx --yes @squoosh/cli --oxipng "{\"quality\":${QUALITY}}" -d "$TMP" "$PHOTO"
    ;;
  *)
    echo "Unsupported format: .$ext (expected .jpeg, .jpg, or .png)" >&2
    exit 1
    ;;
esac

shopt -s nullglob
outputs=("$TMP"/*)
if ((${#outputs[@]} != 1)); then
  echo "Expected one output file in $TMP, got ${#outputs[@]}" >&2
  exit 1
fi

mv "$outputs" "$PHOTO"

after_size="$(stat -f%z "$PHOTO" 2>/dev/null || stat -c%s "$PHOTO")"
ratio="$(awk -v a="$after_size" -v b="$before_size" 'BEGIN { printf "%.1f", (a / b) * 100 }')"

echo "${PHOTO}"
echo "  before: $(human_size "$before_size")"
echo "  after:  $(human_size "$after_size") (${ratio}%)"

if (( after_size >= MAX_BYTES )); then
  echo "Warning: file is still >= 5 MB and may be rejected by mos.ru" >&2
  exit 2
fi
