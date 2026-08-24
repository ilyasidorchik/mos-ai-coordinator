---
name: save
description: >-
  Commits all current changes and pushes to remote. Use when the user mentions
  /save, «Сохранись», «закоммить и запушь», or asks to save the work to git.
disable-model-invocation: true
---

# Save (commit + push)

## Overview

Commit every current change in the repo, then `git push`. Commit message:
English, short — follow **Commit message rules** below.

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
- `git diff` (staged and unstaged)
- `git log -5 --oneline` (match message style for non-template cases)

### 2. Nothing to commit?

- If the working tree is clean and the branch is already synced with remote —
  say so briefly; do not push for the sake of pushing.
- If the working tree is clean but there are unpushed commits — only `git push`.

### 3. Commit

1. Stage all relevant changes (`git add`). Skip secrets (`.env`, credentials,
   tokens). Warn if the user explicitly asked to include them.
2. Draft the commit message using **Commit message rules**.
3. Commit via HEREDOC:

```bash
git commit -m "$(cat <<'EOF'
Commit message here.

EOF
)"
```

### 4. Push

- `git push`
- If the branch has no upstream: `git push -u origin HEAD`
- Then confirm with `git status`

### 5. Report

Briefly: what was committed (message), and that it was pushed (or only pushed /
nothing to do).

## On failure

Do **not** run force-push, amend, rebase, or config changes unless the user
explicitly asks. Explain the problem in simple language (Russian is fine) and
offer options:

| Symptom | Plain explanation | Options |
| --- | --- | --- |
| Nothing to commit | Everything is already saved | Stop, or push only if there are unpushed commits |
| Hook rejected the commit | A pre-commit check failed | Fix what the hook reported, then make a **new** commit (do not amend unless the user asks and amend rules allow it) |
| Network / auth error | Could not reach the remote or log in | Check internet; `gh auth login` / SSH keys; retry later |
| Rejected (non-fast-forward) | Remote has commits you do not have locally | `git pull --rebase`, then push; or sort it out together |
| No upstream | Branch is not linked to remote yet | `git push -u origin HEAD` |
| Merge conflict | Local and remote edits overlap | Resolve conflicts with the user, then commit and push |

## Expected user phrases

- `/save`
- `Сохранись`
- `Закоммить и запушь`

## Safety rules

- Never update git config.
- Never `--force` / `--force-with-lease` to `main` / `master` unless the user
  explicitly requests it (and warn first).
- Never skip hooks (`--no-verify`).
- Never amend unless the user explicitly asks **and** the usual amend safety
  conditions hold (commit is yours, not pushed, etc.).
- If a hook fails the commit — fix and create a **new** commit; do not amend.
- Do not push if commit failed.
