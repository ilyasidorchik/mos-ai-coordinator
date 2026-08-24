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

# Build: Add response to #<id> about <parent>/<case>
# case_dir = parent of response/; id from sibling request/request.md
build_response_msg() {
  local resp_dir="$1"
  local case_dir case_name parent_name about request_md id
  case_dir="$(dirname "$resp_dir")"
  case_name="$(basename "$case_dir")"
  parent_name="$(basename "$(dirname "$case_dir")")"
  about="${parent_name}/${case_name}"
  request_md="${case_dir}/request/request.md"
  id=""
  if [[ -f "$request_md" ]]; then
    id="$(
      python3 -c '
import re, sys
from pathlib import Path

def norm(s: str) -> str:
    return s.replace("\u00a0", " ").strip()

text = Path(sys.argv[1]).read_text(encoding="utf-8")
lines = text.splitlines()
start = None
for i, line in enumerate(lines):
    if re.match(r"(?i)^Номера?\s+обращени[яй]\s*:\s*$", norm(line)):
        start = i + 1
        break
if start is None:
    sys.exit(0)
deptrans = None
first = None
for line in lines[start:]:
    s = norm(line)
    if not s:
        break
    if re.match(r"(?i)^(Заголовок|Текст)\s*:", s):
        break
    nums = re.findall(r"\d{5,}", s)
    if not nums:
        continue
    if first is None:
        first = nums[0]
    if re.search(r"дептранс", s, re.I):
        deptrans = nums[0]
        break
print(deptrans or first or "", end="")
' "$request_md"
    )"
  fi
  if [[ -n "$id" ]]; then
    printf 'Add response to #%s about %s' "$id" "$about"
  else
    printf 'Add response about %s' "$about"
  fi
}

if [[ "$trigger" == "response" ]]; then
  msg="$(build_response_msg "$response_dir")"
elif [[ "$case_count" -eq 1 ]]; then
  msg="$(build_response_msg "$case_dirs")"
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
