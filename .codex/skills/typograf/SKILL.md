---
name: typograf
description: >-
  Applies Russian typography rules to appeal texts and markdown files in the
  repository: guillemets, em dashes, non-breaking spaces. Use when the user
  asks to typograf text, mentions «оттипографировать», «типографика»,
  «оттипографируй», or wants typography fixes in request.md or other texts.
---

# Typograf

## Overview

Apply Russian typography to the text the user points to. Edit the file in place unless the user asks for a copy or preview only.

Typical targets: `request/request.md`, draft paragraphs in case folders.

## Rules

Если пользователь просит оттипографировать текст, нужно в том числе:

- использовать русские кавычки «…»;
- использовать длинное тире;
- ставить неразрывные пробелы перед короткими предлогами, союзами и числами там, где это уместно.

## Workflow

1. Resolve the target file or pasted text.
2. Apply the rules above without changing meaning, structure, or factual content.
3. Do not rewrite style beyond typography unless the user asks.
4. Save the file and briefly note what was changed.

## Expected user phrases

- `Оттипографируй текст`
- `Оттипографируй request.md`
- `Приведи к типографике`
- `@case/request/request.md` with a typography request

## Safety rules

- Do not alter quotes from official responses; preserve their wording.
- Do not change numbers, dates, addresses, or reference numbers.
- Do not typograf files outside the repo unless the user explicitly asks.
