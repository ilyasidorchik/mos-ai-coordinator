---
name: telegram
description: >-
  Publishes a response-result photo and caption to the Telegram channel via the
  local send.mjs script (Telegram Bot API). Use when the user mentions /telegram,
  «отправь в Telegram», «поделись ответом в канал», or asks to post a case
  response photo to Telegram.
disable-model-invocation: true
---

# Telegram (post response result)

## Overview

By **explicit** command only: post to the user's Telegram channel a result photo
from `<case>/response/photos/` with a short HTML caption (outcome +
district/address + coordinates).

Publishing goes through [`scripts/send.mjs`](scripts/send.mjs) — a zero-dependency
Node script calling the Telegram Bot API. It works the same locally and in Cloud
Agents (phone / web).

Do **not** run from `/inbox` or other skills unless the user asks for `/telegram`.

Do **not** wait for a caption draft «ок» — build the caption and publish
immediately. Do **not** pause for manual confirmation: this repo’s
[`.cursor/permissions.json`](../../../.cursor/permissions.json) allows running
the script for this skill.

## Expected user phrases

- `/telegram`
- `/telegram` + `@…/response` or a case path
- «Отправь в Telegram»
- «Поделись ответом в канал»

## Workflow

### 0. Config

The script reads credentials itself:

| Key | Where |
| --- | --- |
| `TELEGRAM_BOT_TOKEN` | `.env` locally; Runtime Secret in Cloud Agents |
| `TELEGRAM_CHAT_ID` | same |
| `TELEGRAM_CHANNEL_USERNAME` | same (used to build the post link) |

`process.env` wins over `.env`, so on mobile / web the secrets from
cursor.com → Cloud Agents → Secrets are used automatically.

Do **not** read, echo, or pass the token yourself. If the script exits with
`TELEGRAM_BOT_TOKEN is not set` — stop and tell the user to fill
[`.env`](../../../.env) (copy from [`.env.example`](../../../.env.example)) or add
the secrets in the dashboard.

### 1. Resolve the case

1. Explicit `@…/response`, `@…/` case path, or path in the message.
2. Else — open file / folder in the IDE that belongs to a case.
3. Else — ask for the path; do **not** guess.

Resolve to the case folder that contains `response/` (and sibling `request/`).
For series (`attempt-N` / dated folders), use that iteration’s folders.

### 2. Read sources

- `response/response.md` — outcome for the headline
- `request/request.md` — address, coordinates
- District code — first path segment under the repo root (`VAO`, `SVAO`, …)
- `response/photos/` — result JPEGs

### 3. Pick photo

- Prefer JPEGs whose names contain `-result` before the extension
  (e.g. `…-result.jpg`, `…-result1.jpg`, `…-result2.jpg`) — same convention as
  [`extract-response-photos`](../extract-response-photos/SKILL.md).
- Sort lexicographically and post **one** photo: the first after sorting.
- If none — **stop**, say so, do **not** post text-only.

### 4. Build caption (Telegram HTML)

Three blocks separated by a blank line, sent with `parse_mode: HTML`:

```text
<итог>

<округ>, <адрес>
<координаты>
```

#### 4.1 HTML escaping and allowed tags

Escape plain text: `&` → `&amp;`, `<` → `&lt;`, `>` → `&gt;` **outside** tags.

Allowed tags (use sparingly): `<b>`, `<i>`, `<code>`, `<blockquote>`,
`<a href="…">…</a>`.

Example with quote and link:

```html
ЦОДД ответил про правила на велокольце. К сожалению, кратко:
<blockquote>Согласно п. 13.1 ПДД РФ …</blockquote>
— полный текст <a href="https://github.com/…">на Гитхабе</a>
```

For the default `/telegram` result caption, plain text (after escaping) is
enough; add HTML only when the outcome needs emphasis, a quote, or a link.

#### 4.2 Outcome (`итог`)

One short phrase from `response.md`: what was done / what the agency answered.
Infostyle, no bureaucracy, no sarcasm. Apply typography like [`typograf`](../typograf/SKILL.md)
(nbsp where appropriate), then escape for HTML.

Example: `Поменяли решётку на безопасную`

#### 4.3 District + address

Map folder code → Cyrillic abbreviation:

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

Unknown code — use the folder name as-is; do not invent a Cyrillic form.

Address from `request.md` / `response.md` (street, house). Join with a comma:

`ВАО, 16-я Парковая ул., д. 18`

#### 4.4 Coordinates

From `request.md` lines like `Координаты…: 55.802714, 37.830194` — keep the
numbers as written: plain `lat, lon`.

Do **not** add maps URLs to the default caption. Inline `<a href>` links are
allowed when the user asks for a GitHub / docs link in the post.

If there are no coordinates — omit this block; post outcome + district/address
only.

**Etalon:**

```text
Поменяли решётку на безопасную

ВАО, 16-я Парковая ул., д. 18
55.802714, 37.830194
```

### 5. Publish

Run the script from the repo root, passing the caption on stdin so multi-line
HTML needs no shell escaping:

```bash
printf '%s' "$CAPTION" | node .codex/skills/telegram/scripts/send.mjs \
  --photo /abs/path/to/…-result.jpg \
  --caption-file -
```

The photo path must be absolute and inside the repository. For a text-only post
(when the user explicitly asks for one) use `--text-file -` instead of
`--photo` / `--caption-file`.

The script prints JSON to stdout:

```json
{ "message_id": 21, "chat_id": -1001234567890, "link": "https://t.me/<channel>/21" }
```

A non-zero exit means nothing was posted — report the stderr message (e.g.
`Telegram API error: can't parse entities: …` means the HTML is malformed; fix
the caption and retry). Do not fake a post.

### 6. Report

After a successful publish, reply briefly with:

1. What was posted (caption paraphrase / that one photo was sent).
2. **Post link** — mandatory, from `link` in the JSON output. If `link` is null
   (no `TELEGRAM_CHANNEL_USERNAME`), report `message_id` and say the link cannot
   be built.

## Safety rules

- Do not post without an explicit user command for this skill.
- Do not invent coordinates, address, district label, or photos.
- Do not read or print the bot token; let the script load it.
- Do not post text without at least one result photo.
- Do not commit or push.
- Do not change `inbox/`, `statistics.md`, or case files as part of this skill.
- Do not commit `.env`.
