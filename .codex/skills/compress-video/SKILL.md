---
name: compress-video
description: >-
  Trims and compresses a single appeal video to 720p under the mos.ru 5 MB
  attachment limit (ffmpeg, H.264/AAC, MP4). Use when the user asks to compress
  or trim a video for mos.ru, mentions /compress-video, «Сожми видео»,
  «Обрежь видео», «видео в лимит 5 МБ», or points to a .mov/.mp4 in
  request/photos/ that exceeds 5 MB.
disable-model-invocation: true
---

# Compress Video

## Overview

Prepare **one** video for mos.ru submission:

1. Optionally **trim** to the informative segments (drop redundant middle).
2. Scale to **720p**, encode H.264 + AAC mono, write **`.mp4`**.
3. Retry with stronger settings until the result is **strictly under 5 MB**.
4. Replace the original (delete `.mov`/other when converting to `.mp4`).

Typical paths: `request/photos/` inside a case folder.

## Rules

Каждое отдельное вложение на mos.ru должно быть меньше 5 МБ.

- Preserve the basename (`topic_YYYY-MM-DD_HH-MM`); only change extension to `.mp4` when needed.
- Do not create `-compressed` sidecars.
- Prefer keeping evidence that identifies the place (station sign, address plate) **and** the defect (leak, damage).
- Do not invent trim ranges: sample frames first, then pass `--keep`.

## Workflow

### 1. Resolve the target

- Prefer the path the user gave (`@`-mention or explicit file).
- Supported: `.mov`, `.mp4`, `.m4v`, `.webm`, `.mkv`, `.avi` (any case).
- One file per run. If several videos — run once each or ask.
- If already `< 5 MB` and 720p (or smaller) and the user only asked to fit the limit — report and skip, unless they asked to trim.

### 2. Decide trim (when needed)

If the video is long, repetitive, or still too large after a full-length 720p encode:

1. Extract sample frames (e.g. 1 frame every 2–3 s) with ffmpeg.
2. Inspect them (Read tool) and choose keep ranges that show the problem and any location marker.
3. Pass ranges to the script as `--keep START-END[,START-END...]` (open end: `13.5-`).

If the user already specified what to keep — use that; do not re-trim without reason.

### 3. Run compression

From the repo root:

```bash
.codex/skills/compress-video/scripts/compress-video.sh "path/to/video.mov"
```

With trim:

```bash
.codex/skills/compress-video/scripts/compress-video.sh \
  --keep 0.5-8.0,13.5- \
  "path/to/video.mov"
```

Optional flags: `--height 720` (default), `--max-mb 5` (default).

Requires `ffmpeg` / `ffprobe` (`brew install ffmpeg` if missing).

The script retries a stronger CRF / bitrate ladder until `< 5 MB`, or exits non-zero if it cannot.

### 4. Report

- `old → new` path (and that the original was removed, if so)
- size before / after; duration before / after if trimmed
- `--keep` ranges used (or «full length»)
- explicit confirmation: under 5 MB **yes/no**

## Expected user phrases

- `/compress-video`
- `Сожми видео`
- `Обрежь и сожми видео до 720p`
- `Видео в лимит 5 МБ`
- `@case/request/photos/file.mov` with a compress/trim request

## Safety rules

- Do not compress files outside the case (or outside the path the user named) unless the user explicitly asks.
- Do not edit `request.md` unless filenames mentioned there break after rename/extension change — then update only those names.
- Do not commit unless the user says `/save` or «Сохранись».
