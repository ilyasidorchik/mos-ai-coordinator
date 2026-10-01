---
name: inbox
description: >-
  Routes response PDFs (and ЦППК body .md dumps) from inbox/ to the matching
  case response/ folder by filename, mos.ru id, title, and response vs request
  content, then runs pdf-to-text for PDFs. Use when the user mentions @inbox,
  inbox folder, «Разбери inbox», «Распредели PDF из inbox», or
  «Обработай ответы из inbox».
disable-model-invocation: true
---

# Inbox

## Overview

Process official response files dropped into [`inbox/`](../../../inbox/):

1. Match each PDF or ЦППК body `.md` to the right case (or create an orphan case if score = 0).
2. Move it to `<case>/response/`.
3. For PDFs — run the [`pdf-to-text`](../pdf-to-text/SKILL.md) workflow. For body
   `.md` — place as `response.md` or `response-cppk.md` (no pdf-to-text).
4. If the response mentions attached photos — run [`extract-response-photos`](../extract-response-photos/SKILL.md)
   (PDF only).
5. Update [`statistics.md`](../../../statistics.md).
6. Save without waiting for the user: one case → `git add .` + [`/save`](../save/SKILL.md); several cases → [`/save-selected`](../save-selected/SKILL.md) per case with an explicit path list.
7. Report (statistics → saved responses → Telegram offer).
8. If the user agrees to the Telegram offer — run [`telegram-report`](../telegram-report/SKILL.md) for the successfully saved cases.

Do not duplicate transcription or photo-crop logic here — always delegate PDF step 3 to `pdf-to-text` and step 4 to `extract-response-photos`.

## Workflow

### 1. Scan inbox

- Look for `*.pdf` and ЦППК body dumps `ЦППК_*.md` / `ЦППК_обращение_*.md` in `inbox/` at the repo root.
- If empty — report and stop.
- If multiple files — process **one by one**, alphabetically (PDFs and `.md` in one list); give a summary at the end.

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

Route into cases that use `response/` (etalon layout). If no existing case matches (score = 0) — create a new case from the response (§5a); do not leave orphan responses in `inbox/`.

Normalization for comparison: lower-case, `ё→е`, collapse whitespace, strip NBSP, replace `∕` with `/`.

### 3. Extract file content

**ЦППК body `.md`:** read the whole file with the Read tool. Use YAML frontmatter (`cppk_appeal_id`, `subject`) and the body text for matching. Skip PDF rendering and §4 filename-mos.ru parsing for these files.

**PDF:** for **every** inbox PDF — read text with the Read tool. If text is missing or unreliable, render the first page:

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
- If score = 0 — create a **new orphan case** from the response (§5a), then continue with move / transcription as for a normal match.
- Scoring signals (`mos_id`, `заголовок`, локация+тема, …) are for matching only — do **not** put score lines in the normal user report.
- For ЦППК `.md`, filename has no mos.ru `идентификатор` — rely on body text, locations, topics, and optional `cppk_appeal_id` only as a weak hint (do not invent a case from the id alone when a better content match exists).

### 5a. Create orphan case (score = 0)

When no existing case matches, create a typical case folder from the **response context** and place the response there. Do **not** invent appeal text or document numbers that are not in the response.

Path rules:

- `<district>/<topic>/<case>/` — latin, lower-case, short slug from topic/location in the response (same style as the repo).
- Clear district/street → under `ZAO/` / `SVAO/` / …; otherwise → `common/<topic>/…`.

Structure:

```text
<district>/<topic>/<case>/
  README.md
  request/
    photos/
    request.md
  response/
```

`request/request.md` stub — fields only, no reconstructed letter:

```markdown
Номера обращений:
<id from response if any> <agency>

Заголовок:
<short title from response topic>

Текст:
(Текст обращения не сохранился.)
```

`README.md` — short journal: title with the essence, «Текущий статус» noting that only the agency response was saved (appeal text missing from the repo).

Then place the response into `response/` (§6) and continue the normal pipeline. In the report bullet append « — кейс создан без request».

**Statistics for each orphan case created in this run:** `+1` to **Ответов получено** and `+1` to **Обращений подано** (the appeal was not counted before). Measures — by response text as usual (§9).

