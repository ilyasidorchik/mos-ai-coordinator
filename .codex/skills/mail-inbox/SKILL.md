---
name: mail-inbox
description: >-
  Fetches agency response emails from Gmail (sedo@mos.ru originals and
  forwards), downloads PDF attachments into inbox/, marks messages processed,
  then runs the inbox skill. Use when the user mentions /mail-inbox,
  «Разбери почту», «Process the mail», or «Забери ответы из Gmail».
disable-model-invocation: true
---

# Mail Inbox

## Overview

Pull official response emails from Gmail into [`inbox/`](../../../inbox/), then
delegate routing, transcription, and photo extraction to [`inbox`](../inbox/SKILL.md):

1. Find SEDO response emails (originals and forwards).
2. Download each PDF into `inbox/`.
3. Mark the message read and move it to Gmail label `Mos Responses. Processed`.
4. Run the [`inbox`](../inbox/SKILL.md) skill on whatever was downloaded
   (match → move → pdf-to-text → extract attached photos when mentioned → report).

Do not duplicate inbox matching, `pdf-to-text`, or `extract-response-photos` — always delegate step 4.

## Prerequisites: Gmail MCP

Before searching mail, inspect MCP server `user-gmail` (`GetMcpTools`).

If the server is missing, in `needsAuth` / `error`, or required tools are absent:

1. **Stop.** Do not fake downloads, open Gmail in the browser as a workaround, or ask for a password.
2. Tell the user that `/mail-inbox` needs Gmail MCP (`user-gmail`).
3. Suggest: set up MCP (`npx gmail-mcp-server setup`, tokens in `~/.gmail-mcp`) **or** drop PDFs into `inbox/` manually and run `/inbox`.
4. **Do not** run `/inbox` in this pass if nothing was downloaded because MCP was unavailable.

If MCP is present but `needsAuth` — call `mcp_auth` for `user-gmail` once; on failure, same stop + manual `inbox/` path.

Required tools: `gmail_search_emails`, `gmail_list_attachments`, `gmail_get_attachment`, `gmail_mark_email`, `gmail_move_email`.

## Scope

Only citizen-appeal **response** emails:

- **Original:** `from` contains `sedo@mos.ru`, subject like «Ответ … на обращение гражданина».
- **Forward:** `from` is not SEDO, but subject matches `/^(Fwd|FW|Fw|Пересл|Пересылка):/i` and/or snippet mentions `sedo@mos.ru`, with the same subject pattern.

Download **only** `application/pdf` attachments. Skip ZIP «Документ с ЭП», `message/rfc822`, and other parts.

Also skip a PDF whose filename is exactly `Направлен.pdf` (case-sensitive basename). In SEDO forwards this is usually a second attachment — a duplicate scan of the same letter already inside the mos.ru export PDF. Do not download it; keep only the mos.ru-named PDF (typically index `0`).

## Workflow

### 0. Opening status

Before tool calls, tell the user in one short line (exact wording):

```text
Забираю ответы из Gmail по skill `/mail-inbox`: сначала проверю MCP и найду письма от Мос-ру
```

### 1. Search (metadata only — cheap)

Call `gmail_search_emails` with a query equivalent to:

```text
in:inbox ("на обращение гражданина") (from:sedo@mos.ru OR subject:Fwd OR subject:FW OR "sedo@mos.ru")
```

Classify each hit from search metadata (do not read the full body unless needed):

1. `From` contains `sedo@mos.ru` → original.
2. Subject matches `/^(Fwd|FW|Fw|Пересл|Пересылка):/i` **or** snippet contains `sedo@mos.ru` → forward of SEDO.
3. Otherwise → skip and note in the report.

If there are no matching emails — report and **do not** run `/inbox`.

### 2. Process each email in order

For every accepted message:

1. `gmail_list_attachments` — collect PDF attachments (`contentType` starts with `application/pdf`).
2. Skip any PDF whose basename is exactly `Направлен.pdf` (duplicate of the letter inside the mos.ru export). Skip silently — do not mention in the user report.
3. Download each remaining PDF with `gmail_get_attachment` and `customPath` = absolute path to repo [`inbox/`](../../../inbox/). Prefer the mos.ru export (filename with `идентификатор：`); that is usually index `0`.
4. Strip the downloader timestamp prefix if present (`2026-07-12T13-39-11-825Z_…` → original mos.ru filename) so `/inbox` can parse `идентификатор： …`.
5. `gmail_mark_email` with `read: true`.
6. Move out of Inbox into `Mos Responses. Processed` (see label section below).

One email failing must not stop the rest — record the error and continue.

### 3. Gmail label `Mos Responses. Processed`

`gmail_move_email` requires a Gmail **label id**, not a display name. Passing the name yields `Invalid label`.

Known id for this mailbox (update if resolve finds another):

```text
Label_3765494894429308866
```

Move:

```text
labelId: Label_3765494894429308866
removeLabelIds: ["INBOX"]
```

**Resolve / create if needed:**

