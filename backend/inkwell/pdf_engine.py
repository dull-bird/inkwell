"""Pure PDF operations backed by PyMuPDF.

All functions in this module are stateless: they receive a file path,
return an operation result, and write a new file only when explicitly
asked. The editor frontend maintains an undoable operation layer before
applying changes to disk.
"""

from __future__ import annotations

import os
import html
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


@dataclass(frozen=True)
class RedactionResult:
    match_count: int
    pages: list[int]


@dataclass(frozen=True)
class ExtractedImage:
    path: str
    page: int
    xref: int
    width: int
    height: int
    ext: str


@dataclass(frozen=True)
class OutlineItem:
    level: int
    title: str
    page: int  # 1-based page number, matching PyMuPDF's TOC API.
    x: float | None = None
    y: float | None = None


@dataclass(frozen=True)
class AttachmentInfo:
    name: str
    filename: str
    description: str
    size: int


@dataclass(frozen=True)
class ExtractedAttachment:
    name: str
    path: str
    size: int


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


def add_free_text(
    src: str | Path,
    dst: str | Path,
    page: int,
    point: Point,
    text: str,
    author: str = "Inkwell",
    font_size: float = 14,
) -> None:
    """Add visible FreeText annotation and write a new file."""
    content = text.strip()
    if not content:
        raise ValueError("Free text cannot be empty")

    doc = open_document(src)
    try:
        target_page = doc[page]
        lines = content.splitlines() or [content]
        text_width = max(
            fitz.get_text_length(line or " ", fontsize=font_size, fontname="helv")
            for line in lines
        )
        width = max(160, min(480, text_width + 28))
        height = max(40, min(240, len(lines) * (font_size + 8) + 18))
        rect = fitz.Rect(point.x, point.y, point.x + width, point.y + height)
        annot = target_page.add_freetext_annot(
            rect,
            content,
            fontsize=font_size,
            fontname="helv",
            text_color=(0, 0, 0),
            fill_color=(1, 1, 0.86),
        )
        annot.set_info(title=author or "Inkwell", subject="Free text", content=content)
        annot.update()
        doc.save(str(dst), garbage=4, deflate=True)
    finally:
        doc.close()


STANDARD_STAMPS = {
    "approved": fitz.STAMP_Approved,
    "asis": fitz.STAMP_AsIs,
    "confidential": fitz.STAMP_Confidential,
    "departmental": fitz.STAMP_Departmental,
    "draft": fitz.STAMP_Draft,
    "experimental": fitz.STAMP_Experimental,
    "expired": fitz.STAMP_Expired,
    "final": fitz.STAMP_Final,
    "forcomment": fitz.STAMP_ForComment,
    "forpublicrelease": fitz.STAMP_ForPublicRelease,
    "notapproved": fitz.STAMP_NotApproved,
    "notforpublicrelease": fitz.STAMP_NotForPublicRelease,
    "sold": fitz.STAMP_Sold,
    "topsecret": fitz.STAMP_TopSecret,
}


def normalize_stamp_name(stamp: str) -> str:
    return "".join(ch for ch in stamp.lower() if ch.isalnum())


def add_stamp_annotation(
    src: str | Path,
    dst: str | Path,
    page: int,
    point: Point,
    stamp: str,
    author: str = "Inkwell",
) -> str:
    """Add a standard PDF stamp annotation and write a new file."""
    normalized = normalize_stamp_name(stamp)
    stamp_value = STANDARD_STAMPS.get(normalized)
    if stamp_value is None:
        supported = ", ".join(sorted(STANDARD_STAMPS))
        raise ValueError(f"Unsupported stamp '{stamp}'. Supported stamps: {supported}")

    doc = open_document(src)
    try:
        target_page = doc[page]
        rect = fitz.Rect(point.x, point.y, point.x + 180, point.y + 70)
        annot = target_page.add_stamp_annot(rect, stamp=stamp_value)
        annot.set_info(title=author or "Inkwell", subject="Stamp", content=normalized)
        annot.update()
        doc.save(str(dst), garbage=4, deflate=True)
        return normalized
    finally:
        doc.close()


