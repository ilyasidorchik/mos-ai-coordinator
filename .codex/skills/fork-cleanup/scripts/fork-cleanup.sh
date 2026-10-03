#!/usr/bin/env bash
# Prepare a fork of mos-ai-coordinator: remove the original author's cases,
# keep etalon samples, reset statistics.md.
#
# Usage:
#   fork-cleanup.sh [--dry-run|--apply] [--allow-offline] [--force-origin]
#
# Default: --dry-run (list only, no changes).
# Requires bash 3.2+ (macOS /bin/bash OK).
set -euo pipefail

MODE="dry-run"
ALLOW_OFFLINE=0
FORCE_ORIGIN=0
UPSTREAM_URL="https://github.com/ilyasidorchik/mos-ai-coordinator.git"
UPSTREAM_REF="main"
BLOCKED_OWNER_REPO="ilyasidorchik/mos-ai-coordinator"

KEEP_PREFIXES="SVAO/pedestrian-crossings/zapovednaya/
ZAO/public-transport/bus-688-krylatskoye/
SVAO/cycling/otradnoye-cycle-sign/"

usage() {
  cat >&2 <<'EOF'
Usage:
  fork-cleanup.sh [--dry-run|--apply] [--allow-offline] [--force-origin]

  --dry-run        List files that would be removed (default).
  --apply          git rm author cases and reset statistics.md.
  --allow-offline  If upstream fetch fails, delete all non-etalon tracked
                   candidates (dangerous; requires agent confirmation).
  --force-origin   Skip the "must not be upstream origin" guard
                   (for tests only).
EOF
  exit 1
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --dry-run) MODE="dry-run"; shift ;;
    --apply) MODE="apply"; shift ;;
    --allow-offline) ALLOW_OFFLINE=1; shift ;;
    --force-origin) FORCE_ORIGIN=1; shift ;;
    -h|--help) usage ;;
    *)
      echo "Unknown argument: $1" >&2
      usage
      ;;
  esac
done

die() {
  echo "ERROR: $*" >&2
  exit 1
}

tolower() {
  printf '%s' "$1" | tr '[:upper:]' '[:lower:]'
}

is_kept_etalon() {
  local path="$1"
  local prefix
  while IFS= read -r prefix; do
    [[ -z "$prefix" ]] && continue
    case "$path" in
      "$prefix"*) return 0 ;;
    esac
  done <<EOF
$KEEP_PREFIXES
EOF
  return 1
}

# Top-level dirs whose tracked content may be cleaned (except etalons / inbox/.gitkeep).
is_cleanup_candidate_path() {
  local path="$1"
  case "$path" in
    .*) return 1 ;;
    docs|docs/*) return 1 ;;
    inbox/.gitkeep) return 1 ;;
    inbox/*) return 0 ;;
    */*) return 0 ;;
    *) return 1 ;;
  esac
}

normalize_github_owner_repo() {
  local url="$1"
  url="${url%.git}"
  # git@github.com:owner/repo or https://github.com/owner/repo
  if printf '%s' "$url" | grep -Eq 'github\.com[:/][^/]+/[^/]+$'; then
    printf '%s' "$url" | sed -E 's#.*github\.com[:/]([^/]+)/([^/]+)$#\1/\2#'
    return 0
  fi
  return 1
}

REPO_ROOT="$(git rev-parse --show-toplevel 2>/dev/null)" || die "Not inside a git repository."
cd "$REPO_ROOT"

if [[ "$(git rev-parse --show-prefix 2>/dev/null || true)" != "" ]]; then
  die "Run from the repository root."
fi

ORIGIN_URL="$(git remote get-url origin 2>/dev/null || true)"
[[ -n "$ORIGIN_URL" ]] || die "No git remote named origin."

ORIGIN_OWNER_REPO="$(normalize_github_owner_repo "$ORIGIN_URL" || true)"
if [[ "$FORCE_ORIGIN" -eq 0 ]]; then
  if [[ "$(tolower "$ORIGIN_OWNER_REPO")" == "$(tolower "$BLOCKED_OWNER_REPO")" ]]; then
    die "origin is ${ORIGIN_OWNER_REPO} — this looks like the upstream repo, not a fork. Fork on GitHub first, then clone your fork."
  fi
