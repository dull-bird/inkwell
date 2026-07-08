"""FastAPI server exposing PDF operations to the Electron frontend."""

from __future__ import annotations

import mimetypes
import os
import secrets
import tempfile
from pathlib import Path

from fastapi import FastAPI, HTTPException, Query, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, JSONResponse
from typing import Optional, List, Dict, Tuple, Union
from pydantic import BaseModel

from . import pdf_engine

app = FastAPI(title="Inkwell Backend")

# The Electron main process generates this per-launch and passes it to us via
# env, then hands it to the renderer over IPC. Without it, any local process
# that can reach 127.0.0.1:PORT could read arbitrary files through /pdf or
# invoke destructive operations (merge/split/encrypt) on the caller's behalf.
_TOKEN = os.environ.get("INKWELL_TOKEN")


@app.middleware("http")
async def require_token(request: Request, call_next):
    if request.url.path == "/health":
        return await call_next(request)
    if _TOKEN:
        supplied = request.headers.get("x-inkwell-token") or request.query_params.get("token")
        if not supplied or not secrets.compare_digest(supplied, _TOKEN):
            return JSONResponse({"detail": "Missing or invalid token"}, status_code=401)
    return await call_next(request)


# Added after require_token so it wraps outermost (Starlette runs the
# last-added middleware first) and can answer CORS preflight OPTIONS requests
# — which never carry the X-Inkwell-Token header — before the token check
# would otherwise reject them. The renderer's origin is http://localhost:5173
# in dev and a packaged app's file:// origin in production; both trigger a
# preflight for the custom token header. There's no session/cookie to leak
# (auth is the token, checked above) and the server only binds to 127.0.0.1,
# so a wide allow-list is fine here.
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)


class ExtractTextRequest(BaseModel):
    path: str
    page: Optional[int] = None


class DocumentInfoRequest(BaseModel):
    path: str


class HighlightRequest(BaseModel):
    path: str
    query: str
    color: Tuple[float, float, float] = (1.0, 1.0, 0.0)


class HighlightHeadingsRequest(BaseModel):
    path: str
    color: Tuple[float, float, float] = (1.0, 1.0, 0.0)
    opacity: float = 0.25


class ApplyRequest(BaseModel):
    path: str
    operations: List[Dict]


class MergeRequest(BaseModel):
    paths: List[str]


class PageRangeRequest(BaseModel):
    start: int
    end: int


PageRangeInput = Union[Tuple[int, int], PageRangeRequest]


class SplitRequest(BaseModel):
    path: str
    output_dir: Optional[str] = None
    # 0-based inclusive ranges for internal callers.
    ranges: Optional[List[Tuple[int, int]]] = None
    # 1-based inclusive ranges for UI/agent-facing requests.
    page_ranges: Optional[List[PageRangeInput]] = None

    def normalized_ranges(self) -> Optional[List[Tuple[int, int]]]:
        if self.page_ranges is not None:
            normalized: List[Tuple[int, int]] = []
            for item in self.page_ranges:
                if isinstance(item, PageRangeRequest):
                    start, end = item.start, item.end
                else:
                    start, end = item
                if start > end:
                    raise ValueError(f"Invalid page range {start}-{end}")
                normalized.append((start - 1, end - 1))
            return normalized
        return self.ranges


class WatermarkRequest(BaseModel):
    path: str
    text: str


class CompressRequest(BaseModel):
    path: str


class CommentRequest(BaseModel):
    path: str
    page: int
    x: float
    y: float
    text: str
    author: str = "Inkwell"


class FreeTextRequest(BaseModel):
    path: str
    page: int
    x: float
    y: float
    text: str
    author: str = "Sparrow"


class StampRequest(BaseModel):
    path: str
    page: int
    x: float
    y: float
    stamp: str = "Approved"
    author: str = "Sparrow"


class ShapeRequest(BaseModel):
    path: str
    page: int
    x: float
    y: float
    kind: str = "rectangle"
    width: float = 160
    height: float = 90
    color: Tuple[float, float, float] = (0.1, 0.45, 0.95)
    stroke_width: float = 2
    author: str = "Sparrow"


class InsertImageRequest(BaseModel):
    path: str
    page: int
    x: float
    y: float
    image_path: str
    width: float = 180
    height: float = 120


class TextMarkupRequest(BaseModel):
    path: str
    query: str
    kind: str
    color: Tuple[float, float, float] = (1.0, 0.64, 0.0)
    author: str = "Sparrow"


