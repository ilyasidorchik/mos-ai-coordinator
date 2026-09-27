---
name: mail-inbox
description: >-
  Fetches agency response emails from Gmail via local fetch-mail.mjs (sedo@mos.ru
  originals and forwards), downloads PDF attachments into inbox/, marks messages
  processed, then runs the inbox skill. Use when the user mentions /mail-inbox,
  «Разбери почту», «Process the mail», or «Забери ответы из Gmail».
disable-model-invocation: true
---

# Mail Inbox

## Overview

Pull official response emails from Gmail into [`inbox/`](../../../inbox/), then
delegate routing, transcription, and photo extraction to [`inbox`](../inbox/SKILL.md):

1. Find SEDO response emails (originals and forwards) via
   [`scripts/fetch-mail.mjs`](scripts/fetch-mail.mjs).
2. Download each PDF into `inbox/`.
3. Mark the message read and move it to Gmail label `Mos Responses. Processed`.
4. Run the [`inbox`](../inbox/SKILL.md) skill on whatever was downloaded
   (match → move → pdf-to-text → extract attached photos when mentioned →
   statistics → save → report).

Do not duplicate inbox matching, `pdf-to-text`, or `extract-response-photos` — always delegate step 4.

## Config

The fetch script reads credentials itself (same pattern as `/telegram`):

| Key | Where |
| --- | --- |
| `GMAIL_CLIENT_ID` | `.env` locally; Runtime Secret in Cloud Agents |
| `GMAIL_CLIENT_SECRET` | same |
| `GMAIL_REFRESH_TOKEN` | same |
| `GMAIL_PROCESSED_LABEL` | optional; default `Mos Responses. Processed` |

`process.env` wins over `.env`, so on mobile / web the secrets from
cursor.com → Cloud Agents → Secrets are used automatically.

Do **not** read, echo, or pass tokens yourself.

If the script exits with `GMAIL_* is not set` — stop and tell the user to fill
[`.env`](../../../.env) (copy from [`.env.example`](../../../.env.example)) or add
the secrets in the dashboard. Fallback: drop PDFs into `inbox/` manually and run `/inbox`.

If the script exits with `invalid_grant` / expired refresh token — OAuth app is in
**Testing** (≈7-day tokens). Tell the user to run locally:

```bash
node .codex/skills/mail-inbox/scripts/auth.mjs
```

Then paste the new `GMAIL_REFRESH_TOKEN` into `.env` and Cloud Agents Secrets.
Do **not** open Gmail in the browser as a substitute, and do not ask for a password.

## Scope

Only citizen-appeal **response** emails (enforced inside the script):

- **Original:** `from` contains `sedo@mos.ru`, subject like «Ответ … на обращение гражданина».
- **Forward:** `from` is not SEDO, but subject matches `/^(Fwd|FW|Fw|Пересл|Пересылка):/i` and/or snippet mentions `sedo@mos.ru`, with the same subject pattern.

Download **only** `application/pdf` attachments. Skip ZIP «Документ с ЭП», `message/rfc822`, and other parts.

Also skip a PDF whose filename is exactly `Направлен.pdf` (case-sensitive basename). In SEDO forwards this is usually a second attachment — a duplicate scan of the same letter already inside the mos.ru export PDF.

Attachment basenames longer than **255 UTF-8 bytes** (ext4 limit) are truncated from the end of the stem; `.pdf` is kept.

## Workflow

### 0. Opening status

Before tool calls, tell the user in one short line (exact wording):

```text
Забираю ответы из Gmail по skill `/mail-inbox`: запускаю скрипт и ищу письма от Мос-ру
```

### 1. Run the script

Do **not** wait for confirmation. This repo’s
[`.cursor/permissions.json`](../../../.cursor/permissions.json) allows running the script.

```bash
node .codex/skills/mail-inbox/scripts/fetch-mail.mjs
```

Parse the JSON on stdout:

| Field | Meaning |
| --- | --- |
| `accepted` | SEDO emails (original / forward) the script classified |
| `downloaded` | PDF files written under `inbox/` (`file`, `bytes`) |
| `skipped` | exists / not_sedo / unsafe_name — do not dump in the user report |
| `label` | `{ name, id, created }` — `created: true` → mention «лейбл создан» only if useful |
| `errors` | per-message failures — continue; note in report only if something failed |
| `dryRun` | should be `false` for the real run |

