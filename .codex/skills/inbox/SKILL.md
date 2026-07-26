---
name: inbox
description: >-
  Routes response PDFs from inbox/ to the matching case response/ folder by
  filename, mos.ru id, title, and response vs request content, then runs
  pdf-to-text. Use when the user mentions @inbox, inbox folder, «Разбери inbox»,
  «Распредели PDF из inbox», or «Обработай ответы из inbox».
disable-model-invocation: true
---

# Inbox

## Overview

Process official response PDFs dropped into [`inbox/`](../../../inbox/):

1. Match each PDF to the right case.
2. Move it to `<case>/response/`.
3. Run the [`pdf-to-text`](../pdf-to-text/SKILL.md) workflow for that file.
4. Update [`statistics.md`](../../../statistics.md).
5. Report; after the user Applies `response.md`, the project hook commits and pushes.

Do not duplicate transcription logic here — always delegate step 3 to `pdf-to-text`.

## Workflow

### 1. Scan inbox

- Look for `*.pdf` only in `inbox/` at the repo root.
- If empty — report and stop.
- If multiple PDFs — process **one by one**, alphabetically; give a summary at the end.

### 2. Build case index

Scan the repo for folders with `request/request.md` or `request/request.txt`. For each case collect:

| Field | Source |
|-------|--------|
| `case_path` | parent of `request/` |
| `title` | line after `Заголовок:` |
| `mos_ids` | numbers from `Номера обращений:` / `Номер обращения:` |
| `request_text` | full appeal text after `Текст:` |
| `locations` | streets, addresses, districts, metro stations, bus stops/ОРП from title and text |
| `topics` | subject: «выделенная полоса», «пешеходный переход», «разметка СИМ», «интервал движения», etc. |

**Exclude** legacy cases that use `answer/` instead of `response/` (e.g. `SVAO/bus605/`). If the user points to such a case explicitly, handle it manually.

Normalization for comparison: lower-case, `ё→е`, collapse whitespace, strip NBSP, replace `∕` with `/`.

### 3. Extract PDF content

For **every** inbox PDF — read text with the Read tool. If text is missing or unreliable, render the first page:

```bash
mkdir -p /tmp/inbox_pdf_preview
qlmanage -t -s 2000 -o /tmp/inbox_pdf_preview "inbox/file.pdf"
```

Request full permissions if sandbox blocks rendering.

Extract from the response:

- `incoming_ref` — original appeal number: `на № (\d+) от`
- `response_subject` — phrase after «по вопросу …» / «рассмотрено Ваше обращение …»
- `response_locations` — toponyms, streets, addresses, metro from the body
- `response_topics` — subject matter (выделенная полоса, пешеходный переход, велодорога, etc.)

### 4. Parse PDF filename

Typical mos.ru export:

```text
17-65-6736∕26_14.04.2026_Сообщение с mos.ru, идентификатор： 57492186 Пробка блокирует автобус на Анохина по вечерам.pdf
```

Extract:

- `mos_id` — regex `идентификатор[：:]\s*(\d+)`
- `title_from_filename` — text after the id until `.pdf`

Other formats in this repo:

- `01-05-7893-26 Сидорчику И.А..pdf` — no title in filename; rely on PDF content (step 3)
- `SCN_20260423_092950.pdf` — scan; rely on PDF content + render

See [reference.md](reference.md) for real matching examples.

### 5. Match to a case (best guess)

**Sum** all matching signals per case. The highest total wins.

**Filename metadata:**

| Score | Condition |
|-------|-----------|
| 100 | `mos_id` from filename = `mos_ids` in request |
| 90 | exact match of `title_from_filename` with `Заголовок:` |

**Response content vs appeal content:**

| Score | Condition |
|-------|-----------|
| 95 | `incoming_ref` from PDF = `mos_ids` in request |
| 85 | both location **and** topic match (e.g. «Академика Анохина» + «выделенная полоса») |
| 75 | `response_subject` aligns with `title` or opening of `request_text` |
| 65 | key location matches (street, address, metro, ОРП) |
| 55 | topic matches without exact location (e.g. both about pedestrian crossings in the same district) |
| 40 | partial overlap of toponyms or phrasing |

**Selection rules:**

- Always pick the case with the **highest total score** and move there.
- If score < 50 **or** gap to second place < 15 — flag «низкая уверенность», show 2–3 alternatives with scores and what matched, but still move to the best guess.
- If score = 0 — leave PDF in `inbox/`, explain why, continue to the next file.
- In the report, list match types: `mos_id`, `заголовок`, `содержание: локация+тема`, `содержание: incoming_ref`, etc.

### 6. Move PDF

```bash
mkdir -p "<case>/response"
mv "inbox/file.pdf" "<case>/response/"
```

