import unittest
from pathlib import Path
import sys

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from inkwell.server import (
    CompressRequest,
    CropRequest,
    AddAttachmentRequest,
    AttachmentsRequest,
    ExportImagesRequest,
    ExportTextRequest,
    ExtractAttachmentsRequest,
    ExtractImagesRequest,
    ExtractPagesRequest,
    FreeTextRequest,
    HtmlToPdfRequest,
    ImageSignatureRequest,
    ImagesToPdfRequest,
    InsertBlankPagesRequest,
    InsertImageRequest,
    MarkdownToPdfRequest,
    OutlineRequest,
    RemoveAttachmentsRequest,
    RedactRequest,
    ResizePagesRequest,
    ShapeRequest,
    SignatureRequest,
    SplitRequest,
    StampRequest,
    SetOutlineRequest,
    TextMarkupRequest,
    sibling_pdf_path,
)


class SplitRequestTests(unittest.TestCase):
    def test_normalizes_agent_object_page_ranges(self) -> None:
        req = SplitRequest.model_validate(
            {"path": "/tmp/example.pdf", "page_ranges": [{"start": 2, "end": 5}]}
        )
        self.assertEqual(req.normalized_ranges(), [(1, 4)])

    def test_keeps_legacy_pair_page_ranges_for_ui_requests(self) -> None:
        req = SplitRequest.model_validate(
            {"path": "/tmp/example.pdf", "page_ranges": [[1, 3]]}
        )
        self.assertEqual(req.normalized_ranges(), [(0, 2)])


class SignatureRequestTests(unittest.TestCase):
    def test_accepts_typed_signature_coordinates(self) -> None:
        req = SignatureRequest.model_validate(
            {
                "path": "/tmp/example.pdf",
                "page": 0,
                "x": 72,
                "y": 520,
                "text": "Lei Li",
                "signer": "Lei Li",
            }
        )

        self.assertEqual(req.page, 0)
        self.assertEqual(req.text, "Lei Li")
        self.assertEqual(req.signer, "Lei Li")


class ImageSignatureRequestTests(unittest.TestCase):
    def test_accepts_image_signature_coordinates_and_size(self) -> None:
        req = ImageSignatureRequest.model_validate(
            {
                "path": "/tmp/example.pdf",
                "page": 0,
                "x": 72,
                "y": 520,
                "image_path": "/tmp/signature.png",
                "width": 180,
                "height": 60,
                "signer": "Lei Li",
            }
        )

        self.assertEqual(req.image_path, "/tmp/signature.png")
        self.assertEqual(req.signer, "Lei Li")


class FreeTextRequestTests(unittest.TestCase):
    def test_accepts_visible_free_text_coordinates(self) -> None:
        req = FreeTextRequest.model_validate(
            {
                "path": "/tmp/example.pdf",
                "page": 0,
                "x": 72,
                "y": 180,
                "text": "Visible reviewer note",
                "author": "Sparrow",
            }
        )

        self.assertEqual(req.page, 0)
        self.assertEqual(req.x, 72)
        self.assertEqual(req.y, 180)
        self.assertEqual(req.text, "Visible reviewer note")
        self.assertEqual(req.author, "Sparrow")


class StampRequestTests(unittest.TestCase):
    def test_accepts_standard_stamp_coordinates(self) -> None:
        req = StampRequest.model_validate(
            {
                "path": "/tmp/example.pdf",
                "page": 0,
                "x": 72,
                "y": 180,
                "stamp": "Approved",
                "author": "Sparrow",
            }
        )

        self.assertEqual(req.page, 0)
        self.assertEqual(req.x, 72)
        self.assertEqual(req.y, 180)
        self.assertEqual(req.stamp, "Approved")
        self.assertEqual(req.author, "Sparrow")


class ShapeRequestTests(unittest.TestCase):
    def test_accepts_shape_annotation_coordinates(self) -> None:
        req = ShapeRequest.model_validate(
            {
                "path": "/tmp/example.pdf",
                "page": 0,
                "x": 72,
                "y": 180,
                "kind": "ellipse",
                "width": 120,
                "height": 60,
                "author": "Sparrow",
            }
        )

        self.assertEqual(req.page, 0)
        self.assertEqual(req.kind, "ellipse")
        self.assertEqual(req.width, 120)
        self.assertEqual(req.height, 60)
        self.assertEqual(req.author, "Sparrow")