### 6. Move file

#### 6a. PDF

ext4 allows **255 bytes** per filename. Before `mv`, ensure the destination basename fits that limit (UTF-8 **bytes**, not characters). Matching in §4–5 already used the full name in `inbox/` — truncate only for the destination.

1. Resolve the destination basename (truncate if needed):

```bash
DEST_NAME="$(python3 -c "
import os, sys
src = sys.argv[1]
MAX = 255
base = os.path.basename(src)
if len(base.encode()) <= MAX:
    print(base); raise SystemExit
stem, ext = os.path.splitext(base)
budget = MAX - len(ext.encode())
encoded = stem.encode()
end = budget
while end > 0 and end < len(encoded) and (encoded[end] & 0xC0) == 0x80:
    end -= 1
print(encoded[:end].decode('utf-8') + ext)
" "inbox/file.pdf")"
```

2. Move:

```bash
mkdir -p "<case>/response"
mv "inbox/file.pdf" "<case>/response/$DEST_NAME"
```

Rules:

- If basename ≤ 255 UTF-8 bytes — keep as is (`DEST_NAME` equals the original).
- If longer — cut the **stem from the end**, keep `.pdf`, result ≤ 255 bytes; do not split a multi-byte character. Prefix (outgoing ref, date, `идентификатор： …`) stays; the title tail is what gets shortened.
- Do not overwrite an existing PDF in `response/` without explicit user request — skip and report (including after truncation).
- Do not delete the inbox original if the move fails.
- Do **not** mention truncation in the user-facing report.

#### 6b. ЦППК body `.md`

After a successful match:

1. `mkdir -p "<case>/response"`
2. Destination name:
   - if `<case>/response/response.md` does **not** exist → write/move as `response.md`;
   - if `response.md` already exists (typical intermediate Deptrans reply) → `response-cppk.md` (etalon: `ZAO/public-transport/d4-toilet/2026-07-28/response/response-cppk.md`).
3. Do **not** overwrite an existing `response.md` or `response-cppk.md` without explicit user request — skip and report.
4. Prefer keeping useful frontmatter + body; strip only if the case already uses a plain letter layout and the user expects that style. Default: keep the dumped content (frontmatter + body).

### 7. Run pdf-to-text (PDF only)

After a successful **PDF** move:

1. Read [`.codex/skills/pdf-to-text/SKILL.md`](../pdf-to-text/SKILL.md).
2. Execute its workflow for the **just moved** PDF in `<case>/response/`.
3. Inherit its safety rules:
   - do not silently overwrite existing `response.md`
   - delete `response/_pdf_pages/` after transcription

For ЦППК body `.md` — **skip** this step (text is already in the placed file).

### 8. Extract attached photos

Skip for body `.md` (no PDF pages). For PDFs: after `pdf-to-text` (or when `response.md` already existed and was skipped), check whether the answer attaches photos.

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

At the end of the run — after all files were processed (move + `pdf-to-text` when applicable + optional photo extract) — update [`statistics.md`](../../../statistics.md). Skip this step if no file was successfully moved.

1. Open `statistics.md`.
2. **Ответов получено:** add `+1` for each PDF or ЦППК `.md` successfully moved to a case in this run. Do **not** count files left in `inbox/` or skipped due to a name conflict in `response/`.
3. **Обращений подано:** add `+1` for each **orphan case created** in this run (§5a). Do **not** change this counter for matches into existing cases.
4. **Меры:** for each successfully moved file, read the response text (`response.md` / `response-cppk.md` if created or already present; otherwise the PDF text from step 3) and decide whether measures were taken. Count as measures: disciplinary action, driver review/sanctions, inclusion in a works project, concrete follow-up to a balance holder, or other explicit agency actions beyond a refusal / brush-off. Do **not** count pure refusal, «учтем», or «направлено на рассмотрение» with no outcome.
5. If measures were found:
   - add `+1` to **Мер принято** (or `+N` if one response clearly contains several independent measures — same style as «Автобус 688 ×2»);
   - append a bullet under `## Принятые меры` in the existing style: short, location/object — essence of the measure.
