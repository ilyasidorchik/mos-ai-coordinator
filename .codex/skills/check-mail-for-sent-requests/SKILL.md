---
name: check-mail-for-sent-requests
description: >-
  Fetches mos.ru «обращение отправлено» confirmation emails from Gmail via
  local fetch-sent.mjs, and if the appeal text is missing in the repo, writes
  request/request.md in the case format (number, date, title, text), then
  archives the message (remove INBOX+UNREAD, no processed label). Use when the
  user mentions /check-mail-for-sent-requests, «Забери обращения из почты»,
  «Синхронизируй отправленные обращения», or «Сохрани текст обращения с почты».
disable-model-invocation: true
---

# Check Mail for Sent Requests

## Overview

Backfill missing appeal texts from mos.ru submission confirmations:

1. Find «обращение отправлено» emails (originals and forwards) via
   [`scripts/fetch-sent.mjs`](scripts/fetch-sent.mjs).
2. For each parsed appeal — match or create a case; if `request.md` text is
   missing, write it in the repo format; run typograf.
3. Archive processed Gmail messages (`removeLabelIds: INBOX, UNREAD`) — **no**
   custom processed label.
4. Save via `/save` or `/save-selected`, then report.

This is **not** `/mail-inbox` (agency responses / SEDO / ЦППК).

Do **not** call Gmail MCP. Do not re-implement search / parse / archive outside
the script.

## Config

Same Gmail OAuth as `/mail-inbox`:

| Key | Where |
| --- | --- |
| `GMAIL_CLIENT_ID` | `.env` locally; Runtime Secret in Cloud Agents |
| `GMAIL_CLIENT_SECRET` | same |
| `GMAIL_REFRESH_TOKEN` | same |

`process.env` wins over `.env`. Do **not** read, echo, or pass tokens yourself.

If the script exits with `GMAIL_* is not set` — stop and tell the user to fill
[`.env`](../../../.env) or Cloud Agents Secrets.

If `invalid_grant` — run locally:

```bash
node .codex/skills/mail-inbox/scripts/auth.mjs
```

Then update `GMAIL_REFRESH_TOKEN`. Do not open Gmail in the browser as a
substitute.

## Scope

Only mos.ru **sent-appeal confirmations**:

- Subject / body contains «обращение отправлено» (incl. `Fwd: Mos.Ru - обращение отправлено`).
- From / body mentions `noreply@mos.ru` or the mos.ru reception template.

Skip SEDO / ЦППК response emails — those are `/mail-inbox`.

## Workflow

### 0. Opening status

Before tool calls, tell the user in one short line (exact wording):

```text
Забираю квитанции mos.ru об отправке по skill `/check-mail-for-sent-requests`
```

### 1. Fetch and parse

Do **not** wait for confirmation. This repo’s
[`.cursor/permissions.json`](../../../.cursor/permissions.json) allows the script.

```bash
node .codex/skills/check-mail-for-sent-requests/scripts/fetch-sent.mjs
```

Parse JSON on stdout:

| Field | Meaning |
| --- | --- |
| `accepted[]` | Parsed confirmations: `id`, `kind`, `appeal` |
| `accepted[].appeal` | `mos_id`, `sent_date`, `agency`, `title`, `body`, `attachments` |
| `skipped` | `not_sent_confirmation` / `parse_incomplete` — do not dump routinely |
| `errors` | per-message failures — continue; note only if something failed |
| `dryRun` | always no Gmail modify in this step |

- Non-zero exit and no useful `accepted` — stop; explain stderr (env / `invalid_grant`).
- `accepted.length === 0` — empty report (§6), stop (no archive, no save).

### 2. Build case index

Scan folders with `request/request.md` or `request/request.txt`. For each case:

| Field | Source |
|-------|--------|
| `case_path` | parent of `request/` |
| `title` | line after `Заголовок:` |
| `mos_ids` | numbers from `Номера обращений:` / `Номер обращения:` |
| `request_text` | text after `Текст:` |
| `is_stub` | see §3 |

Normalization: lower-case, `ё→е`, collapse whitespace, strip NBSP.

### 3. When text is «missing»

Treat as missing / writable:

- no case with this `mos_id`; **or**
- case exists but stub / empty `Текст:`:
  - exactly `Текст обращения будет добавлен позже.`
  - `(Текст обращения не сохранился.)`
  - empty block after `Текст:`

