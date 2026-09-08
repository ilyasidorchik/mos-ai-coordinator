---
name: save-selected
description: >-
  Commits only the given file/directory paths and pushes to remote. Use when
  the user mentions /save-selected, «сохрани выбранное», or when /inbox passes
  an explicit path list for one case among several responses.
disable-model-invocation: true
---

# Save selected (commit + push listed paths)

## Overview

Commit **only** the paths passed by the caller, then `git push`. Unlike
[`/save`](../save/SKILL.md), this skill does **not** stage the whole working
tree.

Commit message: English, short — same **Commit message rules** as `/save`
(copied below for a self-contained skill).

## Input (required)

The caller **must** pass an explicit list of paths (files and/or directories).
Typical callers:

- [`/inbox`](../inbox/SKILL.md) — one case’s `…/response/` (and optionally
  root `statistics.md` on the first of several saves).
- The user — `/save-selected` plus paths in the message.

If no path list was given — stop and ask for paths. Do **not** commit
whatever happens to be staged already.

Skip secrets (`.env`, credentials, tokens) even if listed; warn if the user
explicitly asked to include them.

## Commit message rules

- New submitted appeal (`request/request.md` or `attempt-N/request/request.md`
  new or substantially updated in this commit, with a numeric id under
  `Номера обращений:`):

  ```text
  Add request #<id> about <English paraphrase of Заголовок>
  ```

- Take `<id>` from the agency line; if several agencies are listed, prefer the
  Дептранс id, otherwise the first numeric id in the block. Do **not** invent
  an id. If the block has only an agency name and no number — do not use this
  template; use a free-form English message.
- English part: short paraphrase of the `Заголовок:` field only (not `Текст:`);
  no quotes, no trailing period, no filler words.
- If the same commit also has side changes (e.g. a district folder rename),
  still lead the subject with the request template; do not inflate the subject
  with secondary items.
- Agency response (`response/response.md`, PDF, photos under `response/`, and
  optionally `statistics.md` for one case):

  ```text
  Add response to #<id> about <parent>/<case>
  ```

  - `<id>` — same rules as for requests (from sibling `request/request.md`).
  - `<case>` — folder that contains `response/` (e.g. `16-th-parkovaya-18` or
    `attempt-2`); `<parent>` — one level above it (e.g.
    `bike-friendly-drain-grates` or `zapovednaya`).
  - No id: `Add response about <parent>/<case>`.
  - Several unrelated cases in one commit: free-form (e.g. `Add agency response
    and statistics`).
- Other primary change types (photos-only outside a response save, skills,
  renames as the main change, draft without a number): free-form English
  message matching recent `git log` style.

## Workflow

### 1. Inspect

In parallel:

- `git status`
- `git diff` (staged and unstaged) for context
- `git log -5 --oneline` (match message style for non-template cases)

### 2. Stage only the given paths

```bash
git add -- <path1> <path2> …
```

- Stage **only** the paths from the input list. Do **not** run `git add .` or
  add other dirty files.
- If a listed path is a `…/response/` directory: after `git add`, drop temp
  pages if present:

  ```bash
  git reset -q -- "<that-response>/_pdf_pages" 2>/dev/null || true
  rm -rf "<that-response>/_pdf_pages" 2>/dev/null || true
  ```

### 3. Nothing staged?

If `git diff --cached --quiet` (index empty after step 2) — say so briefly;
do **not** commit or push.

### 4. Commit

1. Draft the commit message using **Commit message rules** from what will be
   in this commit (inspect `git diff --cached --name-only`).
2. Commit via HEREDOC:

```bash
git commit -m "$(cat <<'EOF'
Commit message here.

EOF
)"
```

### 5. Push

- `git push`
- If the branch has no upstream: `git push -u origin HEAD`
- Then confirm with `git status`

### 6. Report

Briefly: paths that were committed, the commit message, and that it was
pushed (or nothing to do).

## On failure

Same as [`/save`](../save/SKILL.md): no force-push, amend, rebase, or config
changes unless the user explicitly asks. Explain in simple language (Russian
is fine):

| Symptom | Plain explanation | Options |
| --- | --- | --- |
| No paths given | Need an explicit file/dir list | Ask the caller for paths |
| Nothing staged | Listed paths had no changes | Stop |
| Hook rejected the commit | A pre-commit check failed | Fix, then a **new** commit (do not amend unless allowed) |
| Network / auth error | Could not reach the remote or log in | Check internet / auth; retry later |
| Rejected (non-fast-forward) | Remote has commits you lack locally | `git pull --rebase`, then push |
| No upstream | Branch not linked to remote yet | `git push -u origin HEAD` |
| Merge conflict | Local and remote edits overlap | Resolve with the user, then commit and push |

## Expected user phrases

- `/save-selected`
- «сохрани выбранное»
- Call from `/inbox` with a path list for one case

## Safety rules

- Never update git config.
- Never `--force` / `--force-with-lease` to `main` / `master` unless the user
  explicitly requests it (and warn first).
- Never skip hooks (`--no-verify`).
- Never amend unless the user explicitly asks **and** the usual amend safety
  conditions hold (commit is yours, not pushed, etc.).
- If a hook fails the commit — fix and create a **new** commit; do not amend.
- Do not push if commit failed.
- Do not stage paths outside the given list.