6. If no measures — leave the measures counter and list unchanged.
7. Commit/push of `statistics.md` happens in §11 together with the first case (via `/save` or `/save-selected`), not as a separate agent-side commit outside those skills.

### 10. Report

**First** execute §11 (commit and push). Then print the user-facing report below.

Do **not** wrap the user-facing report in a fenced `text` / code block — Markdown links must stay clickable.

Do **not** use the old technical lines (`inbox/foo.pdf → … (score …)`, `response.md: создан`).

Structure (this order):

Every clickable href in this report is a **repo-relative path** from the
workspace root (same style as [`/new`](../new/SKILL.md)). Click opens the file
in the Cursor editor — desktop and mobile — not on GitHub.

Do **not** use GitHub blob URLs, `file://`, or `cursor://file/…` in this report.
Do **not** percent-encode path segments: keep the real filename (including
`∕`, `：`, spaces); wrap awkward destinations in literal `<…>`.

1. If `statistics.md` was updated in this run:

```markdown
[Статистика](statistics.md) обновлена:
обращений подано 110→111
ответов получено 24→25
мер принято 5→6
```

- Link on the word «Статистика»; href = `statistics.md`.
- Include «обращений подано A→B» only when orphan cases were created (§5a); «мер принято A→B» only if the measures counter changed; always include «ответов получено …» when responses were saved.
- Do **not** repeat measure bullets in the report (they live in `statistics.md`).
- If statistics were not updated — omit this block.

2. Plain line (not a markdown heading): `Сохранённый ответ:` or `Сохранённые ответы:` followed by bullets.
   - **One** successfully saved response — `Сохранённый ответ:`
   - **Two or more** — `Сохранённые ответы:`
3. One bullet per successfully processed file (moved to a case):

```markdown
Сохранённый ответ:

- [PDF](<VAO/bike-friendly-drain-grates/16-th-parkovaya-35/response/17-65-6736∕26_….pdf>), [16-я Парковая, 35](VAO/bike-friendly-drain-grates/16-th-parkovaya-35/response/response.md) — Мосводосток заменил решётку
```

ЦППК body `.md` example (no PDF):

```markdown
- [ответ](ZAO/public-transport/d4-toilet/2026-07-28/response/response-cppk.md), [D4 туалет](ZAO/public-transport/d4-toilet/2026-07-28/response/response-cppk.md) — ЦППК: проверка и требование аутсорсеру
```

Rules for each bullet:

- **PDF:** start with `[PDF](<repo-relative-pdf>)`, then `, `, then the location link and essence.
- **Body `.md`:** start with `[ответ](…/response.md)` or `[ответ](…/response-cppk.md)` (the file just placed), then `, `, then the location link (same file is fine) and essence.
- Targets (paths relative to the repo root, `/` separators):
  - `[PDF]` → the concrete PDF just moved into `<case>/response/` (basename after `mv`, including any §6 truncation);
  - location link → that case’s `response/response.md` (or `response-cppk.md` when that is the saved ЦППК text);
  - `[фото]` → the concrete file from step 8 (e.g. `{case}-result.jpg`), not the folder.
- **Always** wrap the `[PDF]` destination in literal angle brackets: `[PDF](<…/file.pdf>)`. Mos.ru basenames are long and contain special characters; `<…>` keeps the markdown link intact.
- For `response.md` / photo paths without spaces or exotic characters, plain `(path)` is fine; if unsure, use `<…>` too.
- Link text for the second link = location/object only (before the dash). After that link: ` — essence` of the agency reply (same style as measure bullets in `statistics.md`).
- Write the summary from the response already read (after `pdf-to-text` or from the placed `.md`); do not invent.
- No long quotes; no score in the normal case.
- Low-confidence match: after the bullet, a short note + 2–3 alternatives.
- Orphan case created (§5a): after the essence, append ` — кейс создан без request`.
- If `response.md` was skipped (already existed) for a PDF: `[PDF](<…>), [location](…/response.md) — essence — пропущен` (or `[PDF](<…>), [location](…/response.md) — пропущен` if there is no text).
- If photos were extracted in step 8: append to the same bullet `, [фото](…/photos/….jpg)` (use `<…>` if needed). Example:

