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
from typing import Optional, List, Dict, Tuple
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


class SplitRequest(BaseModel):
    path: str
    output_dir: Optional[str] = None
    # 0-based inclusive ranges for internal callers.
    ranges: Optional[List[Tuple[int, int]]] = None
    # 1-based inclusive ranges for UI/agent-facing requests.
    page_ranges: Optional[List[Tuple[int, int]]] = None

    def normalized_ranges(self) -> Optional[List[Tuple[int, int]]]:
        if self.page_ranges is not None:
            return [(start - 1, end - 1) for start, end in self.page_ranges]
        return self.ranges


class WatermarkRequest(BaseModel):
    path: str
    text: str


class CommentRequest(BaseModel):
    path: str
    page: int
    x: float
    y: float
    text: str
    author: str = "Inkwell"


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
        dst = src.with_stem(f"{src.stem}_applied")
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
        _, dst = tempfile.mkstemp(suffix=".pdf")
        pdf_engine.merge_pdfs(req.paths, dst)
        return JSONResponse({"output": dst})
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
        dst = src.with_stem(f"{src.stem}_watermarked")
        pdf_engine.add_watermark(src, dst, req.text)
        return JSONResponse({"source": str(src), "output": str(dst)})
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/comment")
def comment(req: CommentRequest) -> JSONResponse:
    try:
        src = Path(req.path)
        dst = src.with_stem(f"{src.stem}_commented")
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


@app.post("/encrypt")
def encrypt(req: EncryptRequest) -> JSONResponse:
    try:
        src = Path(req.path)
        dst = src.with_stem(f"{src.stem}_encrypted")
        pdf_engine.encrypt_pdf(src, dst, req.user_pw, req.owner_pw, req.permissions)
        return JSONResponse({"source": str(src), "output": str(dst)})
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/rotate")
def rotate(req: RotateRequest) -> JSONResponse:
    try:
        src = Path(req.path)
        dst = src.with_stem(f"{src.stem}_rotated")
        pdf_engine.rotate_pages(src, dst, req.rotations)
        return JSONResponse({"source": str(src), "output": str(dst)})
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/reorder")
def reorder(req: ReorderRequest) -> JSONResponse:
    try:
        src = Path(req.path)
        dst = src.with_stem(f"{src.stem}_reordered")
        pdf_engine.reorder_pages(src, dst, req.new_order)
        return JSONResponse({"source": str(src), "output": str(dst)})
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
        dst = src.with_stem(f"{src.stem}_filled")
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