SUPPORTED_SHAPES = {"rectangle", "ellipse", "line"}


def normalize_shape_kind(kind: str) -> str:
    normalized = kind.strip().lower()
    if normalized == "rect":
        return "rectangle"
    if normalized == "circle":
        return "ellipse"
    return normalized


def add_shape_annotation(
    src: str | Path,
    dst: str | Path,
    page: int,
    point: Point,
    kind: str,
    width: float = 160,
    height: float = 90,
    color: tuple[float, float, float] = (0.1, 0.45, 0.95),
    stroke_width: float = 2,
    author: str = "Sparrow",
) -> str:
    """Add a standard PDF shape annotation and write a new file."""
    normalized = normalize_shape_kind(kind)
    if normalized not in SUPPORTED_SHAPES:
        supported = ", ".join(sorted(SUPPORTED_SHAPES))
        raise ValueError(f"Unsupported shape '{kind}'. Supported shapes: {supported}")
    if width <= 0:
        raise ValueError("Shape width must be positive")
    if normalized != "line" and height <= 0:
        raise ValueError("Shape height must be positive")
    if normalized == "line" and height == 0 and width == 0:
        raise ValueError("Line annotation must have a non-zero length")
    if stroke_width <= 0:
        raise ValueError("Shape stroke width must be positive")

    doc = open_document(src)
    try:
        target_page = doc[page]
        if normalized == "rectangle":
            rect = fitz.Rect(point.x, point.y, point.x + width, point.y + height)
            annot = target_page.add_rect_annot(rect)
        elif normalized == "ellipse":
            rect = fitz.Rect(point.x, point.y, point.x + width, point.y + height)
            annot = target_page.add_circle_annot(rect)
        else:
            annot = target_page.add_line_annot(
                fitz.Point(point.x, point.y),
                fitz.Point(point.x + width, point.y + height),
            )

        annot.set_colors(stroke=color)
        annot.set_border(width=stroke_width)
        annot.set_info(title=author or "Sparrow", subject="Shape", content=normalized)
        annot.update()
        doc.save(str(dst), garbage=4, deflate=True)
        return normalized
    finally:
        doc.close()


def insert_pdf_image(
    src: str | Path,
    dst: str | Path,
    page: int,
    point: Point,
    image_path: str | Path,
    width: float = 180,
    height: float = 120,
) -> None:
    """Insert a local image into a PDF page as visible page content."""
    if width <= 0 or height <= 0:
        raise ValueError("Image width and height must be positive")

    image = Path(image_path)
    if not image.is_file():
        raise ValueError(f"Image file not found: {image}")

    pixmap = fitz.Pixmap(str(image))
    try:
        if pixmap.width <= 0 or pixmap.height <= 0:
            raise ValueError(f"Invalid image dimensions: {image}")
    finally:
        pixmap = None

    doc = open_document(src)
    try:
        target_page = doc[page]
        rect = fitz.Rect(point.x, point.y, point.x + width, point.y + height)
        target_page.insert_image(rect, filename=str(image), keep_proportion=True)
        doc.save(str(dst), garbage=4, deflate=True)
    finally:
        doc.close()


def add_image_signature(
    src: str | Path,
    dst: str | Path,
    page: int,
    point: Point,
    image_path: str | Path,
    width: float = 180,
    height: float = 60,
) -> None:
    """Add a visible image signature. This is not a certificate signature."""
    insert_pdf_image(src, dst, page, point, image_path, width, height)


def add_text_markup(
    src: str | Path,
    dst: str | Path,
    query: str,
    kind: str,
    color: tuple[float, float, float] = (1, 0.64, 0),
    author: str = "Inkwell",
) -> int:
    """Add standard text markup annotations for every exact text match."""
    target = query.strip()
    if not target:
        raise ValueError("Markup text cannot be empty")
    if kind not in {"underline", "strikeout"}:
        raise ValueError(f"Unsupported text markup kind: {kind}")

    doc = open_document(src)
    try:
        count = 0
        for page in doc:
            for rect in page.search_for(target):
                if kind == "underline":
                    annot = page.add_underline_annot(rect)
                    subject = "Underline"
                else:
                    annot = page.add_strikeout_annot(rect)
                    subject = "StrikeOut"
                annot.set_colors(stroke=color)
                annot.set_info(title=author or "Inkwell", subject=subject, content=target)
                annot.update()
                count += 1

        if count == 0:
            raise ValueError(f'Text not found: "{target}"')

        doc.save(str(dst), garbage=4, deflate=True)
        return count
    finally:
        doc.close()


