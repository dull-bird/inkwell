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
class HighlightOp:
    page: int  # 0-based
    rects: list[Rect]
    color: tuple[float, float, float]  # RGB 0-1


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


def apply_operations(src: str | Path, dst: str | Path, ops: Iterable[HighlightOp]) -> None:
    """Apply a list of operations to a copy of `src` and write to `dst`."""
    doc = open_document(src)
    try:
        for op in ops:
            page = doc[op.page]
            quads = [fitz.Rect(r.x0, r.y0, r.x1, r.y1) for r in op.rects]
            page.add_highlight_annot(quads)
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


def split_pdf(path: str | Path, output_dir: str | Path) -> list[str]:
    output_dir = Path(output_dir)
    output_dir.mkdir(parents=True, exist_ok=True)
    doc = open_document(path)
    try:
        written: list[str] = []
        for i in range(len(doc)):
            new_doc = fitz.open()
            new_doc.insert_pdf(doc, from_page=i, to_page=i)
            out_path = output_dir / f"page_{i + 1:04d}.pdf"
            new_doc.save(str(out_path), garbage=4, deflate=True)
            new_doc.close()
            written.append(str(out_path))
        return written
    finally:
        doc.close()


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
            shape = page.new_shape()
            center = fitz.Point(rect.width / 2, rect.height / 2)
            shape.insert_text(
                center,
                text,
                fontsize=64,
                color=(0.5, 0.5, 0.5),
                morph=(center, fitz.Matrix(-20, -20)),
            )
            shape.finish(color=(0.5, 0.5, 0.5), fill=None, dashes=None, width=0.3)
            shape.commit()
            # Lower opacity by blending the watermark layer is non-trivial in PyMuPDF;
            # for v0 we keep it simple.
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
