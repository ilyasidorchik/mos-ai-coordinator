---
name: car-save
description: >-
  Masks vehicle identity (date/time, make, plate) in a MADI / no-stopping
  appeal, deletes request photos for GitHub safety, then runs /save. Use when
  the user mentions /car-save, «сохрани машину», «замаскируй и сохрани», or
  asks to redact a car-stop case before publishing.
disable-model-invocation: true
---

# Save car (mask + delete photos + /save)

## Overview

Before committing a car / sign 3.27 appeal for a public GitHub repo:

1. Mask sensitive fields in the case `request.md`.
2. Delete images from that case’s `request/photos/`.
3. Run [`/save`](../save/SKILL.md) (commit all current changes + push).

Do **not** copy commit/push rules here — always delegate step 3 to `/save`.

## Workflow

### 1. Resolve the target case

Prefer, in order:

1. Explicit `@`-path or path in the user message (`…/request/request.md` or
   the case / `attempt-N` folder).
2. The focused / open `request.md` for a car-stop case.
3. If several cases are open or the target is ambiguous — ask **one** clarifying
   question and stop.

Target file: `request/request.md` (or `attempt-N/request/request.md`).
Photos folder: sibling `photos/` next to that `request.md`.

### 2. Mask `request.md`

Edit only the appeal body under `Текст:` (the narrative paragraphs). Do **not**
change:

- `Номер обращения:` / appeal id lines;
- `Заголовок:` (keep the real address there);
- address, district (ЦАО, …), year, month name, sign 3.27 wording;
- «В приложении фото…» / attachment lines.

Apply these substitutions where the real values still appear:

| Field | Match (examples) | Replace with |
| --- | --- | --- |
| Day | `25 сентября`, `3 января` (day digits before a Russian month name) | `XX сентября`, `XX января` |
| Time | `в 20:53`, `в 9:05` | `в XX:XX` |
| Make | `марки Geely Tugella`, `предположительно марки …` | keep «предположительно» if already present: `предположительно марки X`; else `марки X` |
| Plate | `с госномером О 684 ММ 977`, `госномером О684ММ977`, similar ГРЗ forms | `с госномером X` (preserve leading `с ` if present) |

Rules:

- If a field is already masked (`X`, `XX`, `XX:XX`) — leave it.
- If a field is absent — skip it; do not invent placeholders the text never had.
- Prefer minimal in-place edits; do not rewrite the whole appeal.
- Do not run typograf unless `/save` or the user separately requires it.

### 3. Delete photos

In the resolved `request/photos/` folder only:

- Delete image files: `.jpg`, `.jpeg`, `.png`, `.webp`, `.heic` (any case).
- Keep the empty `photos/` directory.
- Do **not** delete videos (`.mov`, `.mp4`, …) unless the user explicitly asks.
- Do **not** touch `response/`, other cases, or files outside this `photos/`.

If the folder is missing or has no images — note that and continue.

### 4. Run `/save`

1. Read [`.codex/skills/save/SKILL.md`](../save/SKILL.md).
2. Follow it completely (inspect → commit all relevant changes → push → report).

`/car-save` only prepares the case; `/save` owns git.

### 5. Report

Briefly, in order:

1. Masking: which fields were redacted (day / time / make / plate) or skipped.
2. Photos: how many image files deleted (or none).
3. The `/save` outcome (commit message + push, or nothing to do).

## Expected user phrases

- `/car-save`
- `Сохрани машину`
- `Замаскируй и сохрани`
- `@case/request/request.md` with a mask-and-save request for a car-stop appeal

## Safety rules

- Only modify the resolved case’s `request.md` and its `request/photos/`.
- Do not rewrite git history to scrub already-pushed photos or plates.
- Do not invent appeal facts while masking.
- Do not force-push, amend, or skip hooks — `/save` safety rules apply.
- Do not commit secrets (`.env`, credentials, tokens).
