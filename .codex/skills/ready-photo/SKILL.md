---
name: ready-photo
description: >-
  Prepares appeal photos for submission: renames via rename-photo, then
  compresses each via compress-photo. Use when the user asks to prepare photos,
  mentions /ready-photo, «Подготовь фото», or «Подготовь фото для отправки».
disable-model-invocation: true
---

# Ready Photo

## Overview

Prepare one photo or every image in a case `request/photos/` folder for mos.ru
submission:

1. Rename via [`rename-photo`](../rename-photo/SKILL.md).
2. Compress each resulting image via [`compress-photo`](../compress-photo/SKILL.md).

Do not duplicate photo-naming or compression rules here — always delegate to
those skills.

Typical paths: `request/photos/` inside a case folder.

## Workflow

### 1. Resolve the target

- Prefer the path the user gave (`@`-mention, file, or `photos/` directory).
- If only a case is open/mentioned, use that case’s `request/photos/` (or
  `attempt-N/request/photos/` when working on a series iteration).
- Supported images: `.jpg`, `.jpeg`, `.png`, `.webp`, `.heic` (and upper-case variants).
- If the folder is missing or has no supported images — report and stop.
- If nothing resolvable — ask once and stop.

### 2. Rename photos

Read [`.codex/skills/rename-photo/SKILL.md`](../rename-photo/SKILL.md) and apply
it to the resolved target (one file or **all** images in the folder). Do not
invent rename rules here.

### 3. Compress photos

After rename, read [`.codex/skills/compress-photo/SKILL.md`](../compress-photo/SKILL.md)
and run it **once per image** left in the same folder (or the single renamed
file). The compress skill is single-file.

Order is mandatory: rename first, then compress.

### 4. Report

Brief summary:

- rename: each `old → new` (and skips);
- compress: size before/after for each file; confirm every result is strictly
  below `5 MB`, or list any that are still larger.

## Expected user phrases

- `/ready-photo`
- `Подготовь фото`
- `Подготовь фото для отправки`
- `@case/request/photos/` with a prepare-photos request

## Safety rules

- Do not rename or compress files outside the case (or outside the path the user
  named) unless the user explicitly asks.
- Do not edit `request.md` or other case text.
- Do not invent naming or codec rules — only follow `rename-photo` and
  `compress-photo`.
- Do not commit unless the user says `/save` or «Сохранись».
