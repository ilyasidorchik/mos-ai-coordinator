#!/usr/bin/env python3
"""Hide personal data in a response PDF via PyMuPDF redactions.

Reads PERSONAL_DATA from the repo-root .env (pipe-separated; trailing * = prefix).
Writes redacted pages as page-NN.png and hidden.pdf under <pdf-dir>/_pdf_pages/.
Prints JSON on stdout (hit counts only — never the matched strings).
"""

from __future__ import annotations

import argparse
import json
import re
import sys
from pathlib import Path

RENDER_SCALE = 2.0
PAD_PT = 1.0
# Same-line initials glued to a matched surname (e.g. «Сидорчику И.А.»).
# Do not strip '.' before this check — initials are «И.», «И.А.», «И.А.В.»
INITIALS_RE = re.compile(r"^(?:[A-Za-zА-Яа-яЁё]\.){1,3}$")
# Strip quotes/brackets/sentence punct from word edges, but keep dots inside tokens
# (emails, initials). Trailing «!» on «Александрович!» is removed.
EDGE_PUNCT_RE = re.compile(
    r"^[\s\"'«»„“”()\[\]{}<>]+|[\s\"'«»„“”()\[\]{}<>.,;:!?…]+$"
)


def die(msg: str, code: int = 1) -> None:
    print(msg, file=sys.stderr)
    sys.exit(code)


def require_pymupdf():
    try:
        import pymupdf  # noqa: F401
    except ImportError as e:
        die(f"Missing dependency for hide-pers-data: {e}. Install pymupdf.")


def find_repo_root(start: Path) -> Path:
    """Walk up from start looking for .env or .git."""
    cur = start.resolve()
    if cur.is_file():
        cur = cur.parent
    for p in [cur, *cur.parents]:
        if (p / ".env").is_file() or (p / ".git").exists():
            return p
    return cur


def load_pers_data(repo_root: Path) -> list[str]:
    env_path = repo_root / ".env"
    if not env_path.is_file():
        die("PERSONAL_DATA not found: missing .env in repo root", code=1)

    value = None
    for raw in env_path.read_text(encoding="utf-8").splitlines():
        line = raw.strip()
        if not line or line.startswith("#"):
            continue
        if line.startswith("PERSONAL_DATA="):
            value = line.split("=", 1)[1].strip()
            # Strip optional surrounding quotes
            if len(value) >= 2 and value[0] == value[-1] and value[0] in "\"'":
                value = value[1:-1]
            break

    if value is None or not value.strip():
        die("PERSONAL_DATA is missing or empty in .env", code=1)

    items = [part.strip() for part in value.split("|") if part.strip()]
    if not items:
        die("PERSONAL_DATA is empty after parsing", code=1)
    return items


def strip_edge_punct(text: str) -> str:
    return EDGE_PUNCT_RE.sub("", text)


def word_matches(token: str, patterns: list[str]) -> bool:
    """Case-insensitive match; pattern ending with * is a prefix."""
    t = strip_edge_punct(token).casefold()
    if not t:
        return False
    for pat in patterns:
        p = pat.casefold()
        if p.endswith("*"):
            prefix = p[:-1]
            if prefix and t.startswith(prefix):
                return True
        elif t == p:
            return True
    return False


def text_still_has_pers_data(text: str, patterns: list[str]) -> bool:
    """Check raw page text for any remaining pattern (word-ish / substring)."""
    if not text:
        return False
    # Split into tokens roughly like get_text("words"), also scan whole string
    # for emails / multi-char exact matches.
    folded = text.casefold()
    for pat in patterns:
        p = pat.casefold()
        if p.endswith("*"):
            prefix = p[:-1]
            if not prefix:
                continue
            # Prefix must appear at a word start
            if re.search(r"(?<![0-9a-zа-яё])" + re.escape(prefix), folded):
                return True
        else:
            if re.search(r"(?<![0-9a-zа-яё@._+-])" + re.escape(p) + r"(?![0-9a-zа-яё@._+-])", folded):
                return True
            # Also plain substring for emails etc.
            if "@" in p and p in folded:
                return True
    return False


def is_initials(token: str) -> bool:
    # Only trim whitespace/quotes — never strip the dots that form initials.
    t = token.strip().strip("\"'«»„“”()[]{}<>")
    return bool(INITIALS_RE.match(t))


def same_line(a, b, y_tol: float = 3.0) -> bool:
    # words: (x0, y0, x1, y1, text, block, line, word)
    return abs(a[1] - b[1]) <= y_tol and abs(a[3] - b[3]) <= y_tol


