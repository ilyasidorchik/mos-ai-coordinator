#!/usr/bin/env python3
"""Extract and crop photo attachments from an agency response PDF.

Writes cropped JPEGs into <case>/response/photos/ next to the PDF.
"""

from __future__ import annotations

import argparse
import re
import statistics
import sys
from pathlib import Path

MIN_WIDTH = 400
MIN_HEIGHT = 400


def die(msg: str, code: int = 1) -> None:
    print(msg, file=sys.stderr)
    sys.exit(code)


def require_deps():
    try:
        import pymupdf  # noqa: F401
        from PIL import Image  # noqa: F401
    except ImportError as e:
        die(
            "Missing dependency for extract-response-photos: "
            f"{e}. Install pymupdf and Pillow."
        )


def case_folder_name(pdf_path: Path) -> str:
    # .../<case>/response/<file.pdf>  or  .../<case>/attempt-N/response/<file.pdf>
    response_dir = pdf_path.parent
    if response_dir.name != "response":
        die(f"PDF must live in a response/ directory, got: {pdf_path}")
    parent = response_dir.parent
    if re.fullmatch(r"attempt-\d+", parent.name) or re.fullmatch(
        r"\d{4}-\d{2}-\d{2}", parent.name
    ):
        return parent.parent.name
    return parent.name


def output_stem(case_name: str, index: int, total: int) -> str:
    if total == 1:
        return f"{case_name}-result"
    # 1-based: result1, result2, …
    return f"{case_name}-result{index}"


def unique_path(photos_dir: Path, stem: str) -> Path:
    candidate = photos_dir / f"{stem}.jpg"
    if not candidate.exists():
        return candidate
    n = 2
    while True:
        alt = photos_dir / f"{stem}-{n}.jpg"
        if not alt.exists():
            return alt
        n += 1


def collect_photo_xrefs(doc) -> list[tuple[int, int, int, int]]:
    """Return list of (page_index, xref, width, height) for large images."""
    found: list[tuple[int, int, int, int]] = []
    seen: set[int] = set()
    for page_index in range(doc.page_count):
        page = doc[page_index]
        for img in page.get_images(full=True):
            xref = img[0]
            if xref in seen:
                continue
            width, height = img[2], img[3]
            if width < MIN_WIDTH or height < MIN_HEIGHT:
                continue
            # Skip tiny logos / stamps already filtered by size; keep photos
            seen.add(xref)
            found.append((page_index, xref, width, height))
    # Prefer later pages (attachments) when ordering; keep stable within page
    found.sort(key=lambda t: (t[0], -t[2] * t[3]))
    return found


def col_stats(px, x: int, h: int, step: int = 2) -> tuple[float, float]:
    samples = [px[x, y] for y in range(0, h, step)]
    med = statistics.median([sum(c) / 3 for c in samples])
    white = (
        sum(1 for r, g, b in samples if r >= 245 and g >= 245 and b >= 245)
        / len(samples)
    )
    return med, white


def is_white_col(px, x: int, h: int) -> bool:
    med, white = col_stats(px, x, h)
    return med >= 245 or white >= 0.55


def row_near_white_ratio(px, y: int, w: int, step: int = 2) -> float:
    samples = [px[x, y] for x in range(0, w, step)]
    near = 0
    for r, g, b in samples:
        if min(r, g, b) >= 245 and (max(r, g, b) - min(r, g, b)) <= 8:
            near += 1
    return near / len(samples)


def crop_white_frames_and_footer(im):
    """Adaptive crop: white L/R/T margins + registration footer at bottom."""
    from PIL import Image

    if not isinstance(im, Image.Image):
        raise TypeError("expected PIL Image")
    im = im.convert("RGB")
    w, h = im.size
    px = im.load()

    last_white = -1
    for x in range(w // 4):
        if is_white_col(px, x, h):
            last_white = x
    cmin = last_white + 1 if last_white >= 0 else 0

    first_white_right = w
    for x in range(w - 1, (3 * w) // 4, -1):
        if is_white_col(px, x, h):
            first_white_right = x
    cmax = first_white_right - 1 if first_white_right < w else w - 1

    y = 0
    while y < h // 5 and row_near_white_ratio(px, y, w) >= 0.85:
        y += 1
    rmin = y

    footer_rows: list[int] = []
    for y in range(max(0, h - 100), h):
        left = [px[x, y] for x in range(20, max(21, w // 2))]
        dark = sum(1 for r, g, b in left if r < 50 and g < 50 and b < 50) / len(
            left
        )
        if dark >= 0.02:
            footer_rows.append(y)

    if footer_rows:
        rmax = min(footer_rows) - 3
    else:
        y = h - 1
        while y > h - 80 and row_near_white_ratio(px, y, w) >= 0.40:
            y -= 1
        rmax = y

    cmin = max(0, min(cmin, w - 2))
    cmax = max(cmin + 1, min(cmax, w - 1))
    rmin = max(0, min(rmin, h - 2))
    rmax = max(rmin + 1, min(rmax, h - 1))

    return im.crop((cmin, rmin, cmax + 1, rmax + 1)), (cmin, rmin, cmax + 1, rmax + 1)


def extract_photos(pdf_path: Path, out_dir: Path | None = None) -> list[Path]:
    import io

    import pymupdf
    from PIL import Image

    pdf_path = pdf_path.resolve()
    if not pdf_path.is_file():
        die(f"PDF not found: {pdf_path}")

    response_dir = pdf_path.parent
    photos_dir = out_dir.resolve() if out_dir else (response_dir / "photos")
    photos_dir.mkdir(parents=True, exist_ok=True)

    case_name = case_folder_name(pdf_path)
    doc = pymupdf.open(pdf_path)
    xrefs = collect_photo_xrefs(doc)
    if not xrefs:
        print("No large photo images found in PDF.")
        return []

    saved: list[Path] = []
    total = len(xrefs)
    for i, (page_index, xref, width, height) in enumerate(xrefs, start=1):
        img_dict = doc.extract_image(xref)
        im = Image.open(io.BytesIO(img_dict["image"])).convert("RGB")
        cropped, box = crop_white_frames_and_footer(im)
        stem = output_stem(case_name, i, total)
        out_path = unique_path(photos_dir, stem)
        cropped.save(out_path, format="JPEG", quality=95, optimize=True)
        saved.append(out_path)
        print(
            f"saved {out_path} "
            f"(page {page_index + 1}, src {width}x{height}, "
            f"crop {cropped.size[0]}x{cropped.size[1]}, box={box})"
        )

    return saved


def main() -> None:
    require_deps()
    parser = argparse.ArgumentParser(
        description="Extract cropped photo attachments from a response PDF."
    )
    parser.add_argument(
        "pdf",
        type=Path,
        help="Path to PDF inside a case response/ directory",
    )
    parser.add_argument(
        "--out-dir",
        type=Path,
        default=None,
        help="Override output directory (default: <response>/photos)",
    )
    args = parser.parse_args()
    paths = extract_photos(args.pdf, args.out_dir)
    if not paths:
        sys.exit(2)


if __name__ == "__main__":
    main()
