---
name: sync-worktrees
description: >-
  Rebases the second-hand worktree onto main, auto-resolves statistics.md
  appeal-count conflicts, force-pushes second-hand, then fast-forwards main
  to second-hand and pushes main. Use when the user mentions /sync-worktrees,
  «синхронизируй second-hand», or «ребейзни second-hand на main».
disable-model-invocation: true
---

# Sync worktrees (second-hand ↔ main)

## Overview

Synchronize the parallel worktree `second-hand` with `main`, ending with
commits present on **`main` and `origin/main`**:

1. Rebase `second-hand` onto current `origin/main`.
2. Auto-resolve a typical `statistics.md` «Обращений подано» conflict.
3. `git push --force-with-lease` for `second-hand`.
4. Fast-forward `main` to `second-hand` and `git push origin main`.

Without step 4, commits stay only on `second-hand` — that is not enough.

Default parallel branch/worktree: `second-hand`. If the user names another
worktree/branch, use that instead.

## Workflow

### 1. Inspect

1. `git worktree list` — find paths for branch `second-hand` and branch `main`.
2. In **both** worktrees: `git status` must be clean.
3. If a worktree is missing or either tree is dirty — stop and report; do not
   stash or discard unless the user asks.

### 2. Fetch

From either clone:

```bash
git fetch origin main
git fetch origin second-hand
```

(Adapt the second fetch if the parallel branch name differs.)

### 3. Rebase (if needed)

In the `second-hand` worktree directory:

- If `git rev-list --count second-hand..origin/main` is **0** — skip rebase
  (`second-hand` is already on top of `origin/main`).
- Otherwise:

```bash
git rebase origin/main
```

### 4. Conflicts during rebase

**Allowed auto-resolve** — only when the sole conflict is `statistics.md` and
only the «Обращений подано» cell differs:

1. Read the count on `HEAD` (onto / `main`): `HEAD_count`.
2. Read the count in the commit being applied: `ours`.
3. Read the count at the merge-base of that commit vs onto: `base`.
4. Set resolved value: `HEAD_count + (ours − base)`.
5. Leave «Ответов получено» and «Мер принято» as on `HEAD` unless they are
   also conflicted (then stop — do not invent).
6. Write the resolved file, `git add statistics.md`, continue.

**Any other conflict** (other files, or unclear `statistics.md`) — do **not**
guess. Prefer `git rebase --abort` if nothing was partially continued, or leave
the rebase paused; describe conflicts and ask the user.

### 5. Continue rebase

Non-interactive:

```bash
GIT_EDITOR=true git rebase --continue
```

Repeat conflict handling until rebase finishes.

### 6. Push `second-hand`

From the `second-hand` worktree, if history was rewritten or the tip is ahead
of / diverged from `origin/second-hand`:

```bash
git push --force-with-lease
```

If already identical to remote after a no-op rebase — skip push.

### 7. Bring into `main`

In the **`main` worktree**:

```bash
git merge --ff-only second-hand
```

If fast-forward is impossible — **stop**. Do not create a merge commit unless
the user explicitly asks. Report why ff failed.

### 8. Push `main`

From the `main` worktree:

```bash
git push origin main
```

Never `--force` / `--force-with-lease` on `main` / `master`.

### 9. Report

Briefly:

- whether rebase ran (onto which SHA);
- `statistics.md` resolution if any (`old → new` for «Обращений подано»);
- tips of `second-hand` and `main` (should match after ff);
- both pushes (or skips).

## Expected user phrases

- `/sync-worktrees`
- `Синхронизируй second-hand`
- `Ребейзни second-hand на main`

## On failure

| Symptom | Plain explanation | Options |
| --- | --- | --- |
| Missing worktree | No checked-out `second-hand` or `main` path | Create/add worktree, or name another branch |
| Dirty working tree | Uncommitted changes in a worktree | Commit/`/save`, stash, or discard — then retry |
| Non-statistics conflict | Rebase hit files beyond the appeal counter | Abort or resolve with the user |
| Lease rejected | Remote `second-hand` moved | Fetch, inspect, retry `--force-with-lease` only if safe |
| Non-ff merge into `main` | `main` and `second-hand` diverged | Stop; rebase/sort with user — no merge commit by default |
| Network / auth error | Could not reach remote | Check internet / SSH / `gh auth`; retry later |

## Safety rules

- End state of `/sync-worktrees`: commits from `second-hand` are on `main` and
  `origin/main`.
- Never update git config.
- Never `--force` / `--force-with-lease` on `main` / `master`.
- Never skip hooks (`--no-verify`).
- Never `git rebase --skip` someone else’s commit without an explicit ask.
- Do not invent new commits beyond resolving the allowed `statistics.md`
  conflict during rebase.
- Do not create a merge commit on `main` when `--ff-only` fails — ask first.