class RedactRequest(BaseModel):
    path: str
    query: str
    # 0-based page indices. Omit to redact every page.
    page_indices: Optional[List[int]] = None


class SignatureRequest(BaseModel):
    path: str
    page: int
    x: float
    y: float
    text: str
    signer: str = "Sparrow"


class ImageSignatureRequest(BaseModel):
    path: str
    page: int
    x: float
    y: float
    image_path: str
    width: float = 180
    height: float = 60
    signer: str = "Sparrow"


class EncryptRequest(BaseModel):
    path: str
    user_pw: str
    owner_pw: Optional[str] = None
    # None means "grant every permission" (see pdf_engine.ALL_PERMISSIONS).
    permissions: Optional[int] = None


class RotateRequest(BaseModel):
    path: str
    # 0-based page -> absolute rotation in degrees (0/90/180/270).
    rotations: Dict[int, int]


class ReorderRequest(BaseModel):
    path: str
    # 0-based page indices in the new order. Omitted pages are dropped.
    new_order: List[int]


class ExtractPagesRequest(BaseModel):
    path: str
    # 0-based page indices in the output order.
    page_indices: List[int]


class InsertBlankPagesRequest(BaseModel):
    path: str
    # 0-based output insertion index: 0 before first page, page_count after last page.
    insert_index: int
    count: int = 1
    width: Optional[float] = None
    height: Optional[float] = None


class ExportImagesRequest(BaseModel):
    path: str
    output_dir: Optional[str] = None
    # 0-based page indices. Omit to export every page.
    page_indices: Optional[List[int]] = None
    dpi: int = 144


class ExtractImagesRequest(BaseModel):
    path: str
    output_dir: Optional[str] = None
    # 0-based page indices. Omit to scan every page.
    page_indices: Optional[List[int]] = None


class ExportTextRequest(BaseModel):
    path: str
    format: str = "markdown"
    # 0-based page indices. Omit to export every page.
    page_indices: Optional[List[int]] = None


class ImagesToPdfRequest(BaseModel):
    image_paths: List[str]
    output_path: Optional[str] = None
    width: float = 595
    height: float = 842
    margin: float = 36


class HtmlToPdfRequest(BaseModel):
    html: str
    output_path: Optional[str] = None
    title: str = "Inkwell HTML Export"
    width: float = 595
    height: float = 842
    margin: float = 36


class MarkdownToPdfRequest(BaseModel):
    markdown: str
    output_path: Optional[str] = None
    title: str = "Inkwell Markdown Export"
    width: float = 595
    height: float = 842
    margin: float = 36


class CropMarginsRequest(BaseModel):
    left: float = 0
    top: float = 0
    right: float = 0
    bottom: float = 0


class CropRequest(BaseModel):
    path: str
    margins: CropMarginsRequest
    # 0-based page indices. Omit to crop every page.
    page_indices: Optional[List[int]] = None


class ResizePagesRequest(BaseModel):
    path: str
    width: float
    height: float
    # 0-based page indices. Omit to resize every page.
    page_indices: Optional[List[int]] = None


class OutlineItemRequest(BaseModel):
    level: int
    title: str
    # 1-based page number.
    page: int
    x: Optional[float] = None
    y: Optional[float] = None


class OutlineRequest(BaseModel):
    path: str


class SetOutlineRequest(BaseModel):
    path: str
    outline: List[OutlineItemRequest]


class AttachmentsRequest(BaseModel):
    path: str


class AddAttachmentRequest(BaseModel):
    path: str
    file_path: str
    name: Optional[str] = None
    description: str = ""


class ExtractAttachmentsRequest(BaseModel):
    path: str
    output_dir: Optional[str] = None
    names: Optional[List[str]] = None


class RemoveAttachmentsRequest(BaseModel):
    path: str
    names: List[str]


class FormFieldsRequest(BaseModel):
    path: str


class FillFormRequest(BaseModel):
    path: str
    # Form field name -> value to set.
    values: Dict[str, object]


@app.get("/health")
def health() -> dict:
    return {"status": "ok"}


@app.get("/pdf")
def serve_pdf(path: str = Query(..., description="Absolute path to PDF file")) -> FileResponse:
    p = Path(path)
    if not p.is_file():
        raise HTTPException(status_code=404, detail="File not found")
    media_type, _ = mimetypes.guess_type(str(p))
    return FileResponse(str(p), media_type=media_type or "application/pdf")


