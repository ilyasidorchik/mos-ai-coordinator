---
name: prepare-request
description: >-
  Prepares an appeal for submission: renames and compresses all photos in
  request/photos/, then reviews request.md for spelling, punctuation, factual
  and semantic errors, applies minimal fixes, and runs typograf. Use when the
  user asks to prepare an appeal, mentions «Подготовь обращение к отправке»,
  «Проверь обращение», «Проверь request», «Вычитай обращение», or wants a final
  pass before submission.
disable-model-invocation: true
---

# Prepare Request

## Overview

Final preparation of a case before submission:

1. Rename all photos in `request/photos/` via [`rename-photo`](../rename-photo/SKILL.md).
2. Compress each photo in that folder via [`compress-photo`](../compress-photo/SKILL.md).
3. Check `request/request.md` for spelling, punctuation, factual accuracy, and semantic coherence.
4. Fix clear errors in place with minimal rewrites.
5. Run the [`typograf`](../typograf/SKILL.md) skill on the same file.

Do not duplicate photo-naming, compression, or typography rules here — always delegate to those skills.

## Workflow

### 1. Resolve the target

- Prefer `request/request.md` in the case folder the user is working in.
- If the user gave an explicit path, use it.
- If several cases are open, ask which `request.md` to prepare.
- Photos live in the sibling `photos/` next to that `request.md` (e.g. `request/photos/` or `attempt-N/request/photos/`).

### 2. Rename photos

If the photos folder is missing or has no supported images (`.jpg`, `.jpeg`, `.png`, `.webp`, `.heic` and upper-case variants) — skip this step and step 3.

Otherwise read [`.codex/skills/rename-photo/SKILL.md`](../rename-photo/SKILL.md) and apply it to **all** images in that folder. Do not invent rename rules here.

### 3. Compress photos

After rename, read [`.codex/skills/compress-photo/SKILL.md`](../compress-photo/SKILL.md) and run it **once per image** in the same folder (the compress skill is single-file). Process every image left after rename.

Order is mandatory: rename first, then compress.

### 4. Gather context

Before editing, read:

| Source | Why |
|--------|-----|
| Target `request.md` | Text to check |
| `response/response.md` and related PDFs in the case | Quotes, numbers, dates, agency wording |
| `request/photos/` | Verify every mentioned filename exists (use names **after** rename) |
| Parent or related cases in the repo | Cross-references, precedent appeals, earlier request numbers |
| [`AGENTS.md`](../../../AGENTS.md) | Expected structure and tone |

Do not invent facts, document numbers, dates, or photo names. If something cannot be verified from repo materials, flag it to the user instead of guessing.

### 5. Spelling and punctuation

Check and fix:

- орфография и опечатки;
- запятые, тире, двоеточия, согласование времён и падежей;
- единообразие терминов (НГПТ, ЦОДД, «Заповедная улица» и т. п.);
- лишние или пропущенные пробелы (обычные; NBSP — на шаге typograf).

Preserve the case's established tone: спокойный, предметный, без лишней эмоциональности.

### 6. Factual checks

Verify against repo materials:

- номера обращений и ответов ведомств;
- даты и реквизиты ответов;
- адреса, координаты, названия остановок и объектов;
- ссылки на ГОСТ, ПДД, пункты нормативов;
- имена файлов в `request/photos/`;
- числа (расстояния, количество жителей, годы).

If a quote from an official response is used, open the source and match wording. Do not «улучшать» цитаты.

### 7. Semantic checks

Check that the appeal:

- имеет понятную структуру: заголовок, обращение, локация, проблема, аргументация, просьба;
- не противоречит сам себе и ранее процитированным ответам;
- логично связывает факты с просьбой;
- не ссылается на несуществующие приложения;
- не раздувается лишними повторами.

Fix only what is clearly wrong or confusing. Do not rewrite the whole text unless the user asks.

### 8. Apply edits

- Edit `request.md` in place.
- Keep changes minimal and explainable.
- Do not restructure the case folder. Photo renames happen only via step 2 (`rename-photo`).

### 9. Run typograf

Read [`.codex/skills/typograf/SKILL.md`](../typograf/SKILL.md) and apply it to the same `request.md`.

Typography is the **last** editorial step — do not typograf before factual and semantic fixes are done.

### 10. Report to the user

Brief summary:

- photos: how many renamed / compressed / skipped; confirm all are under 5 MB, or list any that are still larger;
- what was fixed in the text (орфография, пунктуация, факты, смысл);
- what could not be verified and needs the user's input;
- confirmation that typograf was applied.

## Expected user phrases

- `Подготовь обращение`
- `Проверь request.md перед отправкой`
- `Вычитай обращение`
- `@case/request/request.md` with a prepare/review request

## Safety rules

- Do not change meaning of official quotes.
- Do not add new arguments or facts the user did not provide.
- Do not remove historical references or appeal numbers.
- Do not rename or compress photos outside the target case `photos/` folder.
- Do not prepare files outside the repo unless the user explicitly asks.
- Do not commit unless the user says `/save` or «Сохранись».
