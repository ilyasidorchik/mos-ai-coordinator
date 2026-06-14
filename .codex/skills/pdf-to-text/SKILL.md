---
name: pdf-to-text
description: >-
  Converts an official response PDF in a case `response/` directory into
  `response.md` by rendering page screenshots and transcribing the text.
  Use when the user asks to convert a response PDF to text, mentions
  `pdf to text`, `response pdf`, `response.md`, `Расшифруй ответ`,
  `Переведи ответ в текст`, or `Сохрани ответ как текст`.
---

# PDF to Text

## Overview

Use this skill for the narrow repository workflow where the agent opens a newly
added PDF file in a case `response/` directory, renders screenshot(s) of it, and
transcribes the text from the screenshot(s) into a new `response.md` file in the
same directory.

Preserve the source wording. Do not improve style, summarize, or rewrite the response. Produce a clean Markdown transcription that is easy to quote later.

## Workflow

1. Determine the case directory.

- Prefer the current working area if the user is already inside a case folder.
- Otherwise use an explicit PDF path from the user, but only when that PDF lives in a `response/` directory.

2. Locate the source PDF.

- Look inside the case `response/` directory for PDF files.
- If exactly one PDF exists, use it automatically.
- If multiple PDFs exist, stop and ask the user which file to transcribe.
- If no PDF exists, report that clearly and stop.

3. Check the target Markdown file.

- Target path is always `response/response.md`.
- If `response.md` already exists and the user did not explicitly ask to replace it, do not overwrite it silently. Tell the user that the file already exists and ask whether to replace it.

4. Render screenshots of the PDF pages.

- On macOS, render with `qlmanage`:

```bash
mkdir -p response/_pdf_pages
qlmanage -t -s 2000 -o response/_pdf_pages "response/file.pdf"
```

- Request full permissions if sandbox blocks rendering.
- Render every page in reading order.
- If rendering fails, try reading the PDF with the Read tool as a fallback, then verify date, number, and signature block from the rendered image if possible.
- If both methods fail, report the failure and do not create an empty or partial `response.md`.

5. Transcribe from the screenshots.

- Read the screenshots visually and transcribe the document page by page.
- Preserve the original meaning and wording as closely as possible.
- Normalize only obvious layout artifacts such as line breaks caused by PDF wrapping.
- If a fragment is unreadable, say so explicitly instead of guessing.

6. Save the Markdown result.

- Write the transcription to `response/response.md`.
- Keep the file limited to the document text and simple Markdown structure.
- Delete `response/_pdf_pages/` after transcription is complete.

## Output Format

Use this structure when the PDF contains the corresponding parts:

- Letter date and number as the top heading.
- Sender organization block as plain lines.
- Recipient block as plain lines.
- Subject line as a level-2 heading.
- Main body as plain paragraphs.
- Signature block as plain lines near the end.
- Contact details as plain lines at the bottom.

Formatting rules:

- Use Markdown, not plain text.
- Keep paragraphs readable; merge PDF line wraps into normal prose.
- Keep official names, dates, numbers, and document references exact.
- Do not invent missing punctuation, names, or legal references when the scan is unclear.
- Do not add commentary, summaries, or interpretation inside `response.md`.

## Safety Rules

- Do not process PDFs outside a `response/` directory in v1.
- Do not batch-convert multiple PDFs in one run unless the user explicitly asks for that behavior.
- Do not silently overwrite an existing `response.md`.
- Do not create `response.md` when the PDF cannot be rendered or the source file is missing.

## Expected User Phrases

Typical requests that should trigger this skill:

- `pdf to text`
- `Convert the response PDF into response.md`
- `Расшифруй ответ`
- `Сделай из PDF в response текстовый response.md`