def serialize_highlight_op(op: pdf_engine.HighlightOp) -> dict:
    return {
        "id": f"p{op.page}-{'-'.join(f'{r.x0:.1f},{r.y0:.1f},{r.x1:.1f},{r.y1:.1f}' for r in op.rects)}",
        "page": op.page,
        "rects": [{"x0": r.x0, "y0": r.y0, "x1": r.x1, "y1": r.y1} for r in op.rects],
        "color": op.color,
        "opacity": op.opacity,
        "text": op.text,
    }


def serialize_outline_item(item: pdf_engine.OutlineItem) -> dict:
    result = {"level": item.level, "title": item.title, "page": item.page}
    if item.x is not None and item.y is not None:
        result["x"] = item.x
        result["y"] = item.y
    return result


def serialize_attachment(info: pdf_engine.AttachmentInfo) -> dict:
    return {
        "name": info.name,
        "filename": info.filename,
        "description": info.description,
        "size": info.size,
    }


def temporary_pdf_path(prefix: str = "inkwell-") -> Path:
    fd, path = tempfile.mkstemp(prefix=prefix, suffix=".pdf")
    os.close(fd)
    return Path(path)


def sibling_pdf_path(src: Path, stem_suffix: str) -> Path:
    """Return a sibling path like `<original>_<suffix>.pdf`.

    `Path.with_stem` is only available in newer Python releases, while the
    Electron dev backend can run on the system Python 3.8.
    """
    return src.with_name(f"{src.stem}_{stem_suffix}{src.suffix}")