def redact_text(
    src: str | Path,
    dst: str | Path,
    query: str,
    page_indices: list[int] | None = None,
) -> RedactionResult:
    """Permanently remove exact text matches by applying PDF redactions."""
    target = query.strip()
    if not target:
        raise ValueError("Redaction text cannot be empty")

    doc = open_document(src)
    try:
        selected = set(page_indices) if page_indices is not None else set(range(len(doc)))
        pages: list[int] = []
        match_count = 0

        for index in sorted(selected):
            if index < 0 or index >= len(doc):
                raise ValueError(f"Invalid page index {index} for document with {len(doc)} pages")

            page = doc[index]
            rects = page.search_for(target)
            if not rects:
                continue

            pages.append(index)
            match_count += len(rects)
            for rect in rects:
                annot = page.add_redact_annot(rect, fill=(0, 0, 0), cross_out=False)
                annot.set_info(subject="Redaction", content=target)
                annot.update()

            page.apply_redactions(
                images=fitz.PDF_REDACT_IMAGE_PIXELS,
                graphics=fitz.PDF_REDACT_LINE_ART_REMOVE_IF_COVERED,
                text=fitz.PDF_REDACT_TEXT_REMOVE,
            )

        if match_count == 0:
            raise ValueError(f'Text not found: "{target}"')

        doc.save(str(dst), garbage=4, deflate=True)
        return RedactionResult(match_count=match_count, pages=pages)
    finally:
        doc.close()


def add_typed_signature(
    src: str | Path,
    dst: str | Path,
    page: int,
    point: Point,
    text: str,
    signer: str = "Sparrow",
    font_size: float = 20,
) -> None:
    """Add a visible typed signature as a standard FreeText annotation."""
    signature = text.strip()
    if not signature:
        raise ValueError("Signature text cannot be empty")

    doc = open_document(src)
    try:
        target_page = doc[page]
        width = max(120, fitz.get_text_length(signature, fontsize=font_size, fontname="helv") + 24)
        height = max(36, font_size + 18)
        rect = fitz.Rect(point.x, point.y, point.x + width, point.y + height)
        annot = target_page.add_freetext_annot(
            rect,
            signature,
            fontsize=font_size,
            fontname="helv",
            text_color=(0, 0, 0),
            fill_color=(1, 1, 1),
        )
        annot.set_info(title=signer or "Sparrow", subject="Typed signature", content=signature)
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


def extract_pages(src: str | Path, dst: str | Path, page_indices: list[int]) -> None:
    """Write selected 0-based pages, in order, to one new PDF."""
    if not page_indices:
        raise ValueError("At least one page must be selected for extraction")

    doc = open_document(src)
    out_doc = fitz.open()
    try:
        for index in page_indices:
            if index < 0 or index >= len(doc):
                raise ValueError(f"Invalid page index {index} for document with {len(doc)} pages")
            out_doc.insert_pdf(doc, from_page=index, to_page=index)

        out_doc.save(str(dst), garbage=4, deflate=True)
    finally:
        out_doc.close()
        doc.close()


