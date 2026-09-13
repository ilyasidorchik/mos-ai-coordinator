---
name: github-link
description: >-
  Builds a GitHub blob URL for a file in this repository
  (https://github.com/<owner>/<repo>/blob/<branch>/<path>). Use when the user
  mentions /github-link or github-link (with or without slash), «ссылка на
  GitHub», «ссылка на обращение», «на Гитхабе», «github link», «blob url», or
  asks for a GitHub link to request.md, response.md, or another repo file —
  including when composing a Telegram caption that needs such a link.
---

# GitHub link

## Overview

Resolve a file in this git repo and build its GitHub blob URL. Nothing else —
no edits, commits, push, or Telegram publish by this skill alone.

Works both as `/github-link` and without a slash (natural phrases or when
another task needs the URL). Do not invent the URL by hand — follow this
workflow.

Format:

```text
https://github.com/<owner>/<repo>/blob/<branch>/<path>
```

Example:

```text
https://github.com/ilyasidorchik/mos-ai-coordinator/blob/main/UVAO/public-transport/bus-438-to-metro-delay/2026-08-05/response/response.md
```

## Expected user phrases

- `/github-link` or `github-link` (with or without slash)
- `/github-link` / `github-link` + `@…` or a file path
- «Ссылка на GitHub» / «ссылка на Гитхаб»
- «Ссылка на обращение» / «полный текст на Гитхабе»
- «Дай ссылку на response.md» / «request.md»
- «github link» / «blob url»
- Telegram caption that should include a link to the appeal on GitHub

## Workflow

### 1. Resolve the file

1. Explicit `@…` path or path in the message.
2. Else — for an appeal link, prefer that case’s `request/request.md`.
3. Else — the file open in the IDE.
4. Else — ask for the path; do **not** guess.

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

If this skill is the whole task: reply with **one line** — the full URL only,
no Markdown link wrapper, no extra commentary.

If another task needs the URL (e.g. Telegram caption): build it the same way
and use it there; do not replace that task’s reply with a URL-only message.

If the file is outside the repo — say so briefly and stop.

## Safety rules

- Do not invent owner, repo, branch, or path.
- Do not commit, push, or edit files.
- Do not publish to Telegram from this skill (only supply the URL if asked).
- Do not open the URL in a browser unless the user asks separately.
