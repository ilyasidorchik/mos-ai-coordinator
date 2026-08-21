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
5. Report; after the user Applies `response.md`, the project hook commits and pushes (`response/` and dirty `statistics.md`).

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

Route only into cases that use `response/` (etalon layout). Do not invent a case path for unmatched PDFs.

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
- If score < 50 **or** gap to second place < 15 — flag «низкая уверенность» in the report (short note + 2–3 alternatives after that list item), but still move to the best guess.
- If score = 0 — leave PDF in `inbox/`, explain why, continue to the next file.
- Scoring signals (`mos_id`, `заголовок`, локация+тема, …) are for matching only — do **not** put score lines in the normal user report.

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
7. Do **not** commit or push `statistics.md` from the agent during `/inbox` — the Apply hook stages it together with `response/` when dirty (see §10).

### 9. Report

Do **not** wrap the user-facing report in a fenced `text` / code block — Markdown links must stay clickable.

Do **not** use the old technical lines (`inbox/foo.pdf → … (score …)`, `response.md: создан`).

Structure:

1. Heading: `Сохранённые ответы:`
2. One bullet per successfully processed PDF (moved to a case):

```markdown
- [16-я Парковая, 35 — Мосводосток заменил решётку](VAO/bike-friendly-drain-grates/16-th-parkovaya-35/response/response.md)
```

Rules for each bullet:

- Link text = one short line: location/object — essence of the agency reply (same style as measure bullets in `statistics.md`).
- Href = repo-relative path to that case’s `response/response.md`.
- Write the summary from the response already read (after `pdf-to-text`); do not invent.
- No long quotes; no score in the normal case.
- Low-confidence match: after the bullet, a short note + 2–3 alternatives.
- If `response.md` was skipped (already existed): still link it with a summary + `— пропущен` (or without summary if there is no text).
- Unmatched PDF left in `inbox/`: explain separately; do not invent a case path.

3. If `statistics.md` was updated in this run:

```markdown
[Статистика](statistics.md) обновлена:
ответов получено 24→25
мер принято 5→6
```

- Link on the word «Статистика».
- Include «мер принято A→B» only if the measures counter changed; otherwise only «ответов получено …».
- Do **not** repeat measure bullets in the report (they live in `statistics.md`).
- If statistics were not updated — omit this block.

4. Footer — if at least one `response.md` was **created** in this run, end with exactly:

```markdown
Чтобы сохраниться, откройте ответ ↑ и нажмите сверху кнопку `Apply` — агент сделает всё остальное.
```

- If Agent auto-applies edits (no Apply UI): the hook still runs on write; keep the same footer wording.
- If **no** `response.md` was created (all skipped / PDF-only): the Apply hook will not fire — suggest «сохранись» (and push) for those PDF + `statistics.md` changes.

Pure `/inbox` (no mail) does **not** print a Gmail / Mos-ru intro — only the blocks above.

### 10. Commit and push (on Apply of response.md)

Do **not** ask for confirmation (no AskQuestion / no «ок»). Do **not** run `git commit` or `git push` from the agent during `/inbox`.

Saving is handled by the project hook [`.cursor/hooks/inbox-commit-push.sh`](../../../.cursor/hooks/inbox-commit-push.sh) on `afterFileEdit` when `<case>/response/response.md` is written/Applied:

1. Stages that `<case>/response/` (PDF + `response.md`; ignores `_pdf_pages/`).
2. If root `statistics.md` has unstaged changes — stages it too.
3. Commits: `Add agency response for <case-name>`
4. Pushes the current branch.

On several Applies in one run: the first commit usually takes `statistics.md`; later commits only that case’s `response/` if stats are already clean.

Limits:

- One Apply / one write of `response.md` → one commit (that case’s `response/`, plus dirty `statistics.md` when present).
- Several cases in one `/inbox` run → several Applies → several commits.
- Unrelated dirty files outside that `response/` and `statistics.md` are not included.

## Safety Rules

- Process PDFs from `inbox/` only in v1.
- Do not batch-process PDFs outside `inbox/` unless the user explicitly asks.
- Do not silently overwrite existing `response.md` or duplicate PDFs in `response/`.
- Do not invent measures or change statistics counters except from successfully processed responses in this run.
- Do not change **Обращений подано** from `/inbox`.
- Do not commit or push from the agent during `/inbox`; leave that to the Apply/`afterFileEdit` hook (which includes dirty `statistics.md`).

## Expected User Phrases

- `@inbox`
- «Разбери inbox»
- «Распредели PDF из inbox»
- «Обработай ответы из inbox»
