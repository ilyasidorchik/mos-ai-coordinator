#!/usr/bin/env bash
# After Apply/write of <case>/response/response.md: commit that response/ dir and push.
set -euo pipefail

input="$(cat)"

file_path="$(
  python3 -c '
import json, sys
try:
    data = json.load(sys.stdin)
except Exception:
    sys.exit(0)
path = data.get("file_path") or data.get("filePath") or ""
print(path)
' <<<"$input"
)"

[[ -z "$file_path" ]] && exit 0

case "$file_path" in
  */response/response.md) ;;
  *) exit 0 ;;
esac

response_dir="$(dirname "$file_path")"
[[ -d "$response_dir" ]] || exit 0

repo_root="$(git -C "$response_dir" rev-parse --show-toplevel 2>/dev/null || true)"
[[ -n "$repo_root" ]] || exit 0

cd "$repo_root"

# Stage this response/ folder only; drop preview pages if staged.
git add -- "$response_dir"
git reset -q -- "$response_dir/_pdf_pages" 2>/dev/null || true
rm -rf "$response_dir/_pdf_pages" 2>/dev/null || true

if git diff --cached --quiet; then
  exit 0
fi

case_name="$(basename "$(dirname "$response_dir")")"
msg="Add agency response for ${case_name}."

if ! git commit -m "$msg"; then
  echo "inbox-commit-push: commit failed for $response_dir" >&2
  exit 0
fi

if ! git push; then
  echo "inbox-commit-push: push failed after commit for $response_dir" >&2
  exit 0
fi

exit 0
