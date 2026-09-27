---
name: telegram-report
description: >-
  Composes and publishes a Telegram channel report about an agency response:
  PDF page screenshots (or grate result photos), a short human caption,
  typograf, and GitHub footer links «Обращение — ответ». Use when the user
  mentions /telegram-report, «поделись ответом в канал», «скинь ответ в
  телеграм со скринами», «отчет об ответе в Telegram», «telegram report»,
  «выложи ответ ведомства в канал», «поделись результатом по решётке», or
  «скинь в тг что поменяли решётку».
---

# Telegram report

## Overview

Build a channel post about a case response and publish it via
[`telegram`](../telegram/SKILL.md) (`send.mjs`). Do **not** wait for a draft
«ок» — publish immediately.

One post frame always:

```text
<main>

Обращение — ответ
```

Only `<main>` and which photos to attach change. The footer is always GitHub
links on those two words (via [`github-link`](../github-link/SKILL.md)).

Typography is this skill’s job (stdin
[`typograf`](../typograf/SKILL.md)) — **before** HTML tags. `/telegram` only
sends.

## Expected user phrases

- `/telegram-report`
- `/telegram-report` + `@…/response` or a case path
- «Поделись ответом в канал / в тг»
- «Скинь ответ в телеграм со скринами»
- «Отчет об ответе в Telegram» / «telegram report»
- «Выложи ответ ведомства в канал»
- «Поделись результатом по решётке» / «скинь в тг что поменяли решётку»

## Workflow

### 1. Resolve the case

1. Explicit `@…/response`, `@…/` case path, or path in the message.
2. Else — open file / folder in the IDE that belongs to a case.
3. Else — ask for the path; do **not** guess.

Use the folder that contains `response/` (and sibling `request/`). For series
(`attempt-N` / dated folders), use that iteration.

### 2. Detect grate case

**Grate** if at least one of:

- path contains `bike-friendly-drain-grates`;
- already-read `request/request.md` has markers such as `дождеприёмн` /
  `дождеприемн`, `решётк` / `решетк` in a storm-drain / ГОСТ 33150 context.

Otherwise → ordinary response. Do not run a separate analysis pass — use the
same `request.md` you open for the caption.

### 3. Build `<main>`

#### Grate

Short outcome + district/address + coordinates (from current
`response/response.md` and `request/request.md`). Infostyle, no bureaucracy, no
sarcasm. Do not invent facts.

District code = first path segment under the repo root:

| Code | Caption |
| --- | --- |
| `VAO` | `ВАО` |
| `SVAO` | `СВАО` |
| `ZAO` | `ЗАО` |
| `UVAO` | `ЮВАО` |
| `SAO` | `САО` |
| `YuAO` / `YUAO` | `ЮАО` |
| `CAO` | `ЦАО` |
| `SZAO` | `СЗАО` |
| `YuZAO` / `YUZAO` | `ЮЗАО` |
| `TiNAO` / `TINAO` | `ТиНАО` |
| `ZelAO` / `ZELAO` | `ЗелАО` |

Unknown code — use the folder name as-is.

Etalon:

```text
Поменяли решётку на безопасную для вело

ВАО, 16-я Парковая ул., д. 18
55.802714, 37.830194
```

Coordinates from lines like `Координаты…: 55.802714, 37.830194` — keep numbers
as written. If none — omit the coordinates line.

#### Ordinary response

Lead (who answered + about what) + short humanized facts in `<blockquote>`.

Rules:

- Simple language, short; not verbatim bureaucratese.
- Only facts from `response.md` / PDF — do not invent or pad.
- Optional plain-language gloss in parentheses (e.g. «гармошек»).
- No sarcasm.

Etalon:

```html
Дептранс ответил про автобус 124 в СВАО:

<blockquote>На маршруте 10 автобусов особо большого класса («гармошек»).
Интервал в час пик: утром 11–12 мин, вечером 11–14 мин.</blockquote>
```

(Assemble as plain text first; wrap `<blockquote>` only after typograf.)

### 4. Photos

#### Grate

Only photo attachments from the response PDF — **not** the first text page of
the letter.

- Prefer existing `response/photos/` files whose names contain `-result` before
  the extension; sort lexicographically; send **all** of them as an album (or
  one photo if only one).
- If none — run
  [`extract-response-photos`](../extract-response-photos/SKILL.md) on the PDF
  in `response/`, then use the new files.
- Do **not** `qlmanage` text pages for grate posts.
- If still no photos — **stop**, do not post text-only.

#### Ordinary

Screenshots of **every** PDF page:

1. Locate the PDF in `response/` (one file — use it; several — ask; none — stop).
2. Render:

```bash
mkdir -p response/_pdf_pages
qlmanage -t -s 2000 -o response/_pdf_pages "response/file.pdf"
```

3. Sort page images in reading order; send all as an album.
4. After a successful post — `rm -rf response/_pdf_pages`. Do not commit that
   folder.

### 5. Footer links

Build blob URLs with [`github-link`](../github-link/SKILL.md):

- `Обращение` → `request/request.md`
- `ответ` → `response/response.md` (if missing — the response PDF)

Plain footer before typograf: `Обращение — ответ` (regular spaces/dash; typograf
will insert NBSP before the em dash).

### 6. Typograf → HTML → publish

1. Concatenate plain `<main>` and plain footer with a blank line between.
2. Pipe through typograf **before** any HTML tags:

```bash
printf '%s' "$PLAIN_CAPTION" | .codex/skills/typograf/scripts/typograf.sh -
```

3. HTML-escape plain text (`&`, `<`, `>` outside tags).
4. Wrap blockquote body (ordinary mode) in `<blockquote>…</blockquote>`.
5. Wrap `Обращение` and `ответ` in `<a href="…">…</a>` (keep the typografed
   NBSP and em dash between them).
6. Caption limit: 1024 characters (Telegram).
7. Publish via [`telegram`](../telegram/SKILL.md) — pass ready HTML caption and
   absolute photo paths (one or more `--photo`). Do not typograf again there.

Example:

```bash
printf '%s' "$CAPTION" | node .codex/skills/telegram/scripts/send.mjs \
  --photo /abs/path/to/photo1.jpg \
  --photo /abs/path/to/photo2.jpg \
  --caption-file -
```

### 7. Report

After success, reply briefly with what was posted and the **post link** from
JSON `link` (mandatory). If `link` is null — report `message_id`.

## Safety rules

- Do not invent facts, numbers, addresses, coordinates, or photos.
- Do not copy bureaucratese verbatim into quotes; do not add meaning absent
  from the response.
- Do not typograf inside `/telegram` — only here (or via `/typograf` for files).
- Do not commit or push; do not leave `_pdf_pages/` after a successful ordinary
  post.
- Do not change `inbox/` or unrelated case files.
- Do not read or print the bot token.