def insert_blank_pages(
    src: str | Path,
    dst: str | Path,
    insert_index: int,
    count: int = 1,
    width: float | None = None,
    height: float | None = None,
) -> None:
    """Insert blank pages at a 0-based output position and write a new PDF."""
    if count < 1:
        raise ValueError("Blank page count must be at least 1")

    doc = open_document(src)
    out_doc = fitz.open()
    try:
        if insert_index < 0 or insert_index > len(doc):
            raise ValueError(f"Invalid insert index {insert_index} for document with {len(doc)} pages")

        page_width, page_height = resolve_page_size(doc, insert_index, width, height)
        if insert_index > 0:
            out_doc.insert_pdf(doc, from_page=0, to_page=insert_index - 1)
        for _ in range(count):
            out_doc.new_page(width=page_width, height=page_height)
        if insert_index < len(doc):
            out_doc.insert_pdf(doc, from_page=insert_index, to_page=len(doc) - 1)

        out_doc.save(str(dst), garbage=4, deflate=True)
    finally:
        out_doc.close()
        doc.close()


def resolve_page_size(
    doc: fitz.Document,
    insert_index: int,
    width: float | None,
    height: float | None,
) -> tuple[float, float]:
    if (width is None) != (height is None):
        raise ValueError("Page width and height must be provided together")
    if width is not None and height is not None:
        if width <= 0 or height <= 0:
            raise ValueError("Page width and height must be positive")
        return float(width), float(height)
    if len(doc) == 0:
        return 595.0, 842.0
    reference_index = min(max(insert_index - 1, 0), len(doc) - 1)
    rect = doc[reference_index].rect
    return float(rect.width), float(rect.height)


def resize_pages(
    src: str | Path,
    dst: str | Path,
    width: float,
    height: float,
    page_indices: list[int] | None = None,
) -> None:
    """Resize selected pages by drawing each source page onto a new page size."""
    if width <= 0 or height <= 0:
        raise ValueError("Page width and height must be positive")

    doc = open_document(src)
    out_doc = fitz.open()
    try:
        selected = set(page_indices if page_indices is not None else list(range(len(doc))))
        if not selected:
            raise ValueError("At least one page must be selected for page resize")
        invalid = [index for index in selected if index < 0 or index >= len(doc)]
        if invalid:
            raise ValueError(f"Invalid page index {invalid[0]} for document with {len(doc)} pages")

        for index in range(len(doc)):
            if index not in selected:
                out_doc.insert_pdf(doc, from_page=index, to_page=index)
                continue
            page = out_doc.new_page(width=width, height=height)
            page.show_pdf_page(fitz.Rect(0, 0, width, height), doc, index)

        out_doc.save(str(dst), garbage=4, deflate=True)
    finally:
        out_doc.close()
        doc.close()


def export_pages_as_images(
    src: str | Path,
    output_dir: str | Path,
    page_indices: list[int] | None = None,
    dpi: int = 144,
) -> list[str]:
    """Render selected pages to PNG files and return written paths."""
    if dpi < 24 or dpi > 600:
        raise ValueError("Image export DPI must be between 24 and 600")

    output_dir = Path(output_dir)
    output_dir.mkdir(parents=True, exist_ok=True)
    doc = open_document(src)
    try:
        selected = page_indices if page_indices is not None else list(range(len(doc)))
        if not selected:
            raise ValueError("At least one page must be selected for image export")

        written: list[str] = []
        for index in selected:
            if index < 0 or index >= len(doc):
                raise ValueError(f"Invalid page index {index} for document with {len(doc)} pages")
            page = doc[index]
            pixmap = page.get_pixmap(dpi=dpi, alpha=False)
            out_path = output_dir / f"page_{index + 1:04d}.png"
            pixmap.save(str(out_path))
            written.append(str(out_path))
        return written
    finally:
        doc.close()


