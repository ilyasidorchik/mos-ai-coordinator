---
name: new
description: >-
  Creates folder structure for a new Moscow agency appeal case (or the next
  attempt-N in a series). By default does not draft text until the user agrees;
  if the prompt contains «по шаблону», drafts immediately from the supplied
  template. Use when the user mentions /new, «Создай обращение»,
  «Новое обращение», or «Заведи кейс».
disable-model-invocation: true
---

# New Appeal Case

## Overview

Create the case folder and a stub `request.md`.

1. Resolve district / topic / case name (and whether this is a repeat).
2. Create the correct folder structure.
3. Find 1–2 similar cases and link them.
4. Drafting:
   - Default: ask whether to draft into the new `request.md`.
   - If the user message contains **«по шаблону»**: fill `request.md` immediately
     from the template in the prompt — do **not** ask about drafting.

Follow structure and naming from [`AGENTS.md`](../../../AGENTS.md). Series
journal format: [`SVAO/pedestrian-crossings/zapovednaya/`](../../../SVAO/pedestrian-crossings/zapovednaya/).

## Workflow

### 1. Parse the request

From the user message and open context extract:

| Field | Notes |
|-------|--------|
| District | `SVAO`, `VAO`, `ZAO`, … |
| Topic | e.g. `pedestrian-crossings`, `public-transport` |
| Case name | Latin, kebab-case, short; no `attempt` in the name |
| Agency hint | Default Дептранс unless the user names another |
| Repeat? | Link to an existing case, prior appeal number, «повторно», «в ответ на…», «следующая итерация», open `response/response.md` |
| Template? | Phrase «по шаблону» → draft immediately from the template in the prompt |

If district, topic, or case name is ambiguous — ask **one** clarifying question.
Do not invent a path.

### 2. Choose structure

**New single case** — create:

```text
<district>/<topic>/<case>/
  request/
    photos/
    request.md
  response/
```

**Repeat in an existing series** (`attempt-*` already present):

1. Create the next `attempt-N/` with `request/photos/`, `request/request.md`, `response/`.
2. Update the case-root `README.md`: «Текущий статус» + a chronology row (appeal number `—` until submitted).

**Repeat on a flat case** (`request/` + reply materials, no `attempt-*`):

1. Move existing `request/` and `response/` into `attempt-1/`.
2. Create `attempt-2/request/{photos/,request.md}` and `attempt-2/response/`.
3. Create case-root `README.md` (title, location if known, status, chronology table).

Never create sibling folders like `case-attempt-2`.

### 3. Stub `request.md`

Write only the labels — no title text, no body, no invented appeal numbers:

```markdown
Номера обращений:


Заголовок:


Текст:

```

Leave `photos/` empty. Do not add `.gitkeep` unless the repo already uses it for that case.

If the prompt contains **«по шаблону»**, skip leaving an empty stub: after creating
folders, immediately fill `Заголовок:` and `Текст:` (see «When drafting»).

### 4. Report and ask

1. Tell the user the created path (and if the case was converted to a series).
2. Find **1–2 similar** cases in the repo (same topic, location, or problem type). Prefer reading nearby `request.md` titles. Give relative links to those `request.md` files or case roots.
3. Drafting branch:
   - **«по шаблону»** in the user message: draft into `request.md` now from the
     supplied template (adapt location/facts from the prompt). Do **not** ask
     whether to draft.
   - Otherwise ask exactly (or very close):

> Набросать черновик прямо в созданный `request.md`?

## When drafting

Fill `Заголовок:` and `Текст:` after the user agrees to draft, **or** immediately
when the prompt contains **«по шаблону»**.

- Tone and structure: [`AGENTS.md`](../../../AGENTS.md).
- Use the similar cases as style examples.
- For «по шаблону»: follow the user’s template closely; substitute the concrete
  location, dates, and facts from the prompt — do not invent details absent there.
- For a series: read prior `attempt-*/request/request.md` and `response/response.md`; argue from real replies, do not invent реквизиты.
- Do **not** run `prepare-request` / `typograf` unless the user asks.
- Leave `Номера обращений:` empty until submission assigns a number.

## Expected user phrases

- `/new`
- `Создай обращение`
- `Новое обращение`
- `Заведи кейс`
- Affirmative reply after the draft question → write the draft
- «по шаблону» (with a template in the prompt) → write the draft immediately, no ask

## Safety rules

- Do not submit on mos.ru or invoke `submit-request`.
- Do not run `prepare-request` / `typograf` before there is appeal text.
- Do not invent appeal numbers, dates, or agency reply реквизиты.
- Do not rewrite an already sent `request.md` from a previous attempt.
- Do not commit unless the user says `/save` or «Сохранись».
