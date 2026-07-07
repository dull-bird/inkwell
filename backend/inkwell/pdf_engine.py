"""Pure PDF operations backed by PyMuPDF.

All functions in this module are stateless: they receive a file path,
return an operation result, and write a new file only when explicitly
asked. The editor frontend maintains an undoable operation layer before
applying changes to disk.
"""

from __future__ import annotations

import os
import uuid
from dataclasses import dataclass
from pathlib import Path
from typing import Iterable

import fitz  # PyMuPDF


@dataclass(frozen=True)
class Rect:
    x0: float
    y0: float
    x1: float
    y1: float


@dataclass(frozen=True)
class Point:
    x: float
    y: float


@dataclass(frozen=True)
class HighlightOp:
    page: int  # 0-based
    rects: list[Rect]
    color: tuple[float, float, float]  # RGB 0-1
    opacity: float = 0.25
    text: str = ""


def open_document(path: str | Path) -> fitz.Document:
    return fitz.open(str(path))


def extract_text(path: str | Path, page: int | None = None) -> str | dict[int, str]:
    """Extract text from a PDF. If page is given return that page only."""
    doc = open_document(path)
    try:
        if page is not None:
            return doc[page].get_text()
        return {i: doc[i].get_text() for i in range(len(doc))}
    finally:
        doc.close()


def document_info(path: str | Path) -> dict:
    """Return lightweight document metadata needed by the UI."""
    doc = open_document(path)
    try:
        pages = []
        for page in doc:
            rect = page.rect
            pages.append({"width": float(rect.width), "height": float(rect.height)})
        return {"page_count": len(doc), "pages": pages}
    finally:
        doc.close()


def find_text_rects(path: str | Path, page: int, query: str) -> list[Rect]:
    """Find all bounding boxes for `query` on a given page."""
    doc = open_document(path)
    try:
        return [Rect(r.x0, r.y0, r.x1, r.y1) for r in doc[page].search_for(query)]
    finally:
        doc.close()


def highlight_text(path: str | Path, query: str, color: tuple[float, float, float] = (1, 1, 0)) -> list[HighlightOp]:
    """Return highlight operations that would highlight every occurrence of `query`."""
    ops: list[HighlightOp] = []
    doc = open_document(path)
    try:
        for i in range(len(doc)):
            rects = [Rect(r.x0, r.y0, r.x1, r.y1) for r in doc[i].search_for(query)]
            if rects:
                ops.append(HighlightOp(page=i, rects=rects, color=color))
    finally:
        doc.close()
    return ops


