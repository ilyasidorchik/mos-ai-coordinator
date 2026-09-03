---
name: typograf
description: >-
  Applies Russian typography rules to appeal texts and markdown files in the
  repository: guillemets, em dashes, non-breaking spaces. Use when the user
  asks to typograf text, mentions «оттипографировать», «типографика»,
  «оттипографируй», or wants typography fixes in request.md or other texts.
---

# Typograf

## Overview

Apply Russian typography to the text the user points to via the project script
(in place). Do not hand-edit NBSP, quotes, or dashes — run the script.

Typical targets: `request/request.md`, draft paragraphs in case folders.

## Rules (what the script does)

- русские кавычки «…»;
- длинное тире;
- неразрывные пробелы после коротких предлогов, союзов и у чисел;
- в адресах: NBSP после «ул.», «пр.», «пер.», «ш.», «б-р», «наб.», «пл.» и между словами многословного названия (`ул. Академика Анохина`).

## Workflow

1. Resolve the target file (prefer the path the user gave; else the case `request/request.md`).
2. From the repo root, run:

```bash
.codex/skills/typograf/scripts/typograf.sh "path/to/request.md"
```

3. Report briefly: `updated` / `unchanged` from the script stderr, and any issues.

If the user pasted text without a file — save it to the intended `request.md` first, then run the script (or ask where to write).

## Expected user phrases

- `Оттипографируй текст`
- `Оттипографируй request.md`
- `Приведи к типографике`
- `@case/request/request.md` with a typography request

## Safety rules

- Do not alter the meaning of official quotes beyond typography the script applies.
- Do not change numbers, dates, addresses, or reference numbers by hand.
- Do not typograf files outside the repo (the script refuses paths outside the git root).
- Do not invent facts or rewrite style beyond typography.