**Do not overwrite** a normal existing appeal body. If the case matches but
already has full text — still archive the email (§5); optionally fill missing
`Номер обращения:` / `Дата:` only when clearly the same appeal; note in report.

### 4. Match or create case

Signals (highest wins):

1. `mos_id` already in a `request.md` → that case.
2. Exact / near `Заголовок:` vs `appeal.title` + location/topic overlap.
3. Stub folder whose path/title matches title/location (e.g. `otradnoye-cycle-sign`).

If no match — create a new case (`/new`-style):

```text
<district>/<topic>/<case>/
  request/
    photos/
    request.md
  response/
```

Ask **one** clarifying question only if district/topic/slug are ambiguous.
Latin kebab-case slug from title/location. Do not invent facts beyond the email.

### 5. Write `request.md`

Format (etalon: `SVAO/cycling/otradnoye-cycle-sign/request/request.md`):

```markdown
Номер обращения:
{mos_id} {agency}

Дата:
{DD.MM.YYYY}

Заголовок:
{title}

Текст:
{body}

Фото в приложении.
```

Rules:

- `agency` — short name from the script (`Дептранс`, `ДКР`, …); if null, omit
  the agency token or use the recipient string without inventing a short name.
- `Дата:` — `appeal.sent_date` as in the email (`DD.MM.YYYY`).
- «Фото в приложении.» — only if `attachments.length > 0`.
- Preserve the sent body; do not rewrite for style.
- After write — run [`typograf`](../typograf/SKILL.md) on that `request.md`.
- Do **not** download photo attachments from Gmail in v1.

Collect `messageId`s to archive:

- text was written/filled; **or**
- text already present and the email was a confirmation for that `mos_id` /
  matched case (processed without rewrite).

Do **not** archive `parse_incomplete` / unmatched-with-no-case-created failures.

### 5b. Archive in Gmail

After §5 (and before or after git save — archive once the repo write succeeded
or was intentionally skipped as already present):

```bash
node .codex/skills/check-mail-for-sent-requests/scripts/fetch-sent.mjs \
  --archive-ids '<id1>,<id2>'
```

Only `removeLabelIds: ['INBOX', 'UNREAD']`. **No** `Mos Responses. Processed`
or any other custom label. Do not archive on `--dry-run` of the fetch step
alone; do not archive ids that failed processing.

### 6. Save and report

**Save** (no AskQuestion / no Apply wait):

- One case changed → `git add` relevant paths + [`/save`](../save/SKILL.md)
  (or stage the case + run `/save` per that skill). Prefer not to drag
  unrelated dirty files when easy — otherwise follow `/save` as usual.
- Several cases → [`/save-selected`](../save-selected/SKILL.md) per case with
  an explicit path list.

If nothing was written to the repo (all already present) but emails were
archived — say so; skip `/save` when the working tree has no skill-related
changes.

**Report** — Markdown, not a fenced `text` block. Repo-relative links.

Empty inbox (`accepted.length === 0`):

```markdown
Новых квитанций об отправке обращений в почте нет.
```

Otherwise:

```markdown
Нашёл N квитанций mos.ru об отправке обращений.

Сохранённые тексты:

- [заголовок](<path>/request/request.md) — #<mos_id>

Уже были в репозитории:

- [заголовок](<path>/request/request.md) — #<mos_id>

Письма помечены прочитанными и убраны из «Входящих» (архив).
```

Omit empty sections. Adjust the archive sentence if archive failed or was
partial. Do not dump Gmail message ids as the main tone.

Write **«Мос-ру»** with a hyphen in prose if needed; subjects may say `Mos.Ru`.

## Safety Rules

- Only process mos.ru sent-appeal confirmations as defined in Scope.
- Do not use Gmail MCP; use `fetch-sent.mjs` only.
- Do not add custom Gmail labels; archive = remove `INBOX` + `UNREAD` only.
- Do not overwrite existing non-stub appeal text.
- Do not invent mos.ru ids, dates, titles, or body text.
- Do not download email attachments in v1.
- Do not run `/mail-inbox` / `/inbox` from this skill.
- One failed email must not abort the batch.
- Commit/push only via `/save` or `/save-selected`.

## Expected User Phrases

- `/check-mail-for-sent-requests`
- «Забери обращения из почты»
- «Синхронизируй отправленные обращения»
- «Сохрани текст обращения с почты»