def detect_heading_highlights(
    path: str | Path,
    color: tuple[float, float, float] = (1, 1, 0),
    opacity: float = 0.25,
) -> list[HighlightOp]:
    """Return highlight operations for heading-like text blocks.

    This heuristic favors large, short text blocks and avoids body paragraphs.
    It is intended for immediate preview before the user writes a new PDF.
    """
    doc = open_document(path)
    try:
        ops: list[HighlightOp] = []
        for page_index in range(len(doc)):
            page = doc[page_index]
            page_dict = page.get_text("dict")
            candidates: list[tuple[str, float, fitz.Rect]] = []

            for block in page_dict.get("blocks", []):
                if block.get("type") != 0:
                    continue
                for line in block.get("lines", []):
                    text_parts: list[str] = []
                    max_size = 0.0
                    rect: fitz.Rect | None = None

                    for span in line.get("spans", []):
                        text = str(span.get("text", "")).strip()
                        if not text:
                            continue
                        text_parts.append(text)
                        max_size = max(max_size, float(span.get("size", 0)))
                        span_rect = fitz.Rect(span["bbox"])
                        rect = span_rect if rect is None else rect | span_rect

                    text = " ".join(text_parts).strip()
                    if text and rect is not None:
                        candidates.append((text, max_size, rect))

            if not candidates:
                continue

            sizes = sorted(size for _, size, _ in candidates)
            median_size = sizes[(len(sizes) - 1) // 2]
            threshold = max(16.0, median_size * 1.35)

            for text, size, rect in candidates:
                if size < threshold:
                    continue
                if len(text) > 120 or len(text.split()) > 12:
                    continue

                padded = rect + (-2, -2, 2, 2)
                ops.append(
                    HighlightOp(
                        page=page_index,
                        rects=[Rect(padded.x0, padded.y0, padded.x1, padded.y1)],
                        color=color,
                        opacity=opacity,
                        text=text,
                    )
                )

        return ops
    finally:
        doc.close()


def apply_operations(src: str | Path, dst: str | Path, ops: Iterable[HighlightOp]) -> None:
    """Apply a list of operations to a copy of `src` and write to `dst`."""
    doc = open_document(src)
    try:
        for op in ops:
            page = doc[op.page]
            quads = [fitz.Rect(r.x0, r.y0, r.x1, r.y1) for r in op.rects]
            annot = page.add_highlight_annot(quads)
            annot.set_colors(stroke=op.color)
            annot.set_opacity(op.opacity)
            if op.text:
                annot.set_info(content=f"Inkwell highlight: {op.text}")
            annot.update()
        doc.save(str(dst), garbage=4, deflate=True)
    finally:
        doc.close()


def add_comment(
    src: str | Path,
    dst: str | Path,
    page: int,
    point: Point,
    text: str,
    author: str = "Inkwell",
) -> None:
    """Add a standard PDF text comment annotation and write a new file."""
    if not text.strip():
        raise ValueError("Comment text cannot be empty")

    doc = open_document(src)
    try:
        annot = doc[page].add_text_annot(fitz.Point(point.x, point.y), text)
        annot.set_info(title=author, content=text)
        annot.update()
        doc.save(str(dst), garbage=4, deflate=True)
    finally:
        doc.close()


def merge_pdfs(paths: list[str | Path], dst: str | Path) -> None:
    doc = fitz.open()
    try:
        for p in paths:
            doc.insert_pdf(fitz.open(str(p)))
        doc.save(str(dst), garbage=4, deflate=True)
    finally:
        doc.close()


def split_pdf(
    path: str | Path,
    output_dir: str | Path,
    ranges: list[tuple[int, int]] | None = None,
) -> list[str]:
    output_dir = Path(output_dir)
    output_dir.mkdir(parents=True, exist_ok=True)
    doc = open_document(path)
    try:
        written: list[str] = []
        page_ranges = ranges or [(i, i) for i in range(len(doc))]
        for start, end in page_ranges:
            if start < 0 or end < start or end >= len(doc):
                raise ValueError(f"Invalid page range {start}-{end} for document with {len(doc)} pages")
            new_doc = fitz.open()
            try:
                new_doc.insert_pdf(doc, from_page=start, to_page=end)
                out_path = output_dir / split_output_name(start, end)
                new_doc.save(str(out_path), garbage=4, deflate=True)
            finally:
                new_doc.close()
            written.append(str(out_path))
        return written
    finally:
        doc.close()


def split_output_name(start: int, end: int) -> str:
    if start == end:
        return f"page_{start + 1:04d}.pdf"
    return f"pages_{start + 1:04d}-{end + 1:04d}.pdf"


def add_watermark(
    path: str | Path,
    dst: str | Path,
    text: str,
    opacity: float = 0.3,
) -> None:
    doc = open_document(path)
    try:
        for page in doc:
            rect = page.rect
            fontsize = max(28, min(64, rect.width / max(8, len(text)) * 1.5))
            text_width = fitz.get_text_length(text, fontsize=fontsize, fontname="helv")
            page.insert_text(
                fitz.Point(max(36, (rect.width - text_width) / 2), rect.height / 2),
                text,
                fontsize=fontsize,
                fontname="helv",
                color=(0.55, 0.55, 0.55),
            )
        doc.save(str(dst), garbage=4, deflate=True)
    finally:
        doc.close()


def rotate_pages(
    src: str | Path,
    dst: str | Path,
    rotations: dict[int, int],
) -> None:
    """Set the absolute rotation (0/90/180/270) for the given 0-based pages."""
    doc = open_document(src)
    try:
        for page_index, degrees in rotations.items():
            doc[page_index].set_rotation(degrees % 360)
        doc.save(str(dst), garbage=4, deflate=True)
    finally:
        doc.close()


def reorder_pages(src: str | Path, dst: str | Path, new_order: list[int]) -> None:
    """Rewrite the document with pages in `new_order` (0-based). Omitted pages are dropped."""
    doc = open_document(src)
    try:
        doc.select(new_order)
        doc.save(str(dst), garbage=4, deflate=True)
    finally:
        doc.close()


@dataclass(frozen=True)
class FormField:
    name: str
    type: str
    value: str | int | float | bool | None
    page: int
    rect: Rect


def read_form_fields(path: str | Path) -> list[FormField]:
    """List every fillable form field with its current value."""
    doc = open_document(path)
    try:
        fields: list[FormField] = []
        for page_index in range(len(doc)):
            page = doc[page_index]
            for widget in page.widgets() or []:
                r = widget.rect
                fields.append(
                    FormField(
                        name=widget.field_name,
                        type=widget.field_type_string,
                        value=widget.field_value,
                        page=page_index,
                        rect=Rect(r.x0, r.y0, r.x1, r.y1),
                    )
                )
        return fields
    finally:
        doc.close()


def fill_form_fields(src: str | Path, dst: str | Path, values: dict[str, object]) -> list[str]:
    """Set form field values by name. Returns the names that weren't found."""
    doc = open_document(src)
    try:
        remaining = dict(values)
        for page in doc:
            for widget in page.widgets() or []:
                if widget.field_name in remaining:
                    widget.field_value = remaining.pop(widget.field_name)
                    widget.update()
        doc.save(str(dst), garbage=4, deflate=True)
        return list(remaining.keys())
    finally:
        doc.close()


ALL_PERMISSIONS = (
    fitz.PDF_PERM_ACCESSIBILITY
    | fitz.PDF_PERM_PRINT
    | fitz.PDF_PERM_COPY
    | fitz.PDF_PERM_ANNOTATE
    | fitz.PDF_PERM_FORM
    | fitz.PDF_PERM_ASSEMBLE
    | fitz.PDF_PERM_PRINT_HQ
)


def encrypt_pdf(
    path: str | Path,
    dst: str | Path,
    user_pw: str,
    owner_pw: str | None = None,
    permissions: int | None = None,
) -> None:
    doc = open_document(path)
    try:
        doc.save(
            str(dst),
            encryption=fitz.PDF_ENCRYPT_AES_256,
            owner_pw=owner_pw or user_pw,
            user_pw=user_pw,
            permissions=ALL_PERMISSIONS if permissions is None else permissions,
        )
    finally:
        doc.close()
