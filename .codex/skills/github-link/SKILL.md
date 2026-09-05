---
name: github-link
description: >-
  Builds a GitHub blob URL for a file in this repository
  (https://github.com/<owner>/<repo>/blob/<branch>/<path>). Use when the user
  mentions /github-link, «ссылка на GitHub», «github link», «blob url», or asks
  for a GitHub link to response.md or another repo file.
disable-model-invocation: true
---

# GitHub link

## Overview

By **explicit** command only: resolve a file in this git repo and print its
GitHub blob URL. Nothing else — no edits, commits, push, or Telegram.

Format:

```text
https://github.com/<owner>/<repo>/blob/<branch>/<path>
```

Example:

```text
https://github.com/ilyasidorchik/mos-ai-coordinator/blob/main/UVAO/public-transport/bus-438-to-metro-delay/2026-08-05/response/response.md
```

## Expected user phrases

- `/github-link`
- `/github-link` + `@…` or a file path
- «Ссылка на GitHub»
- «Дай ссылку на response.md»
- «github link» / «blob url»

## Workflow

### 1. Resolve the file

1. Explicit `@…` path or path in the message.
2. Else — the file open in the IDE.
3. Else — ask for the path; do **not** guess.

The target must be a path inside this repository (relative to the repo root, or
an absolute path under the repo root).

### 2. Build the URL (readonly git, no network)

From the repo root:

1. `git remote get-url origin` → parse `owner` and `repo`:
   - `git@github.com:OWNER/REPO.git`
   - `https://github.com/OWNER/REPO.git`
   - `https://github.com/OWNER/REPO`
   Strip a trailing `.git` from `REPO`. If `origin` is missing or not GitHub —
   **stop** and say so.
2. Branch: `git rev-parse --abbrev-ref HEAD` (this repo is usually `main`).
   If detached HEAD (`HEAD`) — **stop** and ask the user which branch to use;
   do not invent.
3. `path` — path relative to the repo root, with `/` separators.
   URL-encode path segments when needed (spaces and non-ASCII); keep `/`
   between segments. Do not encode `/`.

Assemble:

```text
https://github.com/<owner>/<repo>/blob/<branch>/<path>
```

### 3. Report

Reply with **one line**: the full URL only — no Markdown link wrapper, no
extra commentary.

If the file is outside the repo — say so briefly and stop.

## Safety rules

- Do not run without an explicit user command for this skill.
- Do not invent owner, repo, branch, or path.
- Do not commit, push, edit files, or post to Telegram.
- Do not open the URL in a browser unless the user asks separately.