- Do not overwrite an existing PDF in `response/` without explicit user request — skip and report.
- Do not delete the inbox original if the move fails.

### 7. Run pdf-to-text

After a successful move:

1. Read [`.codex/skills/pdf-to-text/SKILL.md`](../pdf-to-text/SKILL.md).
2. Execute its workflow for the **just moved** PDF in `<case>/response/`.
3. Inherit its safety rules:
   - do not silently overwrite existing `response.md`
   - delete `response/_pdf_pages/` after transcription

### 8. Update statistics.md

At the end of the run — after all PDFs were processed (move + `pdf-to-text`) — update [`statistics.md`](../../../statistics.md). Skip this step if no PDF was successfully moved.

1. Open `statistics.md`.
2. **Ответов получено:** add `+1` for each PDF successfully moved to a case in this run. Do **not** count PDFs left in `inbox/` or skipped due to a name conflict in `response/`.
3. **Меры:** for each successfully moved PDF, read the response text (`response.md` if created or already present; otherwise the PDF text from step 3) and decide whether measures were taken. Count as measures: disciplinary action, driver review/sanctions, inclusion in a works project, concrete follow-up to a balance holder, or other explicit agency actions beyond a refusal / brush-off. Do **not** count pure refusal, «учтем», or «направлено на рассмотрение» with no outcome.
4. If measures were found:
   - add `+1` to **Мер принято** (or `+N` if one response clearly contains several independent measures — same style as «Автобус 688 ×2»);
   - append a bullet under `## Принятые меры` in the existing style: short, location/object — essence of the measure.
5. If no measures — leave the measures counter and list unchanged.
6. Do **not** change **Обращений подано** (out of scope for `/inbox`).
7. Do **not** commit or push `statistics.md` from the agent; leave that to Apply / «сохранись».

### 9. Report

For each PDF:

```text
inbox/foo.pdf → ZAO/troparyovo/anokhina bus lane/response/ (score 185: заголовок + содержание: локация+тема)
  response.md: создан

Чтобы сохранить и запушить — Apply у `response.md`.
```

```text
inbox/bar.pdf → … (score 55, низкая уверенность; совпала только тема «пешеходный переход»; альтернативы: vereskovaya 50, dezhnyova 45)
  response.md: уже существует, пропущен
  hook не сработает — при необходимости: «сохранись» и push
```

At the end of the report, one line about `statistics.md`, for example:

```text
statistics.md: Ответов получено 24→25; мер нет
```

```text
statistics.md: Ответов получено 24→25; Мер принято 5→6; + «Вересковая улица — доп. пешеходный переход в проекте»
```

### 10. Commit and push (on Apply of response.md)

Do **not** ask for confirmation (no AskQuestion / no «ок»). Do **not** run `git commit` or `git push` from the agent during `/inbox`.

Saving is handled by the project hook [`.cursor/hooks/inbox-commit-push.sh`](../../../.cursor/hooks/inbox-commit-push.sh) on `afterFileEdit` when `<case>/response/response.md` is written/Applied:

1. Stages that `<case>/response/` (PDF + `response.md`; ignores `_pdf_pages/`).
2. Commits: `Add agency response for <case-name>`
3. Pushes the current branch.

The hook does **not** include `statistics.md`. To save it, use «сохранись» (or commit manually) after Apply.

In the report footer:

- If at least one `response.md` was **created** in this run: remind the user — «Чтобы сохранить и запушить — Apply у `response.md`.»
- If Agent auto-applies edits (no Apply UI): the hook runs on write; no extra action needed — still mention that commit/push goes through the hook.
- If `response.md` was **not** created (already existed / skipped): say the hook will not fire for that case; suggest «сохранись» (and push) manually if they want those PDF-only changes saved.
- If `statistics.md` was updated: remind that it is not in the hook commit — «сохранись», if they want it saved.

Limits:

- One Apply / one write of `response.md` → one commit for that case’s `response/` folder.
- Several cases in one `/inbox` run → several Applies → several commits.
- Unrelated dirty files outside that `response/` are not included.

## Safety Rules

- Process PDFs from `inbox/` only in v1.
- Do not batch-process PDFs outside `inbox/` unless the user explicitly asks.
- Do not route into legacy `answer/` folders automatically.
- Do not silently overwrite existing `response.md` or duplicate PDFs in `response/`.
- Do not invent measures or change statistics counters except from successfully processed responses in this run.
- Do not change **Обращений подано** from `/inbox`.
- Do not commit or push from the agent during `/inbox`; leave that to the Apply/`afterFileEdit` hook (and «сохранись» for `statistics.md`).

## Expected User Phrases

- `@inbox`
- «Разбери inbox»
- «Распредели PDF из inbox»
- «Обработай ответы из inbox»
