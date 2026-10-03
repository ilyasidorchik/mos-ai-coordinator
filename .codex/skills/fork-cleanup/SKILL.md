---
name: fork-cleanup
description: >-
  Prepares a fork of this repository for another person's work: deletes the
  original author's appeal cases and responses, keeps three etalon sample
  cases, resets statistics.md to zeros, verifies links and skill symlinks.
  Use when the user mentions /fork-cleanup, «Подготовь форк», «Очисти форк»,
  «Удали обращения автора», «Удали все обращения и ответы», or «Обнули
  репозиторий под себя».
---

# Fork cleanup

## Overview

One-shot cleanup after forking [ilyasidorchik/mos-ai-coordinator](https://github.com/ilyasidorchik/mos-ai-coordinator). Removes the original author's cases so the fork is ready for someone else's appeals.

Works as `/fork-cleanup` and from natural phrases (see below). Always run the script; do not delete case trees by hand.

## Expected user phrases

- `/fork-cleanup`
- «Подготовь форк»
- «Очисти форк»
- «Удали обращения автора»
- «Удали все обращения и ответы»
- «Обнули репозиторий под себя»

## What stays / what goes

**Keep**

- Tooling: `.codex/`, `.cursor/`, `.templates/`, `.vscode/`, `docs/`
- Root files: `AGENTS.md`, `CLAUDE.md`, `README.md`, `logo.png`, `.env.example`, `.gitignore`
- `inbox/.gitkeep`
- Etalon sample cases (do not edit; not the forker's appeals):
  - `SVAO/pedestrian-crossings/zapovednaya/`
  - `ZAO/public-transport/bus-688-krylatskoye/`
  - `SVAO/cycling/otradnoye-cycle-sign/`

**Delete**

- All other tracked files under non-dot top-level dirs (`SVAO`, `ZAO`, `CAO`, `UAO`, `UVAO`, `VAO`, `common`, future districts, …) that also exist on upstream `main`
- Everything in `inbox/` except `.gitkeep`

**Reset**

- `statistics.md` → empty template (counters `0 | 0 | 0`, empty «Принятые меры»)

Forker's own cases created before cleanup (paths not present on upstream) are **kept**.

## Workflow

### 1. Preflight (agent)

1. `cd` to the git repo root.
2. Confirm `git remote get-url origin` is **not** `ilyasidorchik/mos-ai-coordinator`. If it is — **stop**: this is the upstream clone, not a fork. Tell the user to Fork on GitHub first.
3. Working tree must be clean (`git status`). If dirty — stop; ask to commit/stash.
4. Do not stash, force-push, or rewrite history.

### 2. Dry-run

From the repo root:

```bash
bash .codex/skills/fork-cleanup/scripts/fork-cleanup.sh --dry-run
```

The script:

1. Fetches `https://github.com/ilyasidorchik/mos-ai-coordinator.git` `main` into `FETCH_HEAD` (no new remote, no config changes).
2. Lists paths to delete (intersection of local cleanup candidates and upstream), etalon keeps, and forker-owned keeps.
3. Writes the full delete list to `/tmp/fork-cleanup-to-delete.txt`.

If fetch fails: **stop**. Explain network/auth. Only after the user explicitly agrees, retry with `--allow-offline` (deletes all non-etalon candidates without upstream comparison — riskier).

If output contains `ALREADY_CLEAN=1` and nothing to do — say the fork is already cleaned; optionally still offer to reset `statistics.md` via `--apply` if counters are non-zero.

### 3. Confirm

Use AskQuestion (or a clear yes/no) with a short summary:

- how many files would be deleted (by top-level folder);
- which etalons stay;
- how many of the forker's own paths stay;
- that the next step is `git rm` + reset `statistics.md` + commit/push via `/save`.

Options: proceed / cancel. On cancel — stop.

### 4. Apply

```bash
bash .codex/skills/fork-cleanup/scripts/fork-cleanup.sh --apply
```

(Add `--allow-offline` only if dry-run used it with user consent.)

### 5. Verify

1. Etalons exist:
   - `SVAO/pedestrian-crossings/zapovednaya/README.md`
   - `ZAO/public-transport/bus-688-krylatskoye/README.md`
   - `SVAO/cycling/otradnoye-cycle-sign/request/request.md`
2. Relative links in `AGENTS.md`, `README.md`, `.codex/skills/new/SKILL.md`, `.codex/skills/check-mail-for-sent-requests/SKILL.md` that point at those etalons still resolve.
3. `.cursor/skills/*` entries are real symlinks **or** directories. If any is a plain text file (Windows clone without symlinks) — warn: re-clone with `git -c core.symlinks=true clone …` or enable symlinks and re-checkout.
4. `statistics.md` shows `0 | 0 | 0`.
5. After `/save` (clean tree), re-running dry-run should report `ALREADY_CLEAN=1`.

### 6. Save

Read and follow [`.codex/skills/save/SKILL.md`](../save/SKILL.md) completely (commit + push).

Preferred commit message:

```text
Remove original author's requests and responses
```

### 7. Report

Briefly, in Russian:

1. Deleted N files; etalons kept; own paths kept (if any).
2. `statistics.md` reset.
3. Commit/push result from `/save`.
4. Next steps for the forker:
   - Copy `.env.example` → `.env` only if they need `/mail-inbox` or `/telegram`.
   - Do **not** press GitHub «Sync fork» — it would restore deleted cases.
   - Forks are public: appeals/PDFs/photos may contain personal data; use `/hide-pers-data` / `/car-save`. For privacy, prefer a private import over a public fork.
   - PRs that improve skills back upstream must branch from `upstream/main`, not from the cleaned `main` (otherwise the PR deletes all upstream cases).
   - Start with `/new`.

## statistics.md template (after reset)

The apply step writes exactly:

```markdown
# Статистика

| Обращений подано | Ответов получено | Мер принято |
| --- | --- | --- |
| 0 | 0 | 0 |

## Принятые меры
```

Do not invent other counters. Keep this table shape so `/new` and `/inbox` can bump cells later.

## Safety rules

- Refuse to run cleanup when `origin` is the upstream repo (script enforces this; `--force-origin` is for tests only — never pass it for a real user run).
- Never delete etalon prefixes listed above.
- Never delete the forker's paths that are absent from upstream `FETCH_HEAD` (unless `--allow-offline` after explicit consent).
- Never `git push --force`, amend, or rewrite history to shrink `.git`.
- Never commit `.env` or secrets.
- Never edit upstream etalon case bodies «to fit» the forker.
- Do not run `--apply` without confirmation after a dry-run summary.