fi

if [[ -n "$(git status --porcelain)" ]]; then
  die "Working tree is not clean. Commit or stash changes, then retry."
fi

TMPDIR_FC="$(mktemp -d "${TMPDIR:-/tmp}/fork-cleanup.XXXXXX")"
cleanup_tmp() { rm -rf "$TMPDIR_FC"; }
trap cleanup_tmp EXIT

TO_DELETE_FILE="$TMPDIR_FC/to-delete.txt"
ETALON_FILE="$TMPDIR_FC/etalon.txt"
OWN_FILE="$TMPDIR_FC/own.txt"
: >"$TO_DELETE_FILE"
: >"$ETALON_FILE"
: >"$OWN_FILE"

OFFLINE=0
echo "== Fetch upstream (${UPSTREAM_URL} ${UPSTREAM_REF}) =="
if ! git fetch --no-tags "$UPSTREAM_URL" "$UPSTREAM_REF" 2>"$TMPDIR_FC/fetch.err"; then
  cat "$TMPDIR_FC/fetch.err" >&2 || true
  if [[ "$ALLOW_OFFLINE" -eq 1 ]]; then
    OFFLINE=1
    echo "WARN: upstream fetch failed; --allow-offline: treating all non-etalon candidates as deletable." >&2
  else
    die "Could not fetch upstream. Fix network/auth, or pass --allow-offline after explicit user confirmation."
  fi
else
  echo "Fetched into FETCH_HEAD."
fi

# Build upstream path set (NUL-separated) for membership checks.
UPSTREAM_Z="$TMPDIR_FC/upstream.z"
: >"$UPSTREAM_Z"
if [[ "$OFFLINE" -eq 0 ]]; then
  git ls-tree -r --name-only -z FETCH_HEAD >"$UPSTREAM_Z"
fi

while IFS= read -r -d '' path; do
  [[ -z "$path" ]] && continue
  if ! is_cleanup_candidate_path "$path"; then
    continue
  fi
  if is_kept_etalon "$path"; then
    printf '%s\n' "$path" >>"$ETALON_FILE"
    continue
  fi
  if [[ "$OFFLINE" -eq 1 ]]; then
    printf '%s\n' "$path" >>"$TO_DELETE_FILE"
    continue
  fi
  # Exact NUL-delimited match in upstream tree
  if grep -F -z -x -q -- "$path" "$UPSTREAM_Z" 2>/dev/null; then
    printf '%s\n' "$path" >>"$TO_DELETE_FILE"
  else
    printf '%s\n' "$path" >>"$OWN_FILE"
  fi
done < <(git ls-files -z)

line_count() {
  wc -l <"$1" | tr -d ' '
}
DELETE_COUNT="$(line_count "$TO_DELETE_FILE")"
ETALON_COUNT="$(line_count "$ETALON_FILE")"
OWN_COUNT="$(line_count "$OWN_FILE")"

count_by_top() {
  local file="$1"
  if [[ ! -s "$file" ]]; then
    echo "(none)"
    return
  fi
  awk -F/ '{c[$1]++} END {for (k in c) printf "  %s: %d\n", k, c[k]}' "$file" | LC_ALL=C sort
}

echo
echo "== Summary =="
echo "Mode: $MODE"
echo "Origin: $ORIGIN_URL"
echo "Offline: $OFFLINE"
echo "To delete: $DELETE_COUNT"
count_by_top "$TO_DELETE_FILE"
echo "Etalon kept: $ETALON_COUNT"
while IFS= read -r prefix; do
  [[ -z "$prefix" ]] && continue
  n="$(grep -c "^${prefix}" "$ETALON_FILE" 2>/dev/null || echo 0)"
  n="${n:-0}"
  echo "  $prefix → $n files"
