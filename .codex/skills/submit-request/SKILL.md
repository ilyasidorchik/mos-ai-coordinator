---
name: submit-request
description: >-
  Fills and submits an appeal on mos.ru/feedback/reception/ from request.md
  using Cursor Browser Tab. Photo upload is handed off to the user. Use when
  the user asks to submit an appeal on mos.ru, mentions «Отправь обращение»,
  «Подай обращение», «Заполни форму на mos.ru», or wants browser automation
  for Дептранс reception.
disable-model-invocation: true
---

# Submit mos.ru Appeal

## Overview

Submit an appeal from a case `request/request.md` via **Browser Tab** (MCP `cursor-ide-browser`).

Agent fills the form; **user attaches photos manually** — CDP file upload is blocked in Browser Tab.

## Prerequisites

Before starting, verify:

1. **Browser Tab** enabled: Settings → Tools & MCP → Browser Automation → Browser Tab.
2. Photos in `request/photos/` are each **under 5 MB** (run `compress-photo` if needed).
3. `request.md` is ready (`prepare-request` if user asked for editorial pass).

Login is **not** assumed from prerequisites — always verify it in Step 0 after opening the page.

If Browser Tab tools are unavailable, stop and tell the user to enable Browser Tab and authorize in it.

## Parse request.md

Read the case `request/request.md`:

| Block | Use in form |
|-------|-------------|
| Line after `Номера обращений:` | Agency short name (e.g. `Дептранс`; strip leading appeal number if present) |
| After `Заголовок:` | Field «Тема обращения» |
| After `Текст:` until end | Field «Текст обращения» (plain text, no service headers) |

Preserve the extracted title and appeal text **byte-for-byte except for the removed service headers**. Do not manually retype, reconstruct, normalize, or "clean up" the text while filling the form: this can silently remove typography such as non-breaking spaces. Prefer extracting the blocks from the already-read `request.md` into variables and passing those exact strings to the browser fill tool.

Also read `request/photos/` — list every file to attach. Derive address hint from text or coordinates if present; otherwise ask the user.

### Agency search strings

| Short name in request.md | Search in recipient picker |
|--------------------------|----------------------------|
| Дептранс | `Департамент транспорта` |
| ДКР | `Департамент капитального ремонта` |
| ЦОДД | `Центр организации дорожного движения` |

If the short name is unknown, ask the user for the search string before continuing.

## Browser workflow

Follow `cursor-ide-browser` lock order: `browser_tabs` → `browser_navigate` → `browser_lock` → interactions → `browser_unlock`.

URL: `https://mos.ru/feedback/reception/`

### Step 0 — Login check (required)

After navigate + lock, **before** filling the form, confirm the user is logged in to mos.ru **in Browser Tab** (session is separate from system Chrome/Safari).

**Logged out** — only an explicit login wall:

- heading or banner «Войдите в личный кабинет»;
- button «Войти в личный кабинет»;
- close variants of the same sense («войдите … в личный кабинет»);
- redirect to login / sudir / oauth.

If unsure on the landing page, click «Отправить обращение» and check whether that banner appears.

**Do not treat as logged out:**

- the link «войдите в учетную запись» in the block «Как подать обращение от организации» — it is present for logged-in users too;
- absence of «Меню пользователя» alone.

**Logged in:**

- no «Войдите в личный кабинет» banner on the reception page;
- after «Отправить обращение», the recipient / applicant flow opens, not the login wall;
- on the applicant step, full name and email from the account are shown.

If logged out:

1. `browser_lock` → `unlock`.
2. Stop automation. Hand control to the user.
3. Tell them clearly:

> Войдите в mos.ru в **Browser Tab** (не в обычном браузере). Когда войдёте и снова откроется электронная приёмная, напишите «вошёл» / «продолжай».

4. Do **not** continue with recipient selection or form fill until the user confirms.
5. After confirmation: lock again, re-check Step 0 (snapshot/CDP). If still logged out, hand off once more. Only then proceed to Step 1.

### Step 1 — Recipient

1. Click «Выбрать получателя» / «Отправить обращение» if on landing page.
2. Fill search with agency string from table above.
3. Select the matching row. If radio buttons do not respond to `browser_click` (hidden inputs), use `browser_cdp` → `Runtime.evaluate` to click the radio or its label.
4. Confirm selection («Выбрать») and click «Продолжить».

### Step 2 — Skip or confirm

Click «Продолжить» through intermediate steps until the appeal form (theme + text) appears.

### Step 3 — Theme, text, address

1. Fill «Тема обращения» and «Текст обращения» with the exact strings extracted from `request.md`.
2. After filling, inspect the DOM value of both fields and compare it with the extracted strings. If they differ in meaningful characters or typography (including NBSP `\u00A0`, guillemets, dashes, `№`, or `ё`), replace the field value before continuing.
3. Fill address field with a specific Moscow query (e.g. `улица Заповедная, Москва`), pick the correct suggestion from the dropdown.
4. **Verify city is Москва**, not another region. If autocomplete picks the wrong city, re-search or use checkbox «Адреса нет в списке» and enter address manually.
5. Do **not** click «Продолжить» to step 4 until photos are attached (next section).

### Step 3½ — Photo upload (USER)

**Stop automation. Hand off to the user.**

Tell the user clearly:

> Прикрепите все файлы из `<case>/request/photos/` через «Добавить файл» на текущем шаге формы. Когда закончите, напишите «готово» / «фото приложены».

Optionally open the photos folder in Finder:

```bash
open "<absolute-path-to-case>/request/photos/"
```

**Do not** attempt:

- `DOM.setFileInputFiles` via CDP — denied in Browser Tab;
- AppleScript / system file dialogs — unreliable.

Wait for user confirmation before proceeding.

### Step 4 — Confirm and submit

After user confirms photos:

1. Click «Продолжить» to reach step 4/4 if not already there.
2. Check required consent checkboxes. If they are hidden (`opacity: 0`), use `Runtime.evaluate` to click unchecked boxes.
3. Read captcha from `browser_take_screenshot`, fill the captcha field.
4. **Submit only if the user explicitly asked** (e.g. «отправь», «можно отправлять»). Otherwise stop before «Отправить обращение» and ask for approval.
5. After successful submit, copy the appeal number from the confirmation page.
6. Write it to `request.md` under `Номера обращений:` in format `<number> <agency>`, preserving existing numbers on separate lines if this is a repeat appeal.

Example:

```markdown
Номера обращений:
57749568 Дептранс
```

## Safety rules

- Default: **do not submit** without explicit user approval.
- Do not manually reconstruct appeal text for the form. Preserve typography from `request.md`, especially non-breaking spaces.
- Do not invent appeal numbers, addresses, or agency names.
- **Always run Step 0.** If not logged in, unlock Browser Tab and hand off — do not guess credentials or automate login.
- If captcha fails, report and retry once; then ask user to help.
- After four failed actions on the same step, stop and report blocker + suggested next step.

## Expected user phrases

- `Отправь обращение` / `Подай обращение на mos.ru`
- `Заполни форму из @case/request/request.md`
- `Вошёл` / `Продолжай` — after manual mos.ru login in Browser Tab
- `Продолжай` / `Фото приложены` / `Готово` — after manual photo upload
- `Отправляй` / `Можно отправлять` — permission to submit

## Report to user

When done (or paused for login/photos), summarize:

- login status (Step 0);
- current form step;
- what was filled (recipient, theme, address);
- photo handoff status;
- appeal number if submitted;
- whether `request.md` was updated.
