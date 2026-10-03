---
name: hide-pers-data
description: >-
  Hides personal data in an agency response PDF: redacts matches from PERSONAL_DATA
  in the text layer with opaque black boxes, verifies no leaks, and renders
  pages into response/_pdf_pages/. Use when the user mentions /hide-pers-data,
  «скрой персональные данные», «замажь персональные данные», «скрой ПДн»,
  «замажь моё имя», «закрась личные данные на скрине», or asks to redact PII
  on a response PDF / screenshot.
disable-model-invocation: true
---

# Hide personal data (`/hide-pers-data`)

## Overview

Take a PDF in a case `response/` directory, find personal-data strings from
repo-root `.env` (`PERSONAL_DATA`), cut them out of the PDF with black fill, check
that nothing remains, and write:

- `response/_pdf_pages/hidden.pdf` — redacted PDF (source PDF untouched);
- `response/_pdf_pages/page-NN.png` — page screenshots of the redacted PDF.

Do **not** print `PERSONAL_DATA` values or matched strings in chat or logs — only
hit counts.

## Expected user phrases

- `/hide-pers-data`
- `Скрой персональные данные`
- `Замажь персональные данные`
- `Скрой ПДн`
- `Замажь моё имя`
- `Закрась личные данные на скрине`
- `@…/response/*.pdf` with any of the above

## Workflow

### 1. Resolve the PDF

1. Explicit `@`-path or path in the message to a PDF under `response/`.
2. Else the focused / open response PDF for the case.
3. Else the only `*.pdf` in that case’s `response/` — if several, ask which
   one and stop.

### 2. Run the script

From the repo root:

```bash
python3 .codex/skills/hide-pers-data/scripts/hide-pers-data.py \
  "<case>/response/<file>.pdf"
```

Stdout JSON (example shape):

```json
{
  "pages": [1, 2],
  "hits_per_page": [4, 0],
  "out_dir": ".../response/_pdf_pages",
  "files": [".../hidden.pdf", ".../page-01.png", ".../page-02.png"]
}
```

Exit codes:

| Code | Meaning | Agent action |
| --- | --- | --- |
| 0 | OK | Continue to visual check |
| 1 | Missing PDF / `PERSONAL_DATA` / bad path | Stop and report |
| 3 | No text layer (scan) | Fallback below |
| 4 | Leak after redaction | Stop and report — do not publish images |

### 3. Visual check

Open each written `page-NN.png` with the Read tool. Confirm black boxes cover
name / email / greeting fragments and that no personal text peeks out. If a
sliver remains, fix with Pillow black rectangles on that PNG and re-check.

### 4. Fallback (exit code 3 — scan)

1. Render with `qlmanage` into `response/_pdf_pages/`.
2. Draw opaque black rectangles (Pillow) over visible personal fields.
3. Visually verify every page. Do not claim success without that check.

### 5. Report

Briefly: paths to `hidden.pdf` and `page-*.png`, and hit counts per page
(numbers only). Do not quote the redacted strings.

## `PERSONAL_DATA` config

Repo-root `.env` (gitignored), pipe-separated. A trailing `*` means prefix
(all case endings):

```text
PERSONAL_DATA=Фамилия*|Отчество*|Имя|…|email@example.com
```

Matching is case-insensitive; edge punctuation on PDF words is ignored.
Adjacent initials on the same line (`И.А.` next to a matched surname) are
redacted too. If `PERSONAL_DATA` is missing or empty, the script fails — never
redact silently with an empty list.

## Safety rules

- Only process PDFs inside a `response/` directory.
- Never modify or overwrite the source PDF.
- Treat `response/_pdf_pages/` as temporary; do not commit it.
- Never print `PERSONAL_DATA` values or matched personal strings.
- Do not invent redaction boxes when the script already succeeded and the
  visual check is clean.