done <<EOF
$KEEP_PREFIXES
EOF
echo "Forker's own kept (not in upstream): $OWN_COUNT"
if [[ -s "$OWN_FILE" ]]; then
  head -20 "$OWN_FILE" | sed 's/^/  /'
  if [[ "$OWN_COUNT" -gt 20 ]]; then
    echo "  … ($((OWN_COUNT - 20)) more)"
  fi
fi

# Empty / untracked-only top-level dirs (informational)
echo "Note — top-level dirs with no tracked files after cleanup candidates:"
found_empty=0
for top in */; do
  top="${top%/}"
  case "$top" in
    .*|docs|inbox) continue ;;
  esac
  tracked_count="$(git ls-files -- "$top" | grep -c . || true)"
  tracked_count="${tracked_count:-0}"
  # After planned delete, remaining = etalon + own under this top
  remaining="$( (grep "^${top}/" "$ETALON_FILE" || true; grep "^${top}/" "$OWN_FILE" || true) | grep -c . || true)"
  remaining="${remaining:-0}"
  if [[ "$tracked_count" -eq 0 ]]; then
    echo "  $top (empty / untracked only)"
    found_empty=1
  fi
done
if [[ "$found_empty" -eq 0 ]]; then
  echo "  (none)"
fi

# Persist delete list for the agent
cp "$TO_DELETE_FILE" /tmp/fork-cleanup-to-delete.txt 2>/dev/null || true
echo "Full delete list: /tmp/fork-cleanup-to-delete.txt"

if [[ "$DELETE_COUNT" -eq 0 ]]; then
  echo
  echo "ALREADY_CLEAN=1"
  echo "Nothing to delete (already cleaned, or only etalons remain)."
  if [[ "$MODE" != "apply" ]]; then
    exit 0
  fi
fi

write_statistics() {
  cat > statistics.md <<'EOF'
# Статистика

| Обращений подано | Ответов получено | Мер принято |
| --- | --- | --- |
| 0 | 0 | 0 |

## Принятые меры
EOF
}

if [[ "$MODE" == "dry-run" ]]; then
  echo
  echo "Dry-run only. Re-run with --apply after confirmation."
  exit 0
fi

# --apply
if [[ "$DELETE_COUNT" -gt 0 ]]; then
  echo
  echo "== git rm ($DELETE_COUNT paths) =="
  # Batch to avoid ARG_MAX
  batch=()
  batch_n=0
  while IFS= read -r path; do
    [[ -z "$path" ]] && continue
    batch+=("$path")
    batch_n=$((batch_n + 1))
    if [[ "$batch_n" -ge 200 ]]; then
      git rm -q -- "${batch[@]}"
      batch=()
      batch_n=0
    fi
  done <"$TO_DELETE_FILE"
  if [[ "$batch_n" -gt 0 ]]; then
    git rm -q -- "${batch[@]}"
  fi
fi

echo "== Reset statistics.md =="
write_statistics
git add statistics.md

echo "== Prune empty directories =="
for top in */; do
  top="${top%/}"
  case "$top" in
    .*|docs) continue ;;
  esac
  if [[ -d "$top" ]]; then
    # Repeat until stable (find -delete empties parents gradually)
    for _ in 1 2 3 4 5 6 7 8; do
      find "$top" -type d -empty -delete 2>/dev/null || true
    done
    if [[ -d "$top" ]] && [[ -z "$(ls -A "$top" 2>/dev/null || true)" ]]; then
      rmdir "$top" 2>/dev/null || true
    fi
  fi
done

mkdir -p inbox
if [[ ! -f inbox/.gitkeep ]]; then
  touch inbox/.gitkeep
  git add inbox/.gitkeep
fi

echo
echo "APPLY_DONE=1"
echo "Deleted: $DELETE_COUNT"
echo "Etalon kept: $ETALON_COUNT"
echo "Own kept: $OWN_COUNT"
echo "statistics.md reset to 0/0/0."
echo "Working tree is staged; commit via /save."
git status --short | head -50
