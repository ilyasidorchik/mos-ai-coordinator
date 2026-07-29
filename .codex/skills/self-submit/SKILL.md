---
name: self-submit
description: >-
  Semi-automated fill of mos.ru/feedback/reception/ from request.md via Cursor
  Browser Tab: agent opens the page, user picks the recipient, then agent fills
  theme, text from request.md, address (no dropdown pick), checkboxes and captcha,
  opens photos in Finder and hands control back. Use when the user invokes
  /self-submit, mentions «заполни форму сам», «self-submit», or wants a
  handoff-first mos.ru form fill without agent selecting the agency.
disable-model-invocation: true
---

# Self-submit mos.ru Appeal

## Overview

Fill an appeal form from a case `request/request.md` via **Browser Tab** (MCP `cursor-ide-browser`), with **user-owned** recipient selection and photo attach.

Unlike `submit-request`, the agent **does not** choose the recipient, **does not** pick an address from the autocomplete dropdown, and **does not** submit the appeal. After filling fields / captcha, the agent opens `request/photos/` in Finder and hands control back.

## Prerequisites

Before starting, verify:

1. **Browser Tab** enabled: Settings → Tools & MCP → Browser Automation → Browser Tab.
2. Photos in `request/photos/` are each **under 5 MB** (run `compress-photo` if needed).
3. `request.md` is ready (`prepare-request` if user asked for editorial pass).

If Browser Tab tools are unavailable, stop and tell the user to enable Browser Tab and authorize in it.

## Parse request.md

Read the case `request/request.md`:

| Block | Use in form |
|-------|-------------|
| After `Заголовок:` | Field «Тема обращения» |
| After `Текст:` until end | Field «Текст обращения» (plain text, no service headers) |

Preserve the extracted title and appeal text **byte-for-byte except for the removed service headers**. Do not typograf, retype, reconstruct, normalize, or “clean up” the text while filling the form: `request.md` is already typografed; rewriting can silently drop NBSP (`\u00A0`), guillemets, dashes, `№`, or `ё`. Prefer extracting the blocks into variables and passing those exact strings to the browser fill tool.

Also read `request/photos/` — list every file the user will attach. Derive an address string from the appeal text or coordinates if present; otherwise ask the user before Step 1.

Agency / recipient from `Номера обращений:` is **informational only** here — the user selects the recipient in the browser.

## Browser workflow

Follow `cursor-ide-browser` lock order: `browser_tabs` → `browser_navigate` → `browser_lock` → interactions → `browser_unlock`.

URL: `https://mos.ru/feedback/reception/`

### Step 0 — Open page and hand off (recipient)

1. `browser_tabs` (list) → `browser_navigate` to the URL → `browser_lock`.
2. Optionally check for an explicit login wall («Войдите в личный кабинет» / «Войти в личный кабинет» / sudir redirect). If logged out, unlock and tell the user to sign in **in Browser Tab**, then wait for «вошёл» / «продолжай».
3. **Do not** click recipient search, choose a department, or advance past recipient selection for the user.
4. `browser_lock` → `unlock`. Hand control to the user.

Tell the user clearly:

> Открыта электронная приёмная mos.ru в **Browser Tab**. Выберите получателя, пройдите шаги до формы с полями «Тема обращения» и «Текст обращения». Когда форма готова к заполнению, напишите «форма готова» / «продолжай».

Wait for that confirmation before Step 1. Do **not** lock and fill until then.

### Step 1 — Theme, text, address (agent)

After the user confirms the form is ready:

1. `browser_lock` again. Snapshot/CDP: confirm fields «Тема обращения» and «Текст обращения» are visible. If not, unlock and ask the user to finish navigating.
2. Fill «Тема обращения» and «Текст обращения» with the exact strings extracted from `request.md`.
3. After filling, inspect the DOM value of both fields and compare with those strings. If they differ in meaningful characters or typography (including NBSP `\u00A0`, guillemets, dashes, `№`, or `ё`), replace the field value before continuing.
4. Fill the address field with a specific Moscow query (e.g. `улица Заповедная, Москва`).
5. **Do not** select a suggestion from the address autocomplete dropdown. Type the address only; leave dropdown choice to the user if the form requires it later.
6. Do **not** click «Отправить обращение».

### Step 2 — Checkboxes and captcha (agent)

1. Check required consent checkboxes. If they are hidden (`opacity: 0`), use `browser_cdp` → `Runtime.evaluate` to click unchecked boxes.
2. For a **visual** captcha image: use `browser_take_screenshot`, read the characters, fill the captcha field.
3. If captcha is not a simple visual challenge, fails once after retry, or is unclear — unlock and ask the user to complete it.
4. **Never** submit the form in this skill.

### Step 3 — Photos folder + hand off (user)

1. Open the case photos folder in Finder:

```bash
open "<absolute-path-to-case>/request/photos/"
```

2. `browser_lock` → `unlock`.
3. Hand control to the user for file attach (and any remaining address dropdown / submit).

Tell the user clearly:

> Поля заполнены. Папка `request/photos/` открыта в Finder. Прикрепите файлы через «Добавить файл», при необходимости уточните адрес в выпадающем списке и отправьте обращение сами. Когда закончите (или если нужна помощь), напишите в чат.

**Do not** attempt:

- `DOM.setFileInputFiles` via CDP — denied in Browser Tab;
- AppleScript / system file dialogs — unreliable;
- clicking «Отправить обращение» on behalf of the user.

## Safety rules

- **Never submit** the appeal in this skill — user sends it.
- **Never** select the recipient / agency in the picker — user does that.
- **Never** pick an address from the autocomplete dropdown — only type into the field.
- Do not invent addresses, appeal numbers, or agency names.
- Do not run `typograf` in this skill. Take text as already written in `request.md`; do not strip non-breaking spaces.
- Do not automate login credentials.
- If captcha fails, report and retry once; then hand off to the user.
- After four failed actions on the same step, stop and report blocker + suggested next step.

## Expected user phrases

- `/self-submit` / `Self-submit` / `Заполни форму сам`
- `Форма готова` / `Продолжай` — after user chose recipient and reached the form
- `Вошёл` / `Продолжай` — after manual mos.ru login in Browser Tab (if needed)

## Report to user

At each pause (and when agent work is done), summarize:

- whether the reception page was opened;
- handoff status (waiting for recipient / form ready / photos);
- what was filled (theme, address typed, checkboxes, captcha);
- that photos folder was opened in Finder (path);
- that submit remains the user’s step.
