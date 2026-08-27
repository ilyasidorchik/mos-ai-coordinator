---
name: telegram
description: >-
  Publishes a response-result photo and caption to the Telegram channel via
  Upload-Post MCP. Use when the user mentions /telegram, «отправь в Telegram»,
  «поделись ответом в канал», or asks to post a case response photo to Telegram.
disable-model-invocation: true
---

# Telegram (post response result)

## Overview

By **explicit** command only: post to the Telegram channel (Upload-Post profile
`mos-ai-coordinator`) a result photo from `<case>/response/photos/` with a short
caption (outcome + district/address + coordinates).

Do **not** run from `/inbox` or other skills unless the user asks for `/telegram`.

Do **not** wait for a caption draft «ок» — build the caption and publish
immediately. Do **not** set `requestSmartModeApproval` / do not pause for
manual MCP or network confirmation: this repo’s
[`.cursor/permissions.json`](../../permissions.json) allowlists the
Upload-Post publish tools and steers Auto-review for the staging `curl` PUT.

## Expected user phrases

- `/telegram`
- `/telegram` + `@…/response` or a case path
- «Отправь в Telegram»
- «Поделись ответом в канал»

## Workflow

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

### 3. Pick photos

- Prefer JPEGs whose names contain `-result` before the extension
  (e.g. `…-result.jpg`, `…-result1.jpg`, `…-result2.jpg`) — same convention as
  [`extract-response-photos`](../extract-response-photos/SKILL.md).
- Sort lexicographically.
- One file → one photo; several → all in one `upload_photos` call (carousel).
- If none — **stop**, say so, do **not** post text-only.

### 4. Build caption

Three blocks separated by a blank line:

```text
<итог>

<округ>, <адрес>
<координаты>
```

#### 4.1 Outcome (`итог`)

One short phrase from `response.md`: what was done / what the agency answered.
Infostyle, no bureaucracy, no sarcasm. Apply typography like [`typograf`](../typograf/SKILL.md)
(nbsp where appropriate).

Example: `Поменяли решётку на безопасную`

#### 4.2 District + address

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

`ВАО, 16-я Парковая ул., д. 18`

#### 4.3 Coordinates

From `request.md` lines like `Координаты…: 55.802714, 37.830194` — keep the
numbers as written: plain `lat, lon`.

Do **not** add maps URLs, Markdown `[text](url)`, or HTML links — Upload-Post
sends captions as plain text without `parse_mode`, and we post coordinates only.

If there are no coordinates — omit this block; post outcome + district/address
only.

**Etalon:**

```text
Поменяли решётку на безопасную

ВАО, 16-я Парковая ул., д. 18
55.802714, 37.830194
```

### 5. Publish via Upload-Post MCP (`user-upload-post`)

The hosted MCP **cannot** read local disk paths. For each photo:

1. `create_media_upload` — `filename`, `contentType` (`image/jpeg`),
   `contentLength` (bytes on disk), `mediaType`: `image`.
2. `PUT` the file bytes to the returned `upload_url` with header
   `Content-Type: image/jpeg` (e.g. `curl --data-binary @path`).
3. `complete_media_upload` with `uploadId` → get `media_url`.
4. After all photos are staged, call `upload_photos`:

| Field | Value |
| --- | --- |
| `user` | `mos-ai-coordinator` |
| `platforms` | `["telegram"]` |
| `title` | full caption from step 4 |
| `photosPathsOrUrls` | list of `media_url` values |
| `asyncUpload` | `false` |

If MCP is missing / not authenticated — stop and say so; do not fake a post.

### 6. Report

Briefly: posted caption (or paraphrase), photo count, `post_id` / success from
the MCP result.

## Safety rules

- Do not post without an explicit user command for this skill.
- Do not invent coordinates, address, district label, or photos.
- Do not add maps URLs or other links to the caption.
- Do not post text without at least one result photo.
- Do not commit or push.
- Do not change `inbox/`, `statistics.md`, or case files as part of this skill.
