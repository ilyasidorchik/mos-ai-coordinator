---
name: mosru
description: >-
  Opens https://mos.ru/feedback/reception/ in Cursor Browser Tab. Use when the
  user invokes /mosru, mentions «открой mos.ru», «электронная приёмная», or
  wants the mos.ru feedback reception page opened in Browser Tab.
disable-model-invocation: true
---

# Open mos.ru Reception

## Overview

Open the Moscow electronic reception page in **Browser Tab** (MCP `cursor-ide-browser`). Do nothing else: no form fill, no login, no recipient selection, no submit.

URL: `https://mos.ru/feedback/reception/`

## Workflow

1. Check that Browser Tab tools (`cursor-ide-browser`) are available.
2. `browser_tabs` (list) → `browser_navigate` to the URL with `position: "active"`.
3. Briefly tell the user the page is open in Browser Tab.

## If Browser Tab is unavailable

Stop. Do **not** open the URL in system Chrome/Safari or any other fallback.

Tell the user to enable **Settings → Tools & MCP → Browser Automation → Browser Tab** (and authorize if needed), then invoke `/mosru` again.

## Safety rules

- Do not fill the form.
- Do not automate login.
- Do not select a recipient.
- Do not click submit.
- Do not parse `request.md` or open Finder.