def extract_embedded_images(
    src: str | Path,
    output_dir: str | Path,
    page_indices: list[int] | None = None,
) -> list[ExtractedImage]:
    """Extract selected pages' embedded image streams and return written files."""
    output_dir = Path(output_dir)
    output_dir.mkdir(parents=True, exist_ok=True)
    doc = open_document(src)
    try:
        selected = page_indices if page_indices is not None else list(range(len(doc)))
        if not selected:
            raise ValueError("At least one page must be selected for embedded image extraction")

        images: list[ExtractedImage] = []
        for page_index in selected:
            if page_index < 0 or page_index >= len(doc):
                raise ValueError(f"Invalid page index {page_index} for document with {len(doc)} pages")
            for image_number, image_info in enumerate(doc[page_index].get_images(full=True), start=1):
                xref = int(image_info[0])
                extracted = doc.extract_image(xref)
                image_bytes = extracted.get("image")
                if not image_bytes:
                    continue
                ext = str(extracted.get("ext") or "bin").lower()
                out_path = output_dir / f"page_{page_index + 1:04d}_image_{image_number:03d}.{ext}"
                out_path.write_bytes(image_bytes)
                images.append(
                    ExtractedImage(
                        path=str(out_path),
                        page=page_index,
                        xref=xref,
                        width=int(extracted.get("width") or 0),
                        height=int(extracted.get("height") or 0),
                        ext=ext,
                    )
                )
        return images
    finally:
        doc.close()


def normalize_text_export_format(format_name: str) -> str:
    normalized = format_name.strip().lower()
    if normalized in {"md", "markdown"}:
        return "markdown"
    if normalized in {"txt", "text"}:
        return "text"
    raise ValueError(f"Unsupported text export format: {format_name}")


def export_text_document(
    src: str | Path,
    dst: str | Path,
    format_name: str = "markdown",
    page_indices: list[int] | None = None,
) -> int:
    """Export selected PDF text to Markdown or plain text and return page count."""
    export_format = normalize_text_export_format(format_name)
    doc = open_document(src)
    try:
        selected = page_indices if page_indices is not None else list(range(len(doc)))
        if not selected:
            raise ValueError("At least one page must be selected for text export")

        parts: list[str] = []
        if export_format == "markdown":
            parts.extend([f"# {Path(src).name}", ""])

        for index in selected:
            if index < 0 or index >= len(doc):
                raise ValueError(f"Invalid page index {index} for document with {len(doc)} pages")
            text = doc[index].get_text().strip()
            if export_format == "markdown":
                parts.extend([f"## Page {index + 1}", "", text or "_No extractable text on this page._", ""])
            else:
                parts.extend([f"===== Page {index + 1} =====", "", text, ""])

        Path(dst).write_text("\n".join(parts).rstrip() + "\n", encoding="utf-8")
        return len(selected)
    finally:
        doc.close()


def create_pdf_from_images(
    image_paths: list[str | Path],
    dst: str | Path,
    width: float = 595,
    height: float = 842,
    margin: float = 36,
) -> int:
    """Create one PDF page per image, fitting each image inside the page."""
    if width <= 0 or height <= 0:
        raise ValueError("PDF page width and height must be positive")
    if margin < 0 or margin * 2 >= min(width, height):
        raise ValueError("Image PDF margin must be non-negative and leave visible page area")
    if not image_paths:
        raise ValueError("At least one image path is required")

    doc = fitz.open()
    try:
        target = fitz.Rect(margin, margin, width - margin, height - margin)
        for raw_path in image_paths:
            image_path = Path(raw_path)
            if not image_path.is_file():
                raise ValueError(f"Image file not found: {image_path}")
            pixmap = fitz.Pixmap(str(image_path))
            try:
                if pixmap.width <= 0 or pixmap.height <= 0:
                    raise ValueError(f"Invalid image dimensions: {image_path}")
                scale = min(target.width / pixmap.width, target.height / pixmap.height)
                fitted_width = pixmap.width * scale
                fitted_height = pixmap.height * scale
                x0 = target.x0 + (target.width - fitted_width) / 2
                y0 = target.y0 + (target.height - fitted_height) / 2
                rect = fitz.Rect(x0, y0, x0 + fitted_width, y0 + fitted_height)
                page = doc.new_page(width=width, height=height)
                page.insert_image(rect, filename=str(image_path))
            finally:
                pixmap = None

        doc.save(str(dst), garbage=4, deflate=True)
        return len(image_paths)
    finally:
        doc.close()


