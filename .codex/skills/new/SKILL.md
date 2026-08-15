---
name: new
description: >-
  Creates folder structure for a new Moscow agency appeal case (or the next
  attempt-N in a series) and immediately drafts request.md. If the prompt
  contains «по шаблону», drafts from the supplied template. Use when the user
  mentions /new, «Создай обращение», «Новое обращение», or «Заведи кейс».
disable-model-invocation: true
---

# New Appeal Case

## Overview

Create the case folder and draft `request.md` in the same pass.
End the reply with a link to `request.md` and open it in the editor.

1. Resolve district / topic / case name (and whether this is a repeat).
2. Create the correct folder structure.
3. Find 1–2 similar cases and link them.
4. Immediately fill `Заголовок:` and `Текст:` in `request.md` (do **not** ask
   whether to draft). If the prompt contains **«по шаблону»**, follow that
   template.

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
| Template? | Phrase «по шаблону» → draft from the template in the prompt |

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

### 3. Write `request.md`

Use this skeleton and fill `Заголовок:` and `Текст:` in the same pass (see
«When drafting»). Put the agency short name under `Номера обращений:` from
Agency hint (default `Дептранс`; if the user names another — its short name).
Do not invent appeal numbers. For several agencies — one short name per line,
still without numbers:

```markdown
Номера обращений:
Дептранс

Заголовок:


Текст:

```

Leave `photos/` empty. Do not add `.gitkeep` unless the repo already uses it for that case.

### 4. Report and draft

1. Tell the user the created path (and if the case was converted to a series).
2. Find **1–2 similar** cases in the repo (same topic, location, or problem type). Prefer reading nearby `request.md` titles. Give relative links to those `request.md` files or case roots.
3. Immediately draft into `request.md`. If the prompt contains **«по шаблону»**, follow the supplied template (adapt location/facts from the prompt). Do **not** ask whether to draft.
4. After writing `request.md`, open it in the editor:
   `cursor -g "<repo-relative-or-absolute-path-to-request.md>"`
   If the command fails, continue; the chat link is enough.
5. End the user-facing reply with a markdown link to the created
   `request.md` (repo-relative path), e.g.
   `[request.md](UVAO/cycling/sovkhoznaya-cycle-stop/request/request.md)`.

## When drafting

Always fill `Заголовок:` and `Текст:` as part of `/new`.

- Tone and structure: [`AGENTS.md`](../../../AGENTS.md).
- Use the similar cases as style examples.
- For «по шаблону»: follow the user’s template closely; substitute the concrete
  location, dates, and facts from the prompt — do not invent details absent there.
- For a series: read prior `attempt-*/request/request.md` and `response/response.md`; argue from real replies, do not invent реквизиты.
- Do **not** run `prepare-request` / `typograf` unless the user asks.
- Put the agency short name under `Номера обращений:` immediately (default
  `Дептранс`). Add the appeal number only after submission assigns one.

## Expected user phrases

- `/new`
- `Создай обращение`
- `Новое обращение`
- `Заведи кейс`
- «по шаблону» (with a template in the prompt) → draft from that template

## Safety rules

- Do not submit on mos.ru or invoke `submit-request`.
- Do not run `prepare-request` / `typograf` before there is appeal text.
- Do not invent appeal numbers, dates, or agency reply реквизиты.
- Do not rewrite an already sent `request.md` from a previous attempt.
- Do not commit unless the user says `/save` or «Сохранись».