class InsertImageRequestTests(unittest.TestCase):
    def test_accepts_image_insert_coordinates_and_size(self) -> None:
        req = InsertImageRequest.model_validate(
            {
                "path": "/tmp/example.pdf",
                "page": 0,
                "x": 72,
                "y": 180,
                "image_path": "/tmp/photo.png",
                "width": 180,
                "height": 120,
            }
        )

        self.assertEqual(req.image_path, "/tmp/photo.png")
        self.assertEqual(req.width, 180)
        self.assertEqual(req.height, 120)


class TextMarkupRequestTests(unittest.TestCase):
    def test_accepts_text_markup_query_and_kind(self) -> None:
        req = TextMarkupRequest.model_validate(
            {
                "path": "/tmp/example.pdf",
                "query": "review this clause",
                "kind": "underline",
                "color": [0.1, 0.45, 0.95],
                "author": "Sparrow",
            }
        )

        self.assertEqual(req.query, "review this clause")
        self.assertEqual(req.kind, "underline")
        self.assertEqual(req.color, (0.1, 0.45, 0.95))
        self.assertEqual(req.author, "Sparrow")


class RedactRequestTests(unittest.TestCase):
    def test_accepts_redaction_query_and_page_indices(self) -> None:
        req = RedactRequest.model_validate(
            {
                "path": "/tmp/example.pdf",
                "query": "SSN 123-45-6789",
                "page_indices": [0, 2],
            }
        )

        self.assertEqual(req.query, "SSN 123-45-6789")
        self.assertEqual(req.page_indices, [0, 2])


class CropRequestTests(unittest.TestCase):
    def test_accepts_crop_margins_and_page_indices(self) -> None:
        req = CropRequest.model_validate(
            {
                "path": "/tmp/example.pdf",
                "margins": {"left": 10, "top": 20, "right": 30, "bottom": 40},
                "page_indices": [0, 2],
            }
        )

        self.assertEqual(req.margins.left, 10)
        self.assertEqual(req.margins.top, 20)
        self.assertEqual(req.page_indices, [0, 2])


class ExtractPagesRequestTests(unittest.TestCase):
    def test_accepts_extract_page_indices(self) -> None:
        req = ExtractPagesRequest.model_validate(
            {
                "path": "/tmp/example.pdf",
                "page_indices": [1, 2, 4],
            }
        )

        self.assertEqual(req.page_indices, [1, 2, 4])


class InsertBlankPagesRequestTests(unittest.TestCase):
    def test_accepts_insert_blank_page_options(self) -> None:
        req = InsertBlankPagesRequest.model_validate(
            {
                "path": "/tmp/example.pdf",
                "insert_index": 2,
                "count": 3,
                "width": 595,
                "height": 842,
            }
        )

        self.assertEqual(req.insert_index, 2)
        self.assertEqual(req.count, 3)
        self.assertEqual(req.width, 595)
        self.assertEqual(req.height, 842)


class OutlineRequestTests(unittest.TestCase):
    def test_accepts_outline_read_request(self) -> None:
        req = OutlineRequest.model_validate({"path": "/tmp/example.pdf"})

        self.assertEqual(req.path, "/tmp/example.pdf")

    def test_accepts_set_outline_items(self) -> None:
        req = SetOutlineRequest.model_validate(
            {
                "path": "/tmp/example.pdf",
                "outline": [
                    {"level": 1, "title": "Intro", "page": 1},
                    {"level": 2, "title": "Details", "page": 2, "x": 72, "y": 36},
                ],
            }
        )

        self.assertEqual(req.outline[0].title, "Intro")
        self.assertEqual(req.outline[1].page, 2)
        self.assertEqual(req.outline[1].x, 72)


