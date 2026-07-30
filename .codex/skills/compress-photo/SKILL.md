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

Compress **one** photo file the user points to for mos.ru submission.

Typical paths: `request/photos/` inside a case folder.

## Rules

Каждое отдельное фото должно быть меньше 5 МБ, иначе электронная приёмная его не примет.

При работе с фото:
- при сжатии сохранять понятные имена файлов;
- при сжатии заменять исходные файлы, кроме случая, когда пользователь одобрил конвертацию PNG в JPG;
- если пользователь просит подготовить фото для отправки, лучше уменьшать размер без потери читаемости деталей.

Для сжатия используется в формате CLI [Squoosh](https://squoosh.app/) от разработчиков браузера Google Chrome.

Для файлов JPEG используется кодек `MozJPEG`, для PNG по умолчанию — `Browser PNG` / `oxipng`, стартовое значение `quality` — 75.

## Workflow

1. Resolve the target file.

- Use the path the user gave (`@`-mention or explicit path).
- If the path is missing or not an image, report and stop.
- Process **one file per run**. For several files, run the skill once per file or ask whether to batch.
- If the file is `.png`, inspect its size first. If it is likely that PNG compression alone may not get below `5 MB`, ask the user with `AskQuestion` whether conversion to `.jpg` is acceptable for better compression. Explain that JPEG will usually shrink maps and screenshots much more aggressively, but will produce a new `.jpg` file instead of keeping the `.png`.

2. Run compression.

From the repo root:

```bash
.codex/skills/compress-photo/scripts/compress-photo.sh "path/to/photo.jpeg"
```

If the user approved PNG-to-JPG conversion, call:

```bash
.codex/skills/compress-photo/scripts/compress-photo.sh --png-to-jpg "path/to/photo.png"
```

Request full permissions if sandbox blocks file writes, network (first `npx` run), or Node download.

The script must keep retrying with slightly stronger compression until the result is strictly below `5 MB`, or fail only after exhausting its retry ladder.

3. Report the result.

- Always report the exact output path.
- Show size before and after (bytes or KB/MB).
- Explicitly confirm whether the result is strictly below `5 MB`.
- If the script still cannot get below `5 MB`, tell the user that clearly and suggest stronger compression or resize — do not silently stop.

## Codec mapping in CLI

| Format | Squoosh CLI flag | Config |
|--------|------------------|--------|
| `.jpg`, `.jpeg` | `--mozjpeg` | `{"quality":75}` |
| `.png` | `--oxipng` | `{"quality":75}` |
| `.png` with approved conversion | `--mozjpeg` | `{"quality":75}` |

`@squoosh/cli` does not expose a separate «Browser PNG» encoder; use `--oxipng` with the same quality value.

## Node.js requirement

`@squoosh/cli` fails on Node 20+ (WASM load error). The script downloads Node 16 to `/tmp` when needed and invokes the bundled npm/npx entrypoint explicitly. Do not switch to another compressor unless the script fails and the user agrees.

## Expected user phrases

- `Сожми это фото`
- `Compress this photo with Squoosh`
- `Подготовь фото для отправки`
- `Можно ли PNG перевести в JPG?`
- `@case/request/photos/file.jpeg` with a compression request

## Safety rules

- Do not create sidecar copies with `-compressed` suffixes.
- For regular JPEG/PNG compression, replace the original file in place.
- For approved PNG-to-JPG conversion, write the result as the same basename with a `.jpg` extension and report that path explicitly.
- Do not compress files outside the repo unless the user explicitly asks.
