# After Apply/write of <case>/response/response.md or root statistics.md:
# commit response/ dir(s) and statistics.md together, then push.
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

trigger=""
response_dir=""

case "$file_path" in
  */response/response.md)
    trigger="response"
    response_dir="$(dirname "$file_path")"
    ;;
  *statistics.md)
    trigger="statistics"
    ;;
  *)
    exit 0
    ;;
esac

if [[ "$trigger" == "response" ]]; then
  [[ -d "$response_dir" ]] || exit 0
  repo_root="$(git -C "$response_dir" rev-parse --show-toplevel 2>/dev/null || true)"
else
  repo_root="$(git -C "$(dirname "$file_path")" rev-parse --show-toplevel 2>/dev/null || true)"
fi

[[ -n "$repo_root" ]] || exit 0

cd "$repo_root"

stage_response_dirs() {
  local dir
  while IFS= read -r dir; do
    [[ -n "$dir" && -d "$dir" ]] || continue
    git add -- "$dir"
    git reset -q -- "$dir/_pdf_pages" 2>/dev/null || true
    rm -rf "$dir/_pdf_pages" 2>/dev/null || true
  done < <(
    {
      git diff --name-only -- ':(glob)*/response/*' ':(glob)*/response/*/**' 2>/dev/null || true
      git ls-files --others --exclude-standard -- ':(glob)*/response/*' ':(glob)*/response/*/**' 2>/dev/null || true
    } | sed -n 's|^\(.*/response\)/.*|\1|p' | sort -u
  )
}

if [[ "$trigger" == "response" ]]; then
  git add -- "$response_dir"
  git reset -q -- "$response_dir/_pdf_pages" 2>/dev/null || true
  rm -rf "$response_dir/_pdf_pages" 2>/dev/null || true
else
  stage_response_dirs
fi

[[ -f statistics.md ]] && git add -- statistics.md

if git diff --cached --quiet; then
  exit 0
fi

case_dirs="$(
  git diff --cached --name-only | sed -n 's|^\(.*/response\)/.*|\1|p' | sort -u
)"
case_count="$(printf '%s\n' "$case_dirs" | sed '/^$/d' | wc -l | tr -d ' ')"

if [[ "$trigger" == "response" ]]; then
  case_name="$(basename "$(dirname "$response_dir")")"
  msg="Add agency response for ${case_name}"
elif [[ "$case_count" -eq 1 ]]; then
  case_name="$(basename "$(dirname "$case_dirs")")"
  msg="Add agency response for ${case_name}"
else
  msg="Add agency response and statistics"
fi

if ! git commit -m "$msg"; then
  echo "inbox-commit-push: commit failed for $file_path" >&2
  exit 0
fi

if ! git push; then
  echo "inbox-commit-push: push failed after commit for $file_path" >&2
  exit 0
fi

exit 0
