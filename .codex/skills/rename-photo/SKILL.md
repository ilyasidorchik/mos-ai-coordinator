---
name: rename-photo
description: >-
  Renames appeal photos to the project naming convention:
  topic_YYYY-MM-DD_HH-MM[.ext] with collision suffixes; map screenshots
  (map / yandex-maps / google-maps) become topic_{token} without reading
  metadata. Use when the user asks to rename photos, mentions /rename-photo,
  «Переименуй фото», or «Приведи имена фото к формату».
disable-model-invocation: true
---

# Rename Photo

## Overview

Rename one photo or every image in a case `request/photos/` folder to the
project naming convention. Do not compress files (use `compress-photo` for that).

Typical paths: `request/photos/` inside a case folder.

## Canon

Photos (with capture time):

```text
{topic}_{YYYY-MM-DD}_{HH-MM}[_{n}].{ext}
```

Map screenshots (no date):

```text
{topic}_{map-token}[_{n}].{ext}
```

- `topic` — short Latin kebab-case label (e.g. `otradnoye-zebra`, `zebra-zapovednaya`)
- Date and time — when the photo was taken (ordinary photos only)
- Time uses a hyphen (`18-03`), never a colon (`18:03`)
- `map-token` — from the source basename: `map`, `yandex-maps`, or `google-maps`
- Same moment or same map-token, several files — add `_2`, `_3`, … before the extension
- Extension — keep the real type; write it in lower-case (`.jpeg`, `.jpg`, `.png`)

Examples:

- `otradnoye-zebra_2026-02-10_18-03.jpeg`
- `otradnoye-zebra_2026-02-10_18-03_2.jpeg`
- `anokhina-66-bus-stuck_2025-09-12_17-40.jpeg`
- `mirax-park-anokhina-entrance_yandex-maps.jpeg`

## Workflow

### 1. Resolve the target

- Prefer the path the user gave (`@`-mention, file, or `photos/` directory).
- If only a case is open/mentioned, use that case’s `request/photos/` (or
  `attempt-N/request/photos/` when working on a series iteration).
- Supported images: `.jpg`, `.jpeg`, `.png`, `.webp`, `.heic` (and upper-case variants).
- If nothing resolvable — ask once and stop.

### 2. Choose `topic`

1. Explicit topic from the user, if given.
2. Else derive from the case folder name (last path segment before `request/` /
   `attempt-N/`), optionally prefixed for clarity (e.g. `zebra-` for crossings)
   when neighbouring files in the same folder already use a shared prefix — match that.
3. Latin, lower-case, kebab-case. No spaces.

If the topic is ambiguous — ask once.

### 3. Detect map screenshots

For each file, look at the basename without extension (case-insensitive).

If it is exactly `map`, `yandex-maps`, or `google-maps`:

- Do **not** read EXIF, birth time, or mtime.
- Target name: `{topic}_{map-token}.{ext}` where `map-token` is that stem in
  lower-case (`map` / `yandex-maps` / `google-maps`) and `ext` is lower-case.
- If the name already matches this canon for the topic (and optional `_n`
  suffix), skip.
- On collision with an existing different file, append `_2`, `_3`, … until free.
- In the report, note the name source as `map-token`.

Skip step 4 for these files; go to rename (step 5).

### 4. Read date and time

For non-map files, in order:

1. EXIF `DateTimeOriginal`, then `CreateDate` (via `exiftool` if available, else
   macOS `mdls` / equivalent).
2. If EXIF is missing — file birth time, then mtime.

Format as `YYYY-MM-DD_HH-MM`. Note the source (`EXIF` / `birth` / `mtime`) in the report.

### 5. Rename in place

Build the target name and `mv` within the same directory.

- If the name already matches the applicable canon for this topic (timestamp or
  map-token, and optional suffix), skip.
- On collision with an existing different file, append `_2`, `_3`, … until free.
  The first file at a given timestamp or map-token keeps no numeric suffix; the
  next ones start at `_2`.
- Do not create copies; only rename.
- Do not change pixels, EXIF, or file contents.

### 6. Report

List each change as `old → new` and the name source (`EXIF` / `birth` /
`mtime` / `map-token`). Mention skips briefly.

## Expected user phrases

- `/rename-photo`
- `Переименуй фото`
- `Приведи имена фото к формату`
- `@case/request/photos/` with a rename request

## Safety rules

- Do not rename files outside the case (or outside the path the user named)
  unless the user explicitly asks.
- Do not compress or re-encode images.
- Do not edit `request.md` or other case text.
- Do not mass-rename historical cases unless the user points at them.
- Do not commit unless the user says `/save` or «Сохранись».