- If the process exits non-zero and stdout has no useful `downloaded` — stop; explain the stderr hint (missing env / `invalid_grant` → `auth.mjs`); do **not** run `/inbox`.
- If `accepted.length === 0` and no downloads — empty-inbox report (§5), do **not** run `/inbox`.
- `N` for the user intro = `accepted.length`.

Do not call Gmail MCP. Do not re-implement search / download / label logic outside the script.

### 2. Delegate to inbox

If at least one new PDF landed in `inbox/` (`downloaded.length ≥ 1`):

1. Read [`inbox/SKILL.md`](../inbox/SKILL.md).
2. Execute its full workflow (match → move → pdf-to-text → extract photos if attached → update statistics → save via `/save` or `/save-selected` → report).

Saving (commit + push) is done by the delegated [`inbox`](../inbox/SKILL.md) skill — do not wait for Apply and do not run a separate commit from `mail-inbox`.

If no PDF was downloaded — do not run `/inbox`.

### 3. Report

User-facing report — Markdown, **not** wrapped in a fenced `text` block. No per-email `Gmail <id>` dump as the main tone (record script/label errors only if something failed).

**Intro** (counts by fact; typography per `typograf`):

```markdown
Пришло 1 письмо от Мос-ру с ответом на ваше обращение.

Из письма скачан PDF-файл и добавлена текстовая расшифровка. Письмо помечено прочитанным и перемещено из «Входящих» в папку `Mos Responses. Processed`.
```

```markdown
Пришло N писем от Мос-ру с ответами на ваши обращения.

Из каждого письма скачан PDF-файл и добавлена текстовая расшифровка. Письма помечены прочитанными и перемещены из «Входящих» в папку `Mos Responses. Processed`.
```

- `N` = accepted SEDO emails (original or forward).
- **N = 1** — use the first intro (singular throughout: «1 письмо», «с ответом на ваше обращение», «Из письма…», «Письмо помечено… и перемещено…»).
- **N ≥ 2** — use the second intro; substitute the actual count for `N`.
- Write **«Мос-ру» through a hyphen**, never «Мос.ру».
- If a PDF was not downloaded from every email due to a **failure** (not routine skip) — adjust the second sentence; do not claim «из каждого» / «из письма» when false.
- **Do not mention** routine skipped attachments in the report: ZIP «Документ с ЭП», `Направлен.pdf`, `message/rfc822`, or other non-PDF parts.
- If in this run `/inbox` extracted photo attachments — extend the second sentence, e.g. «…текстовая расшифровка, а также фото из приложений.» Only when at least one photo file was actually saved. Keep singular/plural agreement with N.
- If `N` = 0 — use this exact text (two paragraphs) and do **not** run `/inbox`:

```markdown
Новых ответов в почте нет. Пишите ещё!

Чтобы я помог составить новое обращение, напишите мне `/new идея обращения`
```

Then print the usual `/inbox` report blocks from [`inbox/SKILL.md`](../inbox/SKILL.md) §10 **in that skill’s order**:

1. `[Статистика](statistics.md) обновлена:` when stats changed
2. Plain line `Сохранённый ответ:` / `Сохранённые ответы:` (singular when one saved response; not a markdown heading) with bullets `[локация](<case>/response/response.md) — суть`
3. Telegram offer `Отправлю в ваш Телеграм-канал?` when there was at least one successfully saved response (agreement → `/telegram-report` per inbox §10)

(Saving already ran inside `/inbox` §11 — no Apply footer.)

Do not add a separate technical «Inbox:» heading.

## Safety Rules

- Only process SEDO response emails as defined in Scope (script enforces this).
- Only download PDF attachments.
- Truncate attachment basenames to ≤ 255 UTF-8 bytes (ext4) when saving into `inbox/`.
- Do not download `Направлен.pdf` — it duplicates the letter already in the mos.ru export.
- Do not mention routine skipped attachments (`Направлен.pdf`, «Документ с ЭП.zip`, non-PDF parts) in the user report.
- Do not use the browser as a Gmail substitute when the script fails; do not ask for a password.
- Do not run `/inbox` when this skill downloaded nothing.
- Do not commit or push from `mail-inbox` itself; delegated `/inbox` saves via `/save` or `/save-selected`.
- One failed email must not abort the batch (script continues; report errors if needed).

## Expected User Phrases

- `/mail-inbox`
- «Разбери почту»
- «Process the mail»
- «Забери ответы из Gmail»
