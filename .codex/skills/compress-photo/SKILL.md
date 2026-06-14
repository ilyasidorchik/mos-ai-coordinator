---
name: compress-photo
description: >-
  Compresses a single photo for mos.ru submission using Squoosh CLI with
  project codecs and quality settings. Use when the user asks to compress a
  photo, mentions Squoosh, MozJPEG, «Сожми фото», «Уменьши размер фото» or points to a specific image file to shrink.
disable-model-invocation: true
---

# Compress Photo

## Overview

Compress **one** photo file the user points to. Replace the original in place and keep the filename unchanged.

Typical paths: `request/photos/` inside a case folder.

## Rules

Каждое отдельное фото должно быть меньше 5 МБ, иначе электронная приёмная его не примет.

При работе с фото:
- при сжатии сохранять понятные имена файлов;
- при сжатии заменять исходные файлы;
- если пользователь просит подготовить фото для отправки, лучше уменьшать размер без потери читаемости деталей.

Для сжатия используется в формате CLI [Squoosh](https://squoosh.app/) от разработчиков браузера Google Chrome.

Для файлов JPEG используется кодек `MozJPEG`, для PNG — `Browser PNG`, параметр `quality` — 75.

## Workflow

1. Resolve the target file.

- Use the path the user gave (`@`-mention or explicit path).
- If the path is missing or not an image, report and stop.
- Process **one file per run**. For several files, run the skill once per file or ask whether to batch.

2. Run compression.

From the repo root:

```bash
.codex/skills/compress-photo/scripts/compress-photo.sh "path/to/photo.jpeg"
```

Request full permissions if sandbox blocks file writes, network (first `npx` run), or Node download.

3. Report the result.

- Show size before and after (bytes or KB/MB).
- Confirm the file is under 5 MB.
- If still ≥ 5 MB after compression, tell the user and suggest a lower quality or resize — do not silently stop.

## Codec mapping in CLI

| Format | Squoosh CLI flag | Config |
|--------|------------------|--------|
| `.jpg`, `.jpeg` | `--mozjpeg` | `{"quality":75}` |
| `.png` | `--oxipng` | `{"quality":75}` |

`@squoosh/cli` does not expose a separate «Browser PNG» encoder; use `--oxipng` with the same quality value.

## Node.js requirement

`@squoosh/cli` fails on Node 20+ (WASM load error). The script downloads Node 16 to `/tmp` when needed and runs `npx` through it. Do not switch to another compressor unless the script fails and the user agrees.

## Expected user phrases

- `Сожми это фото`
- `Compress this photo with Squoosh`
- `Подготовь фото для отправки`
- `@case/request/photos/file.jpeg` with a compression request

## Safety rules

- Do not rename the file during compression.
- Do not create sidecar copies with `-compressed` suffixes; replace the original.
- Do not compress files outside the repo unless the user explicitly asks.
