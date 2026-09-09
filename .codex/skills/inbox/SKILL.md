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
4. If the response mentions attached photos — run [`extract-response-photos`](../extract-response-photos/SKILL.md).
5. Update [`statistics.md`](../../../statistics.md).
6. Save without waiting for the user: one case → `git add .` + [`/save`](../save/SKILL.md); several cases → [`/save-selected`](../save-selected/SKILL.md) per case with an explicit path list.
7. Report.

Do not duplicate transcription or photo-crop logic here — always delegate step 3 to `pdf-to-text` and step 4 to `extract-response-photos`.

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

### 8. Extract attached photos

After `pdf-to-text` (or when `response.md` already existed and was skipped), check whether the answer attaches photos.

**Trigger** — any of these in `response.md` (preferred) or the PDF text from step 3:

- `фотоматериал(ы) прилага(е|ю)тся`
- `фото прилага`
- fallback: PDF has ≥1 large image (width≥400) on a page after the first **and** the text contains `Приложение:` or `фото`

If no trigger — skip this step.

If triggered:

1. Read [`.codex/skills/extract-response-photos/SKILL.md`](../extract-response-photos/SKILL.md).
2. Run:

```bash
python3 .codex/skills/extract-response-photos/scripts/extract-response-photos.py \
  "<case>/response/<just-moved>.pdf"
```

3. Photos land in `<case>/response/photos/` as `{case-folder}-result.jpg` (or `result1`, `result2`, …).
4. If dependencies are missing or no large images are found — note it in the report; do **not** abort the rest of `/inbox`.

### 9. Update statistics.md

At the end of the run — after all PDFs were processed (move + `pdf-to-text` + optional photo extract) — update [`statistics.md`](../../../statistics.md). Skip this step if no PDF was successfully moved.

1. Open `statistics.md`.
2. **Ответов получено:** add `+1` for each PDF successfully moved to a case in this run. Do **not** count PDFs left in `inbox/` or skipped due to a name conflict in `response/`.
3. **Меры:** for each successfully moved PDF, read the response text (`response.md` if created or already present; otherwise the PDF text from step 3) and decide whether measures were taken. Count as measures: disciplinary action, driver review/sanctions, inclusion in a works project, concrete follow-up to a balance holder, or other explicit agency actions beyond a refusal / brush-off. Do **not** count pure refusal, «учтем», or «направлено на рассмотрение» with no outcome.
4. If measures were found:
   - add `+1` to **Мер принято** (or `+N` if one response clearly contains several independent measures — same style as «Автобус 688 ×2»);
   - append a bullet under `## Принятые меры` in the existing style: short, location/object — essence of the measure.
5. If no measures — leave the measures counter and list unchanged.
6. Do **not** change **Обращений подано** (out of scope for `/inbox`).
7. Commit/push of `statistics.md` happens in §11 together with the first case (via `/save` or `/save-selected`), not as a separate agent-side commit outside those skills.

### 10. Report

**First** execute §11 (commit and push). Then print the user-facing report below.

Do **not** wrap the user-facing report in a fenced `text` / code block — Markdown links must stay clickable.

Do **not** use the old technical lines (`inbox/foo.pdf → … (score …)`, `response.md: создан`).

Structure:

1. Plain line (not a markdown heading): `Сохранённые ответы:` followed by bullets.
2. One bullet per successfully processed PDF (moved to a case):

```markdown
Сохранённые ответы:

- [16-я Парковая, 35](VAO/bike-friendly-drain-grates/16-th-parkovaya-35/response/response.md) — Мосводосток заменил решётку
```

Rules for each bullet:

- Link text = location/object only (before the dash). After the link: ` — essence` of the agency reply (same style as measure bullets in `statistics.md`).
- Href = repo-relative path to that case’s `response/response.md`.
- Write the summary from the response already read (after `pdf-to-text`); do not invent.
- No long quotes; no score in the normal case.
- Low-confidence match: after the bullet, a short note + 2–3 alternatives.
- If `response.md` was skipped (already existed): `[location](path) — essence — пропущен` (or `[location](path) — пропущен` if there is no text).
- If photos were extracted in step 8: append to the same bullet `, [фото](<repo-relative path to the saved JPEG>)`. Example:

```markdown
- [16-я Парковая, 18](VAO/bike-friendly-drain-grates/16-th-parkovaya-18/response/response.md) — Мосводосток заменил решётку, [фото](VAO/bike-friendly-drain-grates/16-th-parkovaya-18/response/photos/16-th-parkovaya-18-result.jpg)
```

- Href of `[фото]` — the concrete file from step 8 (e.g. `{case}-result.jpg`), not the folder. Several photos: `, [фото](…/result1.jpg), [фото 2](…/result2.jpg)`.
- If photo extraction was triggered but found nothing / failed deps: one short note, do not invent files or a `[фото]` link.
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

4. Do **not** print an Apply / «нажмите Apply» footer — saving is done in §11 before or as part of finishing the run. Rely on the short `/save` or `/save-selected` report for commit/push confirmation; do not duplicate a long save narrative in the inbox report.

Pure `/inbox` (no mail) does **not** print a Gmail / Mos-ru intro — only the blocks above.

### 11. Commit and push (immediate — no Apply)

Do **not** ask for confirmation (no AskQuestion / no «ок»). After steps 1–9 (all PDFs processed, `statistics.md` updated when applicable), save **before** finishing — do not wait for the user to Apply files.

Count **successful cases** = PDFs successfully moved to a case in this run (same set as in §9). Leave unmatched PDFs in `inbox/` out of every path list.

**One successful case:**

1. `git add .`
2. Read and execute [`/save`](../save/SKILL.md) (full skill workflow: commit message rules, commit, push, report).

**Several successful cases** (same order as processing):

For each case `i = 1..N`:

1. Build an explicit path list:
   - `<case_i>/response/` (PDF, `response.md`, `photos/`, …)
   - If `i == 1` **and** `statistics.md` was changed in this run — also include `statistics.md`
2. Read and execute [`/save-selected`](../save-selected/SKILL.md), **passing that path list**.
3. `/inbox` itself does **not** run `git add` for the multi-case path — staging is `/save-selected`’s job.

Limits:

- One case → one `/save` commit (may include unrelated dirty files because of `git add .`).
- N cases → N `/save-selected` commits; first usually carries `statistics.md`.
- Unmatched / skipped PDFs and unrelated dirty files are not added to `/save-selected` lists.

## Safety Rules

- Process PDFs from `inbox/` only in v1.
- Do not batch-process PDFs outside `inbox/` unless the user explicitly asks.
- Do not silently overwrite existing `response.md` or duplicate PDFs in `response/`.
- Do not invent measures or change statistics counters except from successfully processed responses in this run.
- Do not change **Обращений подано** from `/inbox`.
- Do not invent photo files; only save what `extract-response-photos` actually writes.
- Commit and push only via `/save` (single case) or `/save-selected` (several cases); do not rely on an Apply / `afterFileEdit` hook.

## Expected User Phrases

- `@inbox`
- «Разбери inbox»
- «Распредели PDF из inbox»
- «Обработай ответы из inbox»