class AttachmentsRequestTests(unittest.TestCase):
    def test_accepts_attachment_requests(self) -> None:
        list_req = AttachmentsRequest.model_validate({"path": "/tmp/example.pdf"})
        add_req = AddAttachmentRequest.model_validate(
            {
                "path": "/tmp/example.pdf",
                "file_path": "/tmp/note.txt",
                "name": "note.txt",
                "description": "Review note",
            }
        )
        extract_req = ExtractAttachmentsRequest.model_validate(
            {"path": "/tmp/example.pdf", "output_dir": "/tmp/out", "names": ["note.txt"]}
        )
        remove_req = RemoveAttachmentsRequest.model_validate(
            {"path": "/tmp/example.pdf", "names": ["note.txt"]}
        )

        self.assertEqual(list_req.path, "/tmp/example.pdf")
        self.assertEqual(add_req.file_path, "/tmp/note.txt")
        self.assertEqual(add_req.description, "Review note")
        self.assertEqual(extract_req.names, ["note.txt"])
        self.assertEqual(remove_req.names, ["note.txt"])


class ExportImagesRequestTests(unittest.TestCase):
    def test_accepts_image_export_options(self) -> None:
        req = ExportImagesRequest.model_validate(
            {
                "path": "/tmp/example.pdf",
                "page_indices": [0, 2],
                "dpi": 200,
            }
        )

        self.assertEqual(req.page_indices, [0, 2])
        self.assertEqual(req.dpi, 200)


class ExtractImagesRequestTests(unittest.TestCase):
    def test_accepts_embedded_image_extraction_options(self) -> None:
        req = ExtractImagesRequest.model_validate(
            {
                "path": "/tmp/example.pdf",
                "output_dir": "/tmp/images",
                "page_indices": [0, 2],
            }
        )

        self.assertEqual(req.output_dir, "/tmp/images")
        self.assertEqual(req.page_indices, [0, 2])


class ConversionRequestTests(unittest.TestCase):
    def test_accepts_images_to_pdf_options(self) -> None:
        req = ImagesToPdfRequest.model_validate(
            {
                "image_paths": ["/tmp/a.png", "/tmp/b.jpg"],
                "width": 612,
                "height": 792,
                "margin": 24,
            }
        )

        self.assertEqual(req.image_paths, ["/tmp/a.png", "/tmp/b.jpg"])
        self.assertEqual(req.width, 612)
        self.assertEqual(req.margin, 24)

    def test_accepts_html_and_markdown_to_pdf_options(self) -> None:
        html_req = HtmlToPdfRequest.model_validate(
            {"html": "<h1>Hello</h1>", "title": "HTML Doc", "width": 612, "height": 792}
        )
        markdown_req = MarkdownToPdfRequest.model_validate(
            {"markdown": "# Hello", "title": "Markdown Doc", "margin": 18}
        )

        self.assertEqual(html_req.html, "<h1>Hello</h1>")
        self.assertEqual(html_req.title, "HTML Doc")
        self.assertEqual(markdown_req.markdown, "# Hello")
        self.assertEqual(markdown_req.margin, 18)


class ExportTextRequestTests(unittest.TestCase):
    def test_accepts_text_export_options(self) -> None:
        req = ExportTextRequest.model_validate(
            {
                "path": "/tmp/example.pdf",
                "format": "markdown",
                "page_indices": [0, 2],
            }
        )

        self.assertEqual(req.format, "markdown")
        self.assertEqual(req.page_indices, [0, 2])


class CompressRequestTests(unittest.TestCase):
    def test_accepts_compress_source_path(self) -> None:
        req = CompressRequest.model_validate({"path": "/tmp/example.pdf"})

        self.assertEqual(req.path, "/tmp/example.pdf")


class OutputPathTests(unittest.TestCase):
    def test_builds_sibling_pdf_paths_without_pathlib_with_stem(self) -> None:
        self.assertEqual(
            sibling_pdf_path(Path("/tmp/example.pdf"), "filled"),
            Path("/tmp/example_filled.pdf"),
        )


class ResizePagesRequestTests(unittest.TestCase):
    def test_accepts_resize_page_options(self) -> None:
        req = ResizePagesRequest.model_validate(
            {
                "path": "/tmp/example.pdf",
                "width": 612,
                "height": 792,
                "page_indices": [0, 2],
            }
        )

        self.assertEqual(req.width, 612)
        self.assertEqual(req.height, 792)
        self.assertEqual(req.page_indices, [0, 2])


if __name__ == "__main__":
    unittest.main()
