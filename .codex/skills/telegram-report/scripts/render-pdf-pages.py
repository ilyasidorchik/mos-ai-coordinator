#!/usr/bin/env python3
"""Render PDF pages for Telegram, skipping nearly blank pages.

Writes page-NN.png into <pdf-dir>/_pdf_pages/. Prints JSON on stdout:
  { "written": [1, 2], "skipped_blank": [3], "out_dir": "..." }

A page is blank when the share of non-near-white pixels is below
BLANK_INK_RATIO (default 0.15%). Catches metro «Исп. …» trailing pages.
"""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

# Share of ink pixels below this → skip (do not write the screenshot).
BLANK_INK_RATIO = 0.0015  # 0.15%
NEAR_WHITE = 250
RENDER_SCALE = 2.0


def die(msg: str, code: int = 1) -> None:
    print(msg, file=sys.stderr)
    sys.exit(code)


def require_pymupdf():
    try:
        import pymupdf  # noqa: F401
    except ImportError as e:
        die(
            "Missing dependency for render-pdf-pages: "
            f"{e}. Install pymupdf."
        )


def ink_ratio(pix) -> float:
    """Fraction of pixels that are not near-white (RGB)."""
    n = pix.width * pix.height
    if n == 0:
        return 0.0
    samples = pix.samples
    channels = pix.n  # 3 RGB or 4 RGBA (alpha=False → usually 3)
    try:
        import numpy as np

        a = np.frombuffer(samples, dtype=np.uint8).reshape(-1, channels)
        ink = int(np.any(a[:, :3] < NEAR_WHITE, axis=1).sum())
    except ImportError:
        ink = 0
        for j in range(0, len(samples), channels):
            if (
                samples[j] < NEAR_WHITE
                or samples[j + 1] < NEAR_WHITE
                or samples[j + 2] < NEAR_WHITE
            ):
                ink += 1
    return ink / n


def clear_page_pngs(out_dir: Path) -> None:
    if not out_dir.exists():
        return
    for p in out_dir.glob("page-*.png"):
        p.unlink()


def render(pdf_path: Path, blank_ratio: float) -> dict:
    import pymupdf

    if not pdf_path.is_file():
        die(f"PDF not found: {pdf_path}")
    if pdf_path.suffix.lower() != ".pdf":
        die(f"Not a PDF: {pdf_path}")

    out_dir = pdf_path.parent / "_pdf_pages"
    out_dir.mkdir(parents=True, exist_ok=True)
    clear_page_pngs(out_dir)

    doc = pymupdf.open(pdf_path)
    written: list[int] = []
    skipped_blank: list[int] = []
    matrix = pymupdf.Matrix(RENDER_SCALE, RENDER_SCALE)

    for i, page in enumerate(doc):
        page_no = i + 1
        pix = page.get_pixmap(matrix=matrix, alpha=False)
        ratio = ink_ratio(pix)
        if ratio < blank_ratio:
            skipped_blank.append(page_no)
            continue
        dest = out_dir / f"page-{page_no:02d}.png"
        pix.save(str(dest))
        written.append(page_no)

    return {
        "written": written,
        "skipped_blank": skipped_blank,
        "out_dir": str(out_dir),
        "blank_ink_ratio": blank_ratio,
    }


def main() -> None:
    require_pymupdf()
    parser = argparse.ArgumentParser(
        description="Render non-blank PDF pages into response/_pdf_pages/"
    )
    parser.add_argument("pdf", type=Path, help="Path to a PDF in a response/ folder")
    parser.add_argument(
        "--blank-ratio",
        type=float,
        default=BLANK_INK_RATIO,
        help=f"Max ink fraction treated as blank (default {BLANK_INK_RATIO})",
    )
    args = parser.parse_args()
    result = render(args.pdf.resolve(), args.blank_ratio)
    print(json.dumps(result, ensure_ascii=False))
    if not result["written"]:
        die("No non-blank pages to send (all pages skipped as blank)", code=2)


if __name__ == "__main__":
    main()