```markdown
- [PDF](<VAO/…/16-th-parkovaya-18/response/….pdf>), [16-я Парковая, 18](VAO/…/16-th-parkovaya-18/response/response.md) — Мосводосток заменил решётку, [фото](VAO/…/photos/16-th-parkovaya-18-result.jpg)
```

- Several photos: `, [фото](path1), [фото 2](path2)`.
- If photo extraction was triggered but found nothing / failed deps: one short note, do not invent files or a `[фото]` link.

4. If there was **at least one** successfully saved response in this run — end with **exactly** this line (NBSP after «в» and «ваш»):

```markdown
Отправлю в ваш Телеграм-канал?
```

- Do **not** list cases again; do **not** mention `/telegram-report` to the user.
- Do **not** publish yet — wait for agreement («да», «отправь», «в тг», …).
- On agreement: read and execute [`telegram-report`](../telegram-report/SKILL.md) for each successfully processed case from the «Сохранённые ответы» list (processing order). If the user names one case — only that case.
- If there were no successfully saved responses — omit this question.

5. Do **not** print an Apply / «нажмите Apply» footer — saving is done in §11 before or as part of finishing the run. Rely on the short `/save` or `/save-selected` report for commit/push confirmation; do not duplicate a long save narrative in the inbox report.

Pure `/inbox` (no mail) does **not** print a Gmail / Mos-ru intro — only the blocks above.

### 11. Commit and push (immediate — no Apply)

Do **not** ask for confirmation (no AskQuestion / no «ок»). After steps 1–9 (all files processed, `statistics.md` updated when applicable), save **before** finishing — do not wait for the user to Apply files.

Count **successful cases** = files (PDF or ЦППК `.md`) successfully moved to a case in this run (same set as in §9), including newly created orphan cases (§5a).

**One successful case:**

1. `git add .`
2. Read and execute [`/save`](../save/SKILL.md) (full skill workflow: commit message rules, commit, push, report).

**Several successful cases** (same order as processing):

For each case `i = 1..N`:

1. Build an explicit path list:
   - `<case_i>/` (for orphan cases: `README.md`, `request/`, `response/`) or at least `<case_i>/response/` (PDF, `response.md`, `response-cppk.md`, `photos/`, …)
   - If `i == 1` **and** `statistics.md` was changed in this run — also include `statistics.md`
2. Read and execute [`/save-selected`](../save-selected/SKILL.md), **passing that path list**.
3. `/inbox` itself does **not** run `git add` for the multi-case path — staging is `/save-selected`’s job.

Limits:

- One case → one `/save` commit (may include unrelated dirty files because of `git add .`).
- N cases → N `/save-selected` commits; first usually carries `statistics.md`.
- Skipped files and unrelated dirty files are not added to `/save-selected` lists.

## Safety Rules

- Process `*.pdf` and ЦППК `ЦППК_*.md` dumps from `inbox/` only in v1.
- Do not batch-process response files outside `inbox/` unless the user explicitly asks.
- Do not silently overwrite existing `response.md` / `response-cppk.md` or duplicate PDFs in `response/`.
- Before `mv` of a PDF, ensure the destination basename is ≤ 255 UTF-8 bytes (ext4 limit); truncate the stem from the end if needed (§6a).
- Do not invent measures or change statistics counters except from successfully processed responses in this run (and **Обращений подано** only for orphan cases created in §5a).
- Do not invent appeal text in orphan `request/request.md` — use exactly `(Текст обращения не сохранился.)` under `Текст:`.
- Do not invent photo files; only save what `extract-response-photos` actually writes.
- Commit and push only via `/save` (single case) or `/save-selected` (several cases); do not rely on an Apply / `afterFileEdit` hook.
- Do not post to Telegram from `/inbox` without the user’s explicit agreement after the «Отправлю в ваш Телеграм-канал?» offer; on agreement delegate to [`telegram-report`](../telegram-report/SKILL.md).
- In the user-facing report use **repo-relative** Markdown links only (open in Cursor editor / mobile). Do **not** use GitHub blob URLs, `file://`, or `cursor://file/…`.

## Expected User Phrases

- `@inbox`
- «Разбери inbox»
- «Распредели PDF из inbox»
- «Обработай ответы из inbox»
