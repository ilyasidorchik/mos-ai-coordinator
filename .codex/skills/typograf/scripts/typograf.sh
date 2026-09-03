#!/usr/bin/env bash
set -euo pipefail

usage() {
  cat >&2 <<'EOF'
Usage:
  typograf.sh <path-to-file>
EOF
  exit 1
}

if [[ $# -ne 1 ]]; then
  usage
fi

TARGET="$1"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# Resolve to absolute path
if [[ "$TARGET" != /* ]]; then
  TARGET="$(pwd)/$TARGET"
fi

if [[ ! -f "$TARGET" ]]; then
  echo "File not found: $TARGET" >&2
  exit 1
fi

# Stay inside the git repo that contains this skill (or cwd repo)
REPO_ROOT="$(git -C "$(dirname "$TARGET")" rev-parse --show-toplevel 2>/dev/null || true)"
if [[ -z "$REPO_ROOT" ]]; then
  REPO_ROOT="$(git rev-parse --show-toplevel 2>/dev/null || true)"
fi
if [[ -z "$REPO_ROOT" ]]; then
  echo "Not inside a git repository; refusing to typograf." >&2
  exit 1
fi

# Ensure target is under repo root
case "$TARGET" in
  "$REPO_ROOT"/*) ;;
  *)
    echo "Refusing to typograf outside the repository: $TARGET" >&2
    exit 1
    ;;
esac

if [[ ! -d "${SCRIPT_DIR}/node_modules/typograf" ]]; then
  echo "Installing typograf dependency..." >&2
  npm install --prefix "$SCRIPT_DIR" --silent
fi

node "${SCRIPT_DIR}/typograf.mjs" "$TARGET"