def nearby_right(left, right, gap: float = 12.0) -> bool:
    """right starts just after left on the same line."""
    return same_line(left, right) and 0 <= (right[0] - left[2]) <= gap


def collect_redact_rects(page, patterns: list[str]):
    import pymupdf

    words = page.get_text("words")  # list of tuples
    if not words and not page.get_text("text").strip():
        return None  # no text layer

    hit_indices: set[int] = set()
    for i, w in enumerate(words):
        if word_matches(w[4], patterns):
            hit_indices.add(i)

    # Expand to adjacent initials on the same line (left or right of a hit).
    expanded = set(hit_indices)
    for i in list(hit_indices):
        for j, other in enumerate(words):
            if j in expanded:
                continue
            if not is_initials(other[4]):
                continue
            if nearby_right(words[i], other) or nearby_right(other, words[i]):
                expanded.add(j)

    rects: list = []
    for i in sorted(expanded):
        w = words[i]
        r = pymupdf.Rect(w[0], w[1], w[2], w[3])
        r.x0 -= PAD_PT
        r.y0 -= PAD_PT
        r.x1 += PAD_PT
        r.y1 += PAD_PT
        rects.append(r)

    return rects


def ensure_response_pdf(pdf_path: Path) -> Path:
    pdf_path = pdf_path.resolve()
    if not pdf_path.is_file():
        die(f"PDF not found: {pdf_path}")
    if pdf_path.suffix.lower() != ".pdf":
        die(f"Not a PDF: {pdf_path}")
    if pdf_path.parent.name != "response":
        die(f"PDF must live inside a response/ directory: {pdf_path}", code=1)
    return pdf_path


def clear_page_pngs(out_dir: Path) -> None:
    if not out_dir.exists():
        return
    for p in out_dir.glob("page-*.png"):
        p.unlink()
    hidden = out_dir / "hidden.pdf"
    if hidden.is_file():
        hidden.unlink()


def hide(pdf_path: Path, patterns: list[str]) -> dict:
    import pymupdf

    pdf_path = ensure_response_pdf(pdf_path)
    doc = pymupdf.open(pdf_path)

    hits_per_page: list[int] = []
    any_text = False

    for page in doc:
        rects = collect_redact_rects(page, patterns)
        if rects is None:
            hits_per_page.append(0)
            continue
        any_text = True
        hits_per_page.append(len(rects))
        for r in rects:
            page.add_redact_annot(r, fill=(0, 0, 0))
        page.apply_redactions(images=pymupdf.PDF_REDACT_IMAGE_NONE)

    if not any_text:
        die("нет текстового слоя", code=3)

    # Verify no leaks remain
    for i, page in enumerate(doc):
        text = page.get_text("text")
        if text_still_has_pers_data(text, patterns):
            die(
                f"Personal data still present after redaction on page {i + 1}",
                code=4,
            )

    out_dir = pdf_path.parent / "_pdf_pages"
    out_dir.mkdir(parents=True, exist_ok=True)
    clear_page_pngs(out_dir)

    hidden_path = out_dir / "hidden.pdf"
    doc.save(str(hidden_path))

    matrix = pymupdf.Matrix(RENDER_SCALE, RENDER_SCALE)
    files: list[str] = [str(hidden_path)]
    pages_written: list[int] = []

    for i, page in enumerate(doc):
        page_no = i + 1
        pix = page.get_pixmap(matrix=matrix, alpha=False)
        dest = out_dir / f"page-{page_no:02d}.png"
        pix.save(str(dest))
        files.append(str(dest))
        pages_written.append(page_no)

    return {
        "pages": pages_written,
        "hits_per_page": hits_per_page,
        "out_dir": str(out_dir),
        "files": files,
    }


def main() -> None:
    require_pymupdf()
    parser = argparse.ArgumentParser(
        description="Hide personal data in a response PDF and render pages"
    )
    parser.add_argument("pdf", type=Path, help="Path to a PDF in a response/ folder")
    args = parser.parse_args()

    # Prefer cwd as search start (agent runs from repo root), then script location.
    repo_root = find_repo_root(Path.cwd())
    if not (repo_root / ".env").is_file():
        repo_root = find_repo_root(Path(__file__))

    patterns = load_pers_data(repo_root)
    # Never print pattern values
    result = hide(args.pdf, patterns)
    print(json.dumps(result, ensure_ascii=False))


if __name__ == "__main__":
    main()