def write_html_pdf(
    html_text: str,
    dst: str | Path,
    width: float = 595,
    height: float = 842,
    margin: float = 36,
    title: str = "Inkwell HTML Export",
) -> int:
    """Render HTML into a PDF using PyMuPDF's local HTML layout support."""
    content = html_text.strip()
    if not content:
        raise ValueError("HTML content cannot be empty")
    if width <= 0 or height <= 0:
        raise ValueError("PDF page width and height must be positive")
    if margin < 0 or margin * 2 >= min(width, height):
        raise ValueError("HTML PDF margin must be non-negative and leave visible page area")

    doc = fitz.open()
    try:
        page = doc.new_page(width=width, height=height)
        rect = fitz.Rect(margin, margin, width - margin, height - margin)
        page.insert_htmlbox(rect, normalize_html_document(content))
        if title.strip():
            doc.set_metadata({"title": title.strip()})
        doc.save(str(dst), garbage=4, deflate=True)
        return len(doc)
    finally:
        doc.close()


def write_markdown_pdf(
    markdown_text: str,
    dst: str | Path,
    width: float = 595,
    height: float = 842,
    margin: float = 36,
    title: str = "Inkwell Markdown Export",
) -> int:
    """Convert a practical Markdown subset to HTML and write a PDF."""
    content = markdown_text.strip()
    if not content:
        raise ValueError("Markdown content cannot be empty")
    return write_html_pdf(markdown_to_html(content), dst, width=width, height=height, margin=margin, title=title)


def normalize_html_document(content: str) -> str:
    if "<html" in content.lower():
        return content
    return (
        "<html><head><style>"
        "body{font-family:Arial,sans-serif;font-size:12pt;line-height:1.42;color:#111;}"
        "h1{font-size:24pt;margin:0 0 16pt;} h2{font-size:18pt;margin:18pt 0 10pt;}"
        "h3{font-size:14pt;margin:14pt 0 8pt;} p{margin:0 0 9pt;} "
        "code,pre{font-family:Menlo,Consolas,monospace;background:#f3f4f6;} "
        "pre{padding:8pt;white-space:pre-wrap;} li{margin-bottom:4pt;}"
        "</style></head><body>"
        f"{content}"
        "</body></html>"
    )


def markdown_to_html(markdown_text: str) -> str:
    lines = markdown_text.splitlines()
    parts: list[str] = []
    paragraph: list[str] = []
    in_code = False
    code_lines: list[str] = []
    in_list = False

    def flush_paragraph() -> None:
        nonlocal paragraph
        if paragraph:
            parts.append(f"<p>{render_inline_markdown(' '.join(paragraph))}</p>")
            paragraph = []

    def close_list() -> None:
        nonlocal in_list
        if in_list:
            parts.append("</ul>")
            in_list = False

    for raw_line in lines:
        line = raw_line.rstrip()
        stripped = line.strip()
        if stripped.startswith("```"):
            if in_code:
                parts.append(f"<pre><code>{html.escape(chr(10).join(code_lines))}</code></pre>")
                code_lines = []
                in_code = False
            else:
                flush_paragraph()
                close_list()
                in_code = True
            continue
        if in_code:
            code_lines.append(line)
            continue
        if not stripped:
            flush_paragraph()
            close_list()
            continue
        if stripped.startswith("#"):
            marker, _, heading = stripped.partition(" ")
            if 1 <= len(marker) <= 6 and set(marker) == {"#"} and heading.strip():
                flush_paragraph()
                close_list()
                level = min(len(marker), 3)
                parts.append(f"<h{level}>{render_inline_markdown(heading.strip())}</h{level}>")
                continue
        if stripped.startswith(("- ", "* ")):
            flush_paragraph()
            if not in_list:
                parts.append("<ul>")
                in_list = True
            parts.append(f"<li>{render_inline_markdown(stripped[2:].strip())}</li>")
            continue
        close_list()
        paragraph.append(stripped)

    if in_code:
        parts.append(f"<pre><code>{html.escape(chr(10).join(code_lines))}</code></pre>")
    flush_paragraph()
    close_list()
    return "\n".join(parts)


