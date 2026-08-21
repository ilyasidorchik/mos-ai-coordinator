---
name: extract-response-photos
description: >-
  Extracts photo attachments from an agency response PDF into response/photos/,
  cropping white page margins and registration footer stamps. Use when the
  response mentions «фотоматериалы прилагаются», when /inbox or /mail-inbox
  finds attached photos, or when the user asks to extract photos from a
  response PDF.
disable-model-invocation: true
---

# Extract Response Photos

## Overview

Pull large photo images out of an official response PDF in a case `response/`
directory, crop empty white frames and the bottom registration stamp, and save
JPEGs under `response/photos/`.

Typical trigger phrases in `response.md` / PDF body:

- `фотоматериалы прилагаются` / `фотоматериал прилагается`
- `фото прилага…`
- fallback: large image (width≥400) on a page after the first **and** text
  contains `Приложение:` or `фото`

## Workflow

1. Resolve the PDF.

- Prefer the path the user or `/inbox` just moved into `<case>/response/`.
- If only a case is known, use the PDF in that case’s `response/` (ask if several).

2. Run the script from the repo root:

```bash
python3 .codex/skills/extract-response-photos/scripts/extract-response-photos.py \
  "<case>/response/<file>.pdf"
```

Optional: `--out-dir /tmp/...` for smoke tests (does not touch case photos).

3. Report saved paths (or that no large images were found).

## Output naming

```text
{case-folder}-result.jpg
{case-folder}-result1.jpg
{case-folder}-result2.jpg
```

- One photo → `{case}-result.jpg`
- Several → `{case}-result1.jpg`, `{case}-result2.jpg`, …
- On name collision, append `-2`, `-3`, … before `.jpg`
- Do not overwrite existing files

## Cropping (adaptive)

Do not use fixed pixel margins. The script:

1. Extracts embedded images via PyMuPDF (not a page screenshot).
2. Trims white columns on left/right (thin edge or letterbox).
3. Trims achromatic near-white rows on top (keeps blue sky / lamp flares).
4. Trims the bottom registration band using dark text in the **left half** of
   the bottom ~100 px (avoids mistaking asphalt shadows for a footer).

## Dependencies

Needs `pymupdf` and `Pillow`. If missing — report clearly; do not fail the rest
of `/inbox` silently. Install or skip photo extraction for that PDF only.

## Safety Rules

- Only process PDFs inside a `response/` directory (or an explicit `--out-dir`
  smoke test).
- Do not delete or overwrite existing photos in `response/photos/`.
- Do not invent photos when the PDF has none.
- Do not commit or push; leave that to the inbox Apply hook.

## Expected User Phrases

- «достань фото из PDF ответа»
- «фотоматериалы прилагаются» in a response being processed by `/inbox`
- `/mail-inbox` / `/inbox` after a response with photo attachments
