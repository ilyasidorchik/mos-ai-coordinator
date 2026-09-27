---
name: telegram
description: >-
  Publishes a ready caption and photo(s) to the Telegram channel via the local
  send.mjs script (Telegram Bot API). Use when the user mentions /telegram,
  «напиши в тг», «отправь в Telegram», or asks to post a supplied caption/photo
  to Telegram. For composing a response report (PDF screenshots, grate result,
  GitHub footer) use /telegram-report instead.
disable-model-invocation: true
---

# Telegram

## Overview

By **explicit** command only: post to the user's Telegram channel via
[`scripts/send.mjs`](scripts/send.mjs) (Bot API; works locally and in Cloud
Agents).

This skill is **transport only**: it sends a caption and photo path(s) the
caller already prepared. It does **not** typograf text and does **not** build
the default «итог / адрес / координаты» caption — that lives in
[`telegram-report`](../telegram-report/SKILL.md).

Allowed callers:

1. The user asks for `/telegram` (or «напиши в тг») with a caption and/or photo.
2. [`/telegram-report`](../telegram-report/SKILL.md) after it assembled the post.

Do **not** run from `/inbox` or other skills unless the user asked for
`/telegram` or `/telegram-report`.

Do **not** wait for a caption draft «ок» — publish immediately. Do **not** pause
for manual confirmation: this repo’s
[`.cursor/permissions.json`](../../../.cursor/permissions.json) allows running
the script for this skill.

## Expected user phrases

- `/telegram`
- `/telegram` + photo `@…` and/or pasted caption
- «Напиши в тг» / «Отправь в Telegram» with ready text
- Invoked as the publish step of `/telegram-report`

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

### 1. Resolve caption and photos

**Caption**

- Prefer the exact text the user (or `/telegram-report`) already gave.
- **Do not rewrite** user-supplied wording.
- **Do not** run typograf here — the caller (`/telegram-report` or the user
  after `/typograf`) is responsible for typography.
- Allowed here: HTML escape of plain text (§2); wrap words in `<a href>` only
  when the user named which words to link (resolve URLs via
  [`github-link`](../github-link/SKILL.md)).

If there is **no** caption and **no** instruction to compose one via
`/telegram-report` — stop and ask; do not invent an outcome/address template.

**Photos**

- Use absolute paths inside the repository that the user `@` / named, or that
  `/telegram-report` prepared.
- One photo → `sendPhoto`. Several → album (`sendMediaGroup`); caption goes on
  the **first** photo only (Telegram limit 1024).
- Text-only only when the user explicitly asks for it (`--text-file`).

### 2. HTML escaping and allowed tags

Escape plain text: `&` → `&amp;`, `<` → `&lt;`, `>` → `&gt;` **outside** tags.

Allowed tags (use sparingly): `<b>`, `<i>`, `<code>`, `<blockquote>`,
`<a href="…">…</a>`.

If the caller already passed ready HTML (e.g. from `/telegram-report`), do not
double-escape tags — only escape leftover plain fragments if you still need to
add links.

### 3. Publish

From the repo root, pass the caption on stdin:

**One photo:**

```bash
printf '%s' "$CAPTION" | node .codex/skills/telegram/scripts/send.mjs \
  --photo /abs/path/to/photo.jpg \
  --caption-file -
```

**Album (several photos):**

```bash
printf '%s' "$CAPTION" | node .codex/skills/telegram/scripts/send.mjs \
  --photo /abs/path/to/page-1.png \
  --photo /abs/path/to/page-2.png \
  --caption-file -
```

**Text-only** (only if the user asked):

```bash
printf '%s' "$CAPTION" | node .codex/skills/telegram/scripts/send.mjs \
  --text-file -
```

The script prints JSON to stdout:

```json
{ "message_id": 21, "chat_id": -1001234567890, "link": "https://t.me/<channel>/21" }
```

For an album, `message_id` / `link` refer to the **first** message in the group.

A non-zero exit means nothing was posted — report the stderr message (e.g.
`Telegram API error: can't parse entities: …` means the HTML is malformed; fix
the caption and retry). Do not fake a post.

### 4. Report

After a successful publish, reply briefly with:

1. What was posted (caption paraphrase / how many photos).
2. **Post link** — mandatory, from `link` in the JSON output. If `link` is null
   (no `TELEGRAM_CHANNEL_USERNAME`), report `message_id` and say the link cannot
   be built.

## Safety rules

- Do not post without an explicit user command for `/telegram` or a call from
  `/telegram-report`.
- Do not invent caption text, coordinates, address, or photos.
- Do not invent or pad caption text when the user already gave the wording.
- Do not typograf here.
- Do not read or print the bot token; let the script load it.
- Do not post text without a photo unless the user asked for text-only.
- Do not commit or push.
- Do not change `inbox/`, `statistics.md`, or case files as part of this skill.
- Do not commit `.env`.