def render_inline_markdown(text: str) -> str:
    escaped = html.escape(text)
    # Keep this deliberately small and predictable; full CommonMark belongs in
    # the future Chromium-quality conversion pipeline.
    import re

    escaped = re.sub(r"\*\*(.+?)\*\*", r"<strong>\1</strong>", escaped)
    escaped = re.sub(r"`(.+?)`", r"<code>\1</code>", escaped)
    return escaped


def read_outline(path: str | Path) -> list[OutlineItem]:
    """Read the document outline/bookmarks as a JSON-friendly list."""
    doc = open_document(path)
    try:
        items: list[OutlineItem] = []
        for raw_item in doc.get_toc(simple=False):
            level = int(raw_item[0])
            title = str(raw_item[1])
            page = int(raw_item[2])
            x: float | None = None
            y: float | None = None
            if len(raw_item) > 3 and isinstance(raw_item[3], dict):
                destination = raw_item[3]
                point = destination.get("to")
                if point is not None and hasattr(point, "x") and hasattr(point, "y"):
                    x = float(point.x)
                    y = float(point.y)
            items.append(OutlineItem(level=level, title=title, page=page, x=x, y=y))
        return items
    finally:
        doc.close()


def set_outline(src: str | Path, dst: str | Path, items: list[OutlineItem]) -> None:
    """Replace the document outline/bookmarks and write a new PDF."""
    doc = open_document(src)
    try:
        toc: list[list[object]] = []
        previous_level = 0
        for item in items:
            title = item.title.strip()
            if item.level < 1:
                raise ValueError("Outline levels must be positive")
            if item.level > previous_level + 1:
                raise ValueError("Outline levels cannot skip hierarchy levels")
            if not title:
                raise ValueError("Outline titles cannot be empty")
            if item.page < 1 or item.page > len(doc):
                raise ValueError(f"Invalid outline page {item.page} for document with {len(doc)} pages")
            toc.append([item.level, title, item.page])
            previous_level = item.level

        doc.set_toc(toc)
        doc.save(str(dst), garbage=4, deflate=True)
    finally:
        doc.close()


def list_attachments(path: str | Path) -> list[AttachmentInfo]:
    """List embedded file attachments with stable names and basic metadata."""
    doc = open_document(path)
    try:
        attachments: list[AttachmentInfo] = []
        for name in doc.embfile_names():
            info = doc.embfile_info(name)
            attachments.append(
                AttachmentInfo(
                    name=str(info.get("name") or name),
                    filename=str(info.get("filename") or name),
                    description=str(info.get("desc") or info.get("description") or info.get("descender") or ""),
                    size=int(info.get("size") or info.get("length") or 0),
                )
            )
        return attachments
    finally:
        doc.close()


def add_attachment(
    src: str | Path,
    dst: str | Path,
    file_path: str | Path,
    name: str | None = None,
    description: str = "",
) -> AttachmentInfo:
    """Embed a local file attachment and write a new PDF."""
    attachment_path = Path(file_path)
    if not attachment_path.is_file():
        raise ValueError(f"Attachment file not found: {attachment_path}")

    attachment_name = (name or attachment_path.name).strip()
    if not attachment_name:
        raise ValueError("Attachment name cannot be empty")

    doc = open_document(src)
    try:
        if attachment_name in doc.embfile_names():
            raise ValueError(f"Attachment already exists: {attachment_name}")
        data = attachment_path.read_bytes()
        doc.embfile_add(
            attachment_name,
            data,
            filename=attachment_path.name,
            ufilename=attachment_name,
            desc=description.strip(),
        )
        doc.save(str(dst), garbage=4, deflate=True)
        return AttachmentInfo(
            name=attachment_name,
            filename=attachment_path.name,
            description=description.strip(),
            size=len(data),
        )
    finally:
        doc.close()


def remove_attachments(src: str | Path, dst: str | Path, names: list[str]) -> int:
    """Remove named embedded attachments and write a new PDF."""
    cleaned = [name.strip() for name in names if name.strip()]
    if not cleaned:
        raise ValueError("At least one attachment name is required")

    doc = open_document(src)
    try:
        available = set(doc.embfile_names())
        for name in cleaned:
            if name not in available:
                raise ValueError(f"Attachment not found: {name}")
        for name in cleaned:
            doc.embfile_del(name)
        doc.save(str(dst), garbage=4, deflate=True)
        return len(cleaned)
    finally:
        doc.close()