@app.post("/extract-text")
def extract_text(req: ExtractTextRequest) -> JSONResponse:
    try:
        text = pdf_engine.extract_text(req.path, req.page)
        return JSONResponse({"path": req.path, "text": text})
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/document-info")
def document_info(req: DocumentInfoRequest) -> JSONResponse:
    try:
        return JSONResponse({"path": req.path, **pdf_engine.document_info(req.path)})
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/highlight")
def highlight(req: HighlightRequest) -> JSONResponse:
    try:
        ops = pdf_engine.highlight_text(req.path, req.query, req.color)
        return JSONResponse({"path": req.path, "query": req.query, "operations": [serialize_highlight_op(op) for op in ops]})
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/highlight-headings")
def highlight_headings(req: HighlightHeadingsRequest) -> JSONResponse:
    try:
        ops = pdf_engine.detect_heading_highlights(req.path, req.color, req.opacity)
        return JSONResponse({"path": req.path, "operations": [serialize_highlight_op(op) for op in ops]})
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/apply")
def apply(req: ApplyRequest) -> JSONResponse:
    try:
        src = Path(req.path)
        dst = sibling_pdf_path(src, "applied")
        ops = [
            pdf_engine.HighlightOp(
                page=op["page"],
                rects=[pdf_engine.Rect(**r) for r in op["rects"]],
                color=tuple(op["color"]),
                opacity=op.get("opacity", 0.25),
                text=op.get("text", ""),
            )
            for op in req.operations
        ]
        pdf_engine.apply_operations(src, dst, ops)
        return JSONResponse({"source": str(src), "output": str(dst)})
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/merge")
def merge(req: MergeRequest) -> JSONResponse:
    try:
        dst = temporary_pdf_path()
        pdf_engine.merge_pdfs(req.paths, dst)
        return JSONResponse({"output": str(dst)})
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/split")
def split(req: SplitRequest) -> JSONResponse:
    try:
        output_dir = req.output_dir or tempfile.mkdtemp()
        files = pdf_engine.split_pdf(req.path, output_dir, ranges=req.normalized_ranges())
        return JSONResponse({"output_dir": output_dir, "files": files})
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/watermark")
def watermark(req: WatermarkRequest) -> JSONResponse:
    try:
        src = Path(req.path)
        dst = sibling_pdf_path(src, "watermarked")
        pdf_engine.add_watermark(src, dst, req.text)
        return JSONResponse({"source": str(src), "output": str(dst)})
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/compress")
def compress(req: CompressRequest) -> JSONResponse:
    try:
        src = Path(req.path)
        dst = sibling_pdf_path(src, "compressed")
        result = pdf_engine.compress_pdf(src, dst)
        return JSONResponse(
            {
                "source": str(src),
                "output": str(dst),
                "input_bytes": result.input_bytes,
                "output_bytes": result.output_bytes,
                "saved_bytes": result.saved_bytes,
                "saved_percent": result.saved_percent,
            }
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/comment")
def comment(req: CommentRequest) -> JSONResponse:
    try:
        src = Path(req.path)
        dst = sibling_pdf_path(src, "commented")
        pdf_engine.add_comment(
            src,
            dst,
            page=req.page,
            point=pdf_engine.Point(req.x, req.y),
            text=req.text,
            author=req.author,
        )
        return JSONResponse({"source": str(src), "output": str(dst)})
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/free-text")
def free_text(req: FreeTextRequest) -> JSONResponse:
    try:
        src = Path(req.path)
        dst = sibling_pdf_path(src, "free_text")
        pdf_engine.add_free_text(
            src,
            dst,
            page=req.page,
            point=pdf_engine.Point(req.x, req.y),
            text=req.text,
            author=req.author,
        )
        return JSONResponse({"source": str(src), "output": str(dst)})
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/stamp")
def stamp(req: StampRequest) -> JSONResponse:
    try:
        src = Path(req.path)
        dst = sibling_pdf_path(src, "stamped")
        normalized = pdf_engine.add_stamp_annotation(
            src,
            dst,
            page=req.page,
            point=pdf_engine.Point(req.x, req.y),
            stamp=req.stamp,
            author=req.author,
        )
        return JSONResponse({"source": str(src), "output": str(dst), "stamp": normalized})
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/shape")
def shape(req: ShapeRequest) -> JSONResponse:
    try:
        src = Path(req.path)
        dst = sibling_pdf_path(src, "shaped")
        normalized = pdf_engine.add_shape_annotation(
            src,
            dst,
            page=req.page,
            point=pdf_engine.Point(req.x, req.y),
            kind=req.kind,
            width=req.width,
            height=req.height,
            color=req.color,
            stroke_width=req.stroke_width,
            author=req.author,
        )
        return JSONResponse({"source": str(src), "output": str(dst), "shape": normalized})
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/insert-image")
def insert_image(req: InsertImageRequest) -> JSONResponse:
    try:
        src = Path(req.path)
        dst = sibling_pdf_path(src, "image")
        pdf_engine.insert_pdf_image(
            src,
            dst,
            page=req.page,
            point=pdf_engine.Point(req.x, req.y),
            image_path=req.image_path,
            width=req.width,
            height=req.height,
        )
        return JSONResponse({"source": str(src), "output": str(dst)})
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/text-markup")
def text_markup(req: TextMarkupRequest) -> JSONResponse:
    try:
        suffixes = {"underline": "underlined", "strikeout": "strikeout"}
        if req.kind not in suffixes:
            raise ValueError(f"Unsupported text markup kind: {req.kind}")
        src = Path(req.path)
        dst = sibling_pdf_path(src, suffixes[req.kind])
        count = pdf_engine.add_text_markup(
            src,
            dst,
            query=req.query,
            kind=req.kind,
            color=req.color,
            author=req.author,
        )
        return JSONResponse({"source": str(src), "output": str(dst), "kind": req.kind, "query": req.query, "count": count})
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/redact")
def redact(req: RedactRequest) -> JSONResponse:
    try:
        src = Path(req.path)
        dst = sibling_pdf_path(src, "redacted")
        result = pdf_engine.redact_text(src, dst, query=req.query, page_indices=req.page_indices)
        return JSONResponse(
            {
                "source": str(src),
                "output": str(dst),
                "query": req.query,
                "count": result.match_count,
                "pages": result.pages,
            }
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/signature")
def signature(req: SignatureRequest) -> JSONResponse:
    try:
        src = Path(req.path)
        dst = sibling_pdf_path(src, "signed")
        pdf_engine.add_typed_signature(
            src,
            dst,
            page=req.page,
            point=pdf_engine.Point(req.x, req.y),
            text=req.text,
            signer=req.signer,
        )
        return JSONResponse({"source": str(src), "output": str(dst)})
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/image-signature")
def image_signature(req: ImageSignatureRequest) -> JSONResponse:
    try:
        src = Path(req.path)
        dst = sibling_pdf_path(src, "image_signed")
        pdf_engine.add_image_signature(
            src,
            dst,
            page=req.page,
            point=pdf_engine.Point(req.x, req.y),
            image_path=req.image_path,
            width=req.width,
            height=req.height,
        )
        return JSONResponse({"source": str(src), "output": str(dst), "signer": req.signer})
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/encrypt")
def encrypt(req: EncryptRequest) -> JSONResponse:
    try:
        src = Path(req.path)
        dst = sibling_pdf_path(src, "encrypted")
        pdf_engine.encrypt_pdf(src, dst, req.user_pw, req.owner_pw, req.permissions)
        return JSONResponse({"source": str(src), "output": str(dst)})
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/rotate")
def rotate(req: RotateRequest) -> JSONResponse:
    try:
        src = Path(req.path)
        dst = sibling_pdf_path(src, "rotated")
        pdf_engine.rotate_pages(src, dst, req.rotations)
        return JSONResponse({"source": str(src), "output": str(dst)})
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/reorder")
def reorder(req: ReorderRequest) -> JSONResponse:
    try:
        src = Path(req.path)
        dst = sibling_pdf_path(src, "reordered")
        pdf_engine.reorder_pages(src, dst, req.new_order)
        return JSONResponse({"source": str(src), "output": str(dst)})
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/extract-pages")
def extract_pages(req: ExtractPagesRequest) -> JSONResponse:
    try:
        src = Path(req.path)
        dst = sibling_pdf_path(src, "extracted")
        pdf_engine.extract_pages(src, dst, req.page_indices)
        return JSONResponse({"source": str(src), "output": str(dst), "page_count": len(req.page_indices)})
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/insert-blank-pages")
def insert_blank_pages(req: InsertBlankPagesRequest) -> JSONResponse:
    try:
        src = Path(req.path)
        dst = sibling_pdf_path(src, "blank_pages")
        pdf_engine.insert_blank_pages(src, dst, req.insert_index, req.count, req.width, req.height)
        return JSONResponse({"source": str(src), "output": str(dst), "insert_index": req.insert_index, "page_count": req.count})
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/export-images")
def export_images(req: ExportImagesRequest) -> JSONResponse:
    try:
        output_dir = req.output_dir or tempfile.mkdtemp(prefix="inkwell-images-")
        files = pdf_engine.export_pages_as_images(req.path, output_dir, req.page_indices, req.dpi)
        return JSONResponse({"output_dir": output_dir, "files": files, "page_count": len(files), "dpi": req.dpi})
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/extract-images")
def extract_images(req: ExtractImagesRequest) -> JSONResponse:
    try:
        output_dir = req.output_dir or tempfile.mkdtemp(prefix="inkwell-extracted-images-")
        images = pdf_engine.extract_embedded_images(req.path, output_dir, req.page_indices)
        return JSONResponse(
            {
                "output_dir": output_dir,
                "images": [
                    {
                        "path": image.path,
                        "page": image.page,
                        "xref": image.xref,
                        "width": image.width,
                        "height": image.height,
                        "ext": image.ext,
                    }
                    for image in images
                ],
                "count": len(images),
            }
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/export-text")
def export_text(req: ExportTextRequest) -> JSONResponse:
    try:
        src = Path(req.path)
        export_format = pdf_engine.normalize_text_export_format(req.format)
        suffix = ".md" if export_format == "markdown" else ".txt"
        stem_suffix = "_markdown" if export_format == "markdown" else "_text"
        dst = src.with_name(f"{src.stem}{stem_suffix}{suffix}")
        page_count = pdf_engine.export_text_document(src, dst, export_format, req.page_indices)
        return JSONResponse(
            {
                "source": str(src),
                "output": str(dst),
                "format": export_format,
                "page_count": page_count,
            }
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/images-to-pdf")
def images_to_pdf(req: ImagesToPdfRequest) -> JSONResponse:
    try:
        if req.output_path:
            dst = Path(req.output_path)
        else:
            if not req.image_paths:
                raise ValueError("At least one image path is required")
            first = Path(req.image_paths[0])
            dst = first.with_name(f"{first.stem}_images.pdf")
        page_count = pdf_engine.create_pdf_from_images(req.image_paths, dst, req.width, req.height, req.margin)
        return JSONResponse({"output": str(dst), "page_count": page_count})
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/html-to-pdf")
def html_to_pdf(req: HtmlToPdfRequest) -> JSONResponse:
    try:
        if req.output_path:
            dst = Path(req.output_path)
        else:
            dst = temporary_pdf_path("inkwell-html-")
        page_count = pdf_engine.write_html_pdf(req.html, dst, req.width, req.height, req.margin, req.title)
        return JSONResponse({"output": str(dst), "page_count": page_count})
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/markdown-to-pdf")
def markdown_to_pdf(req: MarkdownToPdfRequest) -> JSONResponse:
    try:
        if req.output_path:
            dst = Path(req.output_path)
        else:
            dst = temporary_pdf_path("inkwell-markdown-")
        page_count = pdf_engine.write_markdown_pdf(req.markdown, dst, req.width, req.height, req.margin, req.title)
        return JSONResponse({"output": str(dst), "page_count": page_count})
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/crop")
def crop(req: CropRequest) -> JSONResponse:
    try:
        src = Path(req.path)
        dst = sibling_pdf_path(src, "cropped")
        pdf_engine.crop_pages(
            src,
            dst,
            pdf_engine.CropMargins(
                left=req.margins.left,
                top=req.margins.top,
                right=req.margins.right,
                bottom=req.margins.bottom,
            ),
            req.page_indices,
        )
        return JSONResponse({"source": str(src), "output": str(dst)})
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/resize-pages")
def resize_pages(req: ResizePagesRequest) -> JSONResponse:
    try:
        src = Path(req.path)
        dst = sibling_pdf_path(src, "resized")
        pdf_engine.resize_pages(src, dst, req.width, req.height, req.page_indices)
        return JSONResponse({"source": str(src), "output": str(dst), "width": req.width, "height": req.height})
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/outline")
def outline(req: OutlineRequest) -> JSONResponse:
    try:
        outline_items = pdf_engine.read_outline(req.path)
        return JSONResponse(
            {
                "path": req.path,
                "outline": [serialize_outline_item(item) for item in outline_items],
                "count": len(outline_items),
            }
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/set-outline")
def set_outline(req: SetOutlineRequest) -> JSONResponse:
    try:
        src = Path(req.path)
        dst = sibling_pdf_path(src, "outlined")
        pdf_engine.set_outline(
            src,
            dst,
            [
                pdf_engine.OutlineItem(
                    level=item.level,
                    title=item.title,
                    page=item.page,
                    x=item.x,
                    y=item.y,
                )
                for item in req.outline
            ],
        )
        return JSONResponse({"source": str(src), "output": str(dst), "count": len(req.outline)})
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/attachments")
def attachments(req: AttachmentsRequest) -> JSONResponse:
    try:
        attached = pdf_engine.list_attachments(req.path)
        return JSONResponse(
            {
                "path": req.path,
                "attachments": [serialize_attachment(info) for info in attached],
                "count": len(attached),
            }
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/add-attachment")
def add_attachment(req: AddAttachmentRequest) -> JSONResponse:
    try:
        src = Path(req.path)
        dst = sibling_pdf_path(src, "attached")
        info = pdf_engine.add_attachment(src, dst, req.file_path, req.name, req.description)
        return JSONResponse({"source": str(src), "output": str(dst), "attachment": serialize_attachment(info)})
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/extract-attachments")
def extract_attachments(req: ExtractAttachmentsRequest) -> JSONResponse:
    try:
        output_dir = req.output_dir or tempfile.mkdtemp(prefix="inkwell-attachments-")
        files = pdf_engine.extract_attachments(req.path, output_dir, req.names)
        return JSONResponse(
            {
                "output_dir": output_dir,
                "files": [
                    {
                        "name": item.name,
                        "path": item.path,
                        "size": item.size,
                    }
                    for item in files
                ],
                "count": len(files),
            }
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/remove-attachments")
def remove_attachments(req: RemoveAttachmentsRequest) -> JSONResponse:
    try:
        src = Path(req.path)
        dst = sibling_pdf_path(src, "attachments_removed")
        count = pdf_engine.remove_attachments(src, dst, req.names)
        return JSONResponse({"source": str(src), "output": str(dst), "count": count})
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/form-fields")
def form_fields(req: FormFieldsRequest) -> JSONResponse:
    try:
        fields = pdf_engine.read_form_fields(req.path)
        return JSONResponse({
            "path": req.path,
            "fields": [
                {
                    "name": f.name,
                    "type": f.type,
                    "value": f.value,
                    "page": f.page,
                    "rect": {"x0": f.rect.x0, "y0": f.rect.y0, "x1": f.rect.x1, "y1": f.rect.y1},
                }
                for f in fields
            ],
        })
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/fill-form")
def fill_form(req: FillFormRequest) -> JSONResponse:
    try:
        src = Path(req.path)
        dst = sibling_pdf_path(src, "filled")
        not_found = pdf_engine.fill_form_fields(src, dst, req.values)
        return JSONResponse({"source": str(src), "output": str(dst), "fields_not_found": not_found})
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


def main() -> None:
    port = int(os.environ.get("INKWELL_PORT", "18765"))
    import uvicorn

    uvicorn.run(app, host="127.0.0.1", port=port, log_level="info")


if __name__ == "__main__":
    main()