1. Try move with the constant above.
2. On `Invalid label` — resolve via Node + `googleapis` using `~/.gmail-mcp/credentials.json` and `~/.gmail-mcp/token.json` (never print tokens). `users.labels.list`, find name exactly `Mos Responses. Processed`.
3. If the label **does not exist** — create it (`users.labels.create` with that flat name), then move with the new id. Report «лейбл создан».
4. If an existing label was found under another id — report «использован существующий» and, when editing this repo, update the constant in this skill.
5. If create/move still fails (scope / API error) — the message may already be read; say explicitly that the PDF was saved but move to `Mos Responses. Processed` failed; suggest creating the label manually. Still proceed to `/inbox` for downloaded PDFs.

Example resolve/create (Node, no token on stdout):

```javascript
const fs = require('fs');
const { google } = require(require('path').join(
  process.env.HOME, 'gmail-mcp/node_modules/googleapis'
));
// fallback: require('googleapis') if installed globally / in skill env

async function main() {
  const creds = JSON.parse(fs.readFileSync(
    process.env.HOME + '/.gmail-mcp/credentials.json', 'utf8'));
  const token = JSON.parse(fs.readFileSync(
    process.env.HOME + '/.gmail-mcp/token.json', 'utf8'));
  const { client_id, client_secret, redirect_uris } = creds.installed || creds.web;
  const auth = new google.auth.OAuth2(client_id, client_secret, redirect_uris?.[0]);
  auth.setCredentials(token);
  const gmail = google.gmail({ version: 'v1', auth });
  const name = 'Mos Responses. Processed';
  const listed = await gmail.users.labels.list({ userId: 'me' });
  let label = (listed.data.labels || []).find((l) => l.name === name);
  if (!label) {
    const created = await gmail.users.labels.create({
      userId: 'me',
      requestBody: {
        name,
        labelListVisibility: 'labelShow',
        messageListVisibility: 'show',
      },
    });
    label = created.data;
    console.log('CREATED\t' + label.id);
  } else {
    console.log('EXISTS\t' + label.id);
  }
}
main().catch((e) => { console.error(e.message); process.exit(1); });
```

Prefer `~/gmail-mcp/node_modules/googleapis` when that install exists from MCP setup.

### 4. Delegate to inbox

If at least one new PDF landed in `inbox/`:

1. Read [`inbox/SKILL.md`](../inbox/SKILL.md).
2. Execute its full workflow (match → move → pdf-to-text → extract photos if attached → report).

Do **not** commit or push from the agent; that stays with the inbox Apply / `afterFileEdit` hook.

If no PDF was downloaded — do not run `/inbox`.

### 5. Report

User-facing report — Markdown, **not** wrapped in a fenced `text` block. No per-email `Gmail <id>` dump as the main tone (record MCP/label errors only if something failed).

**Intro** (counts by fact; typography per `typograf`):

```markdown
Пришло 1 письмо от Мос-ру с ответом на ваше обращение.

Из каждого письма скачан PDF-файл и добавлена текстовая расшифровка. Письма помечены прочитанными и перемещены из «Входящих» в папку `Mos Responses. Processed`.
```

```markdown
Пришло N писем от Мос-ру с ответами на ваши обращения.

Из каждого письма скачан PDF-файл и добавлена текстовая расшифровка. Письма помечены прочитанными и перемещены из «Входящих» в папку `Mos Responses. Processed`.
```

- `N` = accepted SEDO emails (original or forward).
- **N = 1** — use the first intro (singular: «1 письмо», «с ответом на ваше обращение»).
- **N ≥ 2** — use the second intro; substitute the actual count for `N`.
- Write **«Мос-ру» through a hyphen**, never «Мос.ру».
- If a PDF was not downloaded from every email due to a **failure** (not routine skip) — adjust the second sentence; do not claim «из каждого» when false.
- **Do not mention** routine skipped attachments in the report: ZIP «Документ с ЭП», `Направлен.pdf`, `message/rfc822`, or other non-PDF parts.
- If in this run `/inbox` extracted photo attachments — extend the second sentence, e.g. «…текстовая расшифровка, а также фото из приложений.» Only when at least one photo file was actually saved.
- If `N` = 0 — use this exact text (two paragraphs) and do **not** run `/inbox`:

```markdown
Новых ответов в почте нет. Пишите ещё!

Чтобы я помог составить новое обращение, напишите мне `/new идея обращения`
```

Then print the usual `/inbox` report blocks from [`inbox/SKILL.md`](../inbox/SKILL.md) §10:

- Plain line `Сохранённые ответы:` (not a markdown heading) with bullets `[краткое резюме](<case>/response/response.md)`
- `[Статистика](statistics.md) обновлена:` when stats changed
- Footer about Apply (response ↑ and `statistics.md` when stats changed) — see inbox §10

Do not add a separate technical «Inbox:» heading.

## Safety Rules

- Only process SEDO response emails as defined in Scope.
- Only download PDF attachments.
- Do not download `Направлен.pdf` — it duplicates the letter already in the mos.ru export.
- Do not mention routine skipped attachments (`Направлен.pdf`, «Документ с ЭП.zip`, non-PDF parts) in the user report.
- Do not use the browser as a Gmail substitute when MCP is missing.
- Do not run `/inbox` when this skill downloaded nothing.
- Do not commit or push; leave that to the inbox hook after `response.md` Apply.
- One failed email must not abort the batch.

## Expected User Phrases

- `/mail-inbox`
- «Разбери почту»
- «Process the mail»
- «Забери ответы из Gmail»