def extract_attachments(
    src: str | Path,
    output_dir: str | Path,
    names: list[str] | None = None,
) -> list[ExtractedAttachment]:
    """Extract embedded attachments to a directory and return written files."""
    output_path = Path(output_dir)
    output_path.mkdir(parents=True, exist_ok=True)
    doc = open_document(src)
    try:
        selected = [name.strip() for name in names if name.strip()] if names is not None else list(doc.embfile_names())
        if not selected:
            raise ValueError("At least one attachment must be selected for extraction")

        available = set(doc.embfile_names())
        written: list[ExtractedAttachment] = []
        used_names: set[str] = set()
        for index, name in enumerate(selected, start=1):
            if name not in available:
                raise ValueError(f"Attachment not found: {name}")
            data = doc.embfile_get(name)
            safe_name = safe_output_filename(name, fallback=f"attachment_{index:03d}.bin")
            unique_name = unique_output_filename(safe_name, used_names)
            used_names.add(unique_name)
            out_file = output_path / unique_name
            out_file.write_bytes(data)
            written.append(ExtractedAttachment(name=name, path=str(out_file), size=len(data)))
        return written
    finally:
        doc.close()


def safe_output_filename(name: str, fallback: str) -> str:
    normalized = name.replace("\\", "/")
    safe = Path(normalized).name.strip()
    return safe or fallback


def unique_output_filename(filename: str, used_names: set[str]) -> str:
    if filename not in used_names:
        return filename
    path = Path(filename)
    stem = path.stem or "attachment"
    suffix = path.suffix
    counter = 2
    while True:
        candidate = f"{stem}_{counter}{suffix}"
        if candidate not in used_names:
            return candidate
        counter += 1


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


@dataclass(frozen=True)
class CompressionResult:
    input_bytes: int
    output_bytes: int
    saved_bytes: int
    saved_percent: float


def compress_pdf(src: str | Path, dst: str | Path) -> CompressionResult:
    """Write an optimized PDF copy using lossless stream/object compression."""
    src_path = Path(src)
    dst_path = Path(dst)
    doc = open_document(src_path)
    try:
        doc.save(
            str(dst_path),
            garbage=4,
            clean=True,
            deflate=True,
            deflate_images=True,
            deflate_fonts=True,
            use_objstms=True,
            compression_effort=9,
        )
    finally:
        doc.close()

    input_bytes = src_path.stat().st_size
    output_bytes = dst_path.stat().st_size
    saved_bytes = input_bytes - output_bytes
    saved_percent = (saved_bytes / input_bytes * 100) if input_bytes else 0
    return CompressionResult(
        input_bytes=input_bytes,
        output_bytes=output_bytes,
        saved_bytes=saved_bytes,
        saved_percent=round(saved_percent, 2),
    )


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
class CropMargins:
    left: float = 0
    top: float = 0
    right: float = 0
    bottom: float = 0


def crop_pages(
    src: str | Path,
    dst: str | Path,
    margins: CropMargins,
    page_indices: list[int] | None = None,
) -> None:
    """Crop selected pages by setting their PDF crop boxes and write a new file."""
    if min(margins.left, margins.top, margins.right, margins.bottom) < 0:
        raise ValueError("Crop margins must be non-negative")

    doc = open_document(src)
    try:
        selected = set(page_indices) if page_indices is not None else set(range(len(doc)))
        for index in selected:
            if index < 0 or index >= len(doc):
                raise ValueError(f"Invalid page index {index} for document with {len(doc)} pages")

            page = doc[index]
            box = page.cropbox
            crop = fitz.Rect(
                box.x0 + margins.left,
                box.y0 + margins.top,
                box.x1 - margins.right,
                box.y1 - margins.bottom,
            )
            if crop.width <= 1 or crop.height <= 1:
                raise ValueError(f"Crop margins leave no visible page area on page {index + 1}")
            page.set_cropbox(crop)

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
