---
name: prepare-request
description: >-
  Reviews request.md for spelling, punctuation, factual and semantic errors,
  applies minimal fixes, then runs typograf. Use when the user asks to prepare
  an appeal, mentions «Подготовь обращение к отправке», «Проверь обращение, «Проверь request»,
  «Вычитай обращение», or wants a final editorial pass before submission.
disable-model-invocation: true
---

# Prepare Request

## Overview

Final editorial pass on `request/request.md` in a case folder:

1. Check spelling, punctuation, factual accuracy, and semantic coherence.
2. Fix clear errors in place with minimal rewrites.
3. Run the [`typograf`](../typograf/SKILL.md) skill on the same file.

Do not duplicate typography rules here — always delegate step 3 to `typograf`.

## Workflow

### 1. Resolve the target

- Prefer `request/request.md` in the case folder the user is working in.
- If the user gave an explicit path, use it.
- If several cases are open, ask which `request.md` to prepare.

### 2. Gather context

Before editing, read:

| Source | Why |
|--------|-----|
| Target `request.md` | Text to check |
| `response/response.md` and related PDFs in the case | Quotes, numbers, dates, agency wording |
| `request/photos/` | Verify every mentioned filename exists |
| Parent or related cases in the repo | Cross-references, precedent appeals, earlier request numbers |
| [`AGENTS.md`](../../../AGENTS.md) | Expected structure and tone |

Do not invent facts, document numbers, dates, or photo names. If something cannot be verified from repo materials, flag it to the user instead of guessing.

### 3. Spelling and punctuation

Check and fix:

- орфография и опечатки;
- запятые, тире, двоеточия, согласование времён и падежей;
- единообразие терминов (НГПТ, ЦОДД, «Заповедная улица» и т. п.);
- лишние или пропущенные пробелы (обычные; NBSP — на шаге typograf).

Preserve the case's established tone: спокойный, предметный, без лишней эмоциональности.

### 4. Factual checks

Verify against repo materials:

- номера обращений и ответов ведомств;
- даты и реквизиты ответов;
- адреса, координаты, названия остановок и объектов;
- ссылки на ГОСТ, ПДД, пункты нормативов;
- имена файлов в `request/photos/`;
- числа (расстояния, количество жителей, годы).

If a quote from an official response is used, open the source and match wording. Do not «улучшать» цитаты.

### 5. Semantic checks

Check that the appeal:

- имеет понятную структуру: заголовок, обращение, локация, проблема, аргументация, просьба;
- не противоречит сам себе и ранее процитированным ответам;
- логично связывает факты с просьбой;
- не ссылается на несуществующие приложения;
- не раздувается лишними повторами.

Fix only what is clearly wrong or confusing. Do not rewrite the whole text unless the user asks.

### 6. Apply edits

- Edit `request.md` in place.
- Keep changes minimal and explainable.
- Do not rename files or restructure the case folder.

### 7. Run typograf

Read [`.codex/skills/typograf/SKILL.md`](../typograf/SKILL.md) and apply it to the same `request.md`.

Typography is the **last** step — do not typograf before factual and semantic fixes are done.

### 8. Report to the user

Brief summary:

- what was fixed (орфография, пунктуация, факты, смысл);
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
- Do not prepare files outside the repo unless the user explicitly asks.
