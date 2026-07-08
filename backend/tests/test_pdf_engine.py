from __future__ import annotations

import base64
import tempfile
import unittest
from pathlib import Path
import sys

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

import fitz

from inkwell import pdf_engine


EMBEDDED_PNG = base64.b64decode(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/p9sAAAAASUVORK5CYII="
)


def make_heading_sample(path: Path) -> None:
    doc = fitz.open()
    page = doc.new_page(width=595, height=842)
    page.insert_text((72, 90), "Introduction", fontsize=24, fontname="helv")
    page.insert_text((72, 135), "This paragraph should stay unmarked.", fontsize=12, fontname="helv")
    page.insert_text((72, 190), "Method", fontsize=22, fontname="helv")
    page.insert_text((72, 230), "The agent should highlight headings immediately.", fontsize=12, fontname="helv")
    page.insert_text((72, 290), "Results", fontsize=22, fontname="helv")
    page.insert_text((72, 330), "Undo should remove the visible operation.", fontsize=12, fontname="helv")
    doc.save(path)
    doc.close()


def make_multi_page_sample(path: Path, page_count: int = 3) -> None:
    doc = fitz.open()
    for index in range(page_count):
        page = doc.new_page(width=595, height=842)
        page.insert_text((72, 90), f"Page {index + 1}", fontsize=24, fontname="helv")
        page.insert_text((72, 135), f"Body text for page {index + 1}.", fontsize=12, fontname="helv")
    doc.save(path)
    doc.close()


def make_image_sample(path: Path) -> None:
    doc = fitz.open()
    page = doc.new_page(width=100, height=100)
    page.insert_text((10, 80), "Image sample", fontsize=12, fontname="helv")
    page.insert_image(fitz.Rect(10, 10, 30, 30), stream=EMBEDDED_PNG)
    doc.save(path)
    doc.close()


def make_form_sample(path: Path) -> None:
    doc = fitz.open()
    page = doc.new_page(width=595, height=842)
    page.insert_text((72, 72), "Name", fontsize=12, fontname="helv")
    widget = fitz.Widget()
    widget.field_name = "applicant_name"
    widget.field_label = "Applicant name"
    widget.field_type = fitz.PDF_WIDGET_TYPE_TEXT
    widget.field_value = ""
    widget.rect = fitz.Rect(140, 55, 330, 82)
    page.add_widget(widget)
    doc.save(path)
    doc.close()


class PdfEngineHeadingTests(unittest.TestCase):
    def test_detect_heading_highlights_returns_only_large_text_blocks(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            pdf_path = Path(tmp) / "sample.pdf"
            make_heading_sample(pdf_path)

            ops = pdf_engine.detect_heading_highlights(pdf_path)

            self.assertEqual(["Introduction", "Method", "Results"], [op.text for op in ops])
            self.assertTrue(all(op.page == 0 for op in ops))
            self.assertTrue(all(op.rects for op in ops))
            self.assertTrue(all(op.opacity == 0.25 for op in ops))

    def test_apply_operations_writes_standard_highlight_annotations(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            pdf_path = Path(tmp) / "sample.pdf"
            out_path = Path(tmp) / "sample_applied.pdf"
            make_heading_sample(pdf_path)

            ops = pdf_engine.detect_heading_highlights(pdf_path)
            pdf_engine.apply_operations(pdf_path, out_path, ops)

            doc = fitz.open(out_path)
            try:
                annotation_types = [annot.type[1] for annot in (doc[0].annots() or [])]
            finally:
                doc.close()

            self.assertEqual(3, len(annotation_types))
            self.assertTrue(all(annotation_type == "Highlight" for annotation_type in annotation_types))

    def test_add_comment_writes_standard_text_annotation(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            pdf_path = Path(tmp) / "sample.pdf"
            out_path = Path(tmp) / "sample_commented.pdf"
            make_heading_sample(pdf_path)

            pdf_engine.add_comment(
                pdf_path,
                out_path,
                page=0,
                point=pdf_engine.Point(72, 120),
                text="Review this introduction.",
                author="Inkwell",
            )

            doc = fitz.open(out_path)
            try:
                annotations = [(annot.type[1], annot.info.get("content"), annot.info.get("title")) for annot in (doc[0].annots() or [])]
            finally:
                doc.close()

            self.assertEqual([("Text", "Review this introduction.", "Inkwell")], annotations)

    def test_add_free_text_writes_visible_free_text_annotation(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            pdf_path = Path(tmp) / "sample.pdf"
            out_path = Path(tmp) / "sample_free_text.pdf"
            make_heading_sample(pdf_path)

            pdf_engine.add_free_text(
                pdf_path,
                out_path,
                page=0,
                point=pdf_engine.Point(72, 420),
                text="Visible reviewer note",
                author="Sparrow",
            )

            doc = fitz.open(out_path)
            try:
                annotations = [
                    (annot.type[1], annot.info.get("content"), annot.info.get("title"))
                    for annot in (doc[0].annots() or [])
                ]
                self.assertEqual([("FreeText", "Visible reviewer note", "Sparrow")], annotations)
                self.assertIn("Visible reviewer note", doc[0].get_text())
            finally:
                doc.close()

    def test_add_stamp_annotation_writes_standard_stamp_annotation(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            pdf_path = Path(tmp) / "sample.pdf"
            out_path = Path(tmp) / "sample_stamped.pdf"
            make_heading_sample(pdf_path)

            normalized = pdf_engine.add_stamp_annotation(
                pdf_path,
                out_path,
                page=0,
                point=pdf_engine.Point(72, 420),
                stamp="Approved",
                author="Sparrow",
            )

            doc = fitz.open(out_path)
            try:
                annotations = [
                    (annot.type[1], annot.info.get("content"), annot.info.get("title"))
                    for annot in (doc[0].annots() or [])
                ]
                self.assertEqual("approved", normalized)
                self.assertEqual([("Stamp", "approved", "Sparrow")], annotations)
            finally:
                doc.close()

    def test_add_shape_annotation_writes_standard_shape_annotations(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            pdf_path = Path(tmp) / "sample.pdf"
            make_heading_sample(pdf_path)

            cases = [
                ("rectangle", "Square"),
                ("ellipse", "Circle"),
                ("line", "Line"),
            ]
            for kind, expected_type in cases:
                out_path = Path(tmp) / f"sample_{kind}.pdf"
                normalized = pdf_engine.add_shape_annotation(
                    pdf_path,
                    out_path,
                    page=0,
                    point=pdf_engine.Point(72, 420),
                    kind=kind,
                    width=120,
                    height=60,
                    author="Sparrow",
                )

                doc = fitz.open(out_path)
                try:
                    annotations = [
                        (annot.type[1], annot.info.get("content"), annot.info.get("title"))
                        for annot in (doc[0].annots() or [])
                    ]
                    self.assertEqual(kind, normalized)
                    self.assertEqual([(expected_type, kind, "Sparrow")], annotations)
                finally:
                    doc.close()

    def test_add_text_markup_writes_standard_underline_and_strikeout_annotations(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            pdf_path = Path(tmp) / "sample.pdf"
            underlined_path = Path(tmp) / "sample_underlined.pdf"
            strikeout_path = Path(tmp) / "sample_strikeout.pdf"
            make_heading_sample(pdf_path)

            underline_count = pdf_engine.add_text_markup(
                pdf_path,
                underlined_path,
                query="Introduction",
                kind="underline",
                color=(0.1, 0.45, 0.95),
                author="Sparrow",
            )
            strikeout_count = pdf_engine.add_text_markup(
                pdf_path,
                strikeout_path,
                query="Method",
                kind="strikeout",
                color=(0.85, 0.12, 0.12),
                author="Sparrow",
            )

            self.assertEqual(1, underline_count)
            self.assertEqual(1, strikeout_count)

            underlined = fitz.open(underlined_path)
            strikeout = fitz.open(strikeout_path)
            try:
                underlined_annotations = [
                    (annot.type[1], annot.info.get("content"), annot.info.get("title"))
                    for annot in (underlined[0].annots() or [])
                ]
                strikeout_annotations = [
                    (annot.type[1], annot.info.get("content"), annot.info.get("title"))
                    for annot in (strikeout[0].annots() or [])
                ]
                self.assertEqual([("Underline", "Introduction", "Sparrow")], underlined_annotations)
                self.assertEqual([("StrikeOut", "Method", "Sparrow")], strikeout_annotations)
            finally:
                underlined.close()
                strikeout.close()

    def test_redact_text_removes_matching_text_from_output_copy(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            pdf_path = Path(tmp) / "sample.pdf"
            out_path = Path(tmp) / "sample_redacted.pdf"
            make_heading_sample(pdf_path)

            result = pdf_engine.redact_text(pdf_path, out_path, "Method")

            self.assertEqual(1, result.match_count)
            self.assertEqual([0], result.pages)
            original = fitz.open(pdf_path)
            redacted = fitz.open(out_path)
            try:
                self.assertIn("Method", original[0].get_text())
                self.assertNotIn("Method", redacted[0].get_text())
                self.assertIn("Introduction", redacted[0].get_text())
            finally:
                original.close()
                redacted.close()

    def test_redact_text_rejects_missing_matches(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            pdf_path = Path(tmp) / "sample.pdf"
            out_path = Path(tmp) / "sample_redacted.pdf"
            make_heading_sample(pdf_path)

            with self.assertRaisesRegex(ValueError, "Text not found"):
                pdf_engine.redact_text(pdf_path, out_path, "not present")

    def test_split_pdf_writes_one_valid_pdf_per_page(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            pdf_path = Path(tmp) / "multi.pdf"
            output_dir = Path(tmp) / "split"
            make_multi_page_sample(pdf_path, page_count=3)

            files = pdf_engine.split_pdf(pdf_path, output_dir)

            self.assertEqual([str(output_dir / "page_0001.pdf"), str(output_dir / "page_0002.pdf"), str(output_dir / "page_0003.pdf")], files)
            for index, file_path in enumerate(files, start=1):
                doc = fitz.open(file_path)
                try:
                    self.assertEqual(1, len(doc))
                    self.assertIn(f"Page {index}", doc[0].get_text())
                finally:
                    doc.close()

    def test_split_pdf_writes_one_valid_pdf_per_requested_range(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            pdf_path = Path(tmp) / "multi.pdf"
            output_dir = Path(tmp) / "split"
            make_multi_page_sample(pdf_path, page_count=5)

            files = pdf_engine.split_pdf(pdf_path, output_dir, ranges=[(1, 3), (4, 4)])

            self.assertEqual([str(output_dir / "pages_0002-0004.pdf"), str(output_dir / "page_0005.pdf")], files)
            first = fitz.open(files[0])
            second = fitz.open(files[1])
            try:
                self.assertEqual(3, len(first))
                self.assertIn("Page 2", first[0].get_text())
                self.assertIn("Page 4", first[2].get_text())
                self.assertEqual(1, len(second))
                self.assertIn("Page 5", second[0].get_text())
            finally:
                first.close()
                second.close()

    def test_split_pdf_rejects_ranges_outside_document(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            pdf_path = Path(tmp) / "multi.pdf"
            output_dir = Path(tmp) / "split"
            make_multi_page_sample(pdf_path, page_count=2)

            with self.assertRaisesRegex(ValueError, "Invalid page range"):
                pdf_engine.split_pdf(pdf_path, output_dir, ranges=[(1, 2)])

    def test_extract_pages_writes_selected_pages_in_requested_order(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            pdf_path = Path(tmp) / "multi.pdf"
            out_path = Path(tmp) / "multi_extracted.pdf"
            make_multi_page_sample(pdf_path, page_count=4)

            pdf_engine.extract_pages(pdf_path, out_path, [2, 0])

            doc = fitz.open(out_path)
            try:
                self.assertEqual(2, len(doc))
                self.assertIn("Page 3", doc[0].get_text())
                self.assertIn("Page 1", doc[1].get_text())
            finally:
                doc.close()

    def test_extract_pages_rejects_empty_selection(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            pdf_path = Path(tmp) / "multi.pdf"
            out_path = Path(tmp) / "multi_extracted.pdf"
            make_multi_page_sample(pdf_path, page_count=2)

            with self.assertRaisesRegex(ValueError, "At least one page"):
                pdf_engine.extract_pages(pdf_path, out_path, [])

    def test_insert_blank_pages_writes_blank_pages_at_position(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            pdf_path = Path(tmp) / "multi.pdf"
            out_path = Path(tmp) / "multi_blank_pages.pdf"
            make_multi_page_sample(pdf_path, page_count=2)

            pdf_engine.insert_blank_pages(pdf_path, out_path, insert_index=1, count=2, width=300, height=400)

            doc = fitz.open(out_path)
            try:
                self.assertEqual(4, len(doc))
                self.assertIn("Page 1", doc[0].get_text())
                self.assertEqual("", doc[1].get_text().strip())
                self.assertEqual("", doc[2].get_text().strip())
                self.assertIn("Page 2", doc[3].get_text())
                self.assertEqual((300.0, 400.0), (doc[1].rect.width, doc[1].rect.height))
            finally:
                doc.close()

    def test_insert_blank_pages_rejects_invalid_insert_index(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            pdf_path = Path(tmp) / "multi.pdf"
            out_path = Path(tmp) / "multi_blank_pages.pdf"
            make_multi_page_sample(pdf_path, page_count=2)

            with self.assertRaisesRegex(ValueError, "Invalid insert index"):
                pdf_engine.insert_blank_pages(pdf_path, out_path, insert_index=3)

    def test_resize_pages_resizes_selected_pages_only(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            pdf_path = Path(tmp) / "multi.pdf"
            out_path = Path(tmp) / "multi_resized.pdf"
            make_multi_page_sample(pdf_path, page_count=2)

            pdf_engine.resize_pages(pdf_path, out_path, width=300, height=400, page_indices=[1])

            doc = fitz.open(out_path)
            try:
                self.assertEqual(2, len(doc))
                self.assertEqual((595.0, 842.0), (doc[0].rect.width, doc[0].rect.height))
                self.assertEqual((300.0, 400.0), (doc[1].rect.width, doc[1].rect.height))
                self.assertIn("Page 2", doc[1].get_text())
            finally:
                doc.close()

    def test_resize_pages_rejects_empty_selection(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            pdf_path = Path(tmp) / "multi.pdf"
            out_path = Path(tmp) / "multi_resized.pdf"
            make_multi_page_sample(pdf_path, page_count=2)

            with self.assertRaisesRegex(ValueError, "At least one page"):
                pdf_engine.resize_pages(pdf_path, out_path, width=300, height=400, page_indices=[])

    def test_set_and_read_outline_writes_bookmarks(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            pdf_path = Path(tmp) / "multi.pdf"
            out_path = Path(tmp) / "multi_outlined.pdf"
            make_multi_page_sample(pdf_path, page_count=3)

            pdf_engine.set_outline(
                pdf_path,
                out_path,
                [
                    pdf_engine.OutlineItem(level=1, title="Intro", page=1),
                    pdf_engine.OutlineItem(level=2, title="Details", page=2),
                    pdf_engine.OutlineItem(level=1, title="Appendix", page=3),
                ],
            )

            items = pdf_engine.read_outline(out_path)

            self.assertEqual(
                [(item.level, item.title, item.page) for item in items],
                [(1, "Intro", 1), (2, "Details", 2), (1, "Appendix", 3)],
            )

    def test_set_outline_rejects_skipped_hierarchy_levels(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            pdf_path = Path(tmp) / "multi.pdf"
            out_path = Path(tmp) / "multi_outlined.pdf"
            make_multi_page_sample(pdf_path, page_count=2)

            with self.assertRaisesRegex(ValueError, "cannot skip"):
                pdf_engine.set_outline(
                    pdf_path,
                    out_path,
                    [pdf_engine.OutlineItem(level=2, title="Too deep", page=1)],
                )

    def test_attachment_flow_adds_lists_extracts_and_removes_files(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            pdf_path = Path(tmp) / "multi.pdf"
            attached_path = Path(tmp) / "multi_attached.pdf"
            removed_path = Path(tmp) / "multi_attachments_removed.pdf"
            source_attachment = Path(tmp) / "note.txt"
            extract_dir = Path(tmp) / "attachments"
            make_multi_page_sample(pdf_path, page_count=1)
            source_attachment.write_text("attached note", encoding="utf-8")

            info = pdf_engine.add_attachment(
                pdf_path,
                attached_path,
                source_attachment,
                name="review-note.txt",
                description="Review note",
            )
            listed = pdf_engine.list_attachments(attached_path)
            extracted = pdf_engine.extract_attachments(attached_path, extract_dir, ["review-note.txt"])
            removed_count = pdf_engine.remove_attachments(attached_path, removed_path, ["review-note.txt"])
            remaining = pdf_engine.list_attachments(removed_path)

            self.assertEqual("review-note.txt", info.name)
            self.assertEqual([("review-note.txt", "note.txt", "Review note", len("attached note"))], [
                (item.name, item.filename, item.description, item.size) for item in listed
            ])
            self.assertEqual(1, len(extracted))
            self.assertEqual("attached note", Path(extracted[0].path).read_text(encoding="utf-8"))
            self.assertEqual(1, removed_count)
            self.assertEqual([], remaining)

    def test_extract_attachments_rejects_missing_attachment(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            pdf_path = Path(tmp) / "multi.pdf"
            output_dir = Path(tmp) / "attachments"
            make_multi_page_sample(pdf_path, page_count=1)

            with self.assertRaisesRegex(ValueError, "Attachment not found"):
                pdf_engine.extract_attachments(pdf_path, output_dir, ["missing.txt"])

    def test_export_pages_as_images_writes_selected_png_files(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            pdf_path = Path(tmp) / "multi.pdf"
            output_dir = Path(tmp) / "images"
            make_multi_page_sample(pdf_path, page_count=3)

            files = pdf_engine.export_pages_as_images(pdf_path, output_dir, page_indices=[1], dpi=72)

            self.assertEqual([str(output_dir / "page_0002.png")], files)
            pixmap = fitz.Pixmap(files[0])
            try:
                self.assertEqual(595, pixmap.width)
                self.assertEqual(842, pixmap.height)
            finally:
                pixmap = None

    def test_export_pages_as_images_rejects_invalid_dpi(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            pdf_path = Path(tmp) / "multi.pdf"
            output_dir = Path(tmp) / "images"
            make_multi_page_sample(pdf_path, page_count=1)

            with self.assertRaisesRegex(ValueError, "DPI"):
                pdf_engine.export_pages_as_images(pdf_path, output_dir, dpi=12)

    def test_extract_embedded_images_writes_original_image_streams(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            pdf_path = Path(tmp) / "images.pdf"
            output_dir = Path(tmp) / "extracted"
            make_image_sample(pdf_path)

            images = pdf_engine.extract_embedded_images(pdf_path, output_dir)

            self.assertEqual(1, len(images))
            self.assertEqual(str(output_dir / "page_0001_image_001.png"), images[0].path)
            self.assertEqual(0, images[0].page)
            self.assertGreater(images[0].xref, 0)
            self.assertEqual(1, images[0].width)
            self.assertEqual(1, images[0].height)
            self.assertEqual("png", images[0].ext)
            pixmap = fitz.Pixmap(images[0].path)
            try:
                self.assertEqual(1, pixmap.width)
                self.assertEqual(1, pixmap.height)
            finally:
                pixmap = None

    def test_extract_embedded_images_returns_empty_list_when_none_found(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            pdf_path = Path(tmp) / "multi.pdf"
            output_dir = Path(tmp) / "extracted"
            make_multi_page_sample(pdf_path, page_count=1)

            self.assertEqual([], pdf_engine.extract_embedded_images(pdf_path, output_dir))

    def test_export_text_document_writes_markdown_for_selected_pages(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            pdf_path = Path(tmp) / "multi.pdf"
            out_path = Path(tmp) / "multi_markdown.md"
            make_multi_page_sample(pdf_path, page_count=3)

            page_count = pdf_engine.export_text_document(pdf_path, out_path, "markdown", page_indices=[1])

            self.assertEqual(1, page_count)
            markdown = out_path.read_text(encoding="utf-8")
            self.assertIn("# multi.pdf", markdown)
            self.assertIn("## Page 2", markdown)
            self.assertIn("Body text for page 2.", markdown)
            self.assertNotIn("Body text for page 1.", markdown)

    def test_export_text_document_writes_plain_text(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            pdf_path = Path(tmp) / "multi.pdf"
            out_path = Path(tmp) / "multi_text.txt"
            make_multi_page_sample(pdf_path, page_count=1)

            page_count = pdf_engine.export_text_document(pdf_path, out_path, "text")

            self.assertEqual(1, page_count)
            text = out_path.read_text(encoding="utf-8")
            self.assertIn("===== Page 1 =====", text)
            self.assertIn("Body text for page 1.", text)

    def test_create_pdf_from_images_writes_one_page_per_image(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            image_path = Path(tmp) / "pixel.png"
            out_path = Path(tmp) / "images.pdf"
            image_path.write_bytes(EMBEDDED_PNG)

            page_count = pdf_engine.create_pdf_from_images([image_path], out_path, width=300, height=400, margin=20)

            self.assertEqual(1, page_count)
            doc = fitz.open(out_path)
            try:
                self.assertEqual(1, len(doc))
                self.assertEqual((300.0, 400.0), (doc[0].rect.width, doc[0].rect.height))
                self.assertEqual(1, len(doc[0].get_images(full=True)))
            finally:
                doc.close()

    def test_create_pdf_from_images_rejects_missing_image(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            out_path = Path(tmp) / "images.pdf"

            with self.assertRaisesRegex(ValueError, "Image file not found"):
                pdf_engine.create_pdf_from_images([Path(tmp) / "missing.png"], out_path)

    def test_insert_pdf_image_writes_visible_image_content(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            pdf_path = Path(tmp) / "sample.pdf"
            image_path = Path(tmp) / "pixel.png"
            out_path = Path(tmp) / "sample_image.pdf"
            make_heading_sample(pdf_path)
            image_path.write_bytes(EMBEDDED_PNG)

            pdf_engine.insert_pdf_image(
                pdf_path,
                out_path,
                page=0,
                point=pdf_engine.Point(96, 420),
                image_path=image_path,
                width=80,
                height=40,
            )

            doc = fitz.open(out_path)
            try:
                self.assertEqual(1, len(doc[0].get_images(full=True)))
                self.assertIn("Introduction", doc[0].get_text())
            finally:
                doc.close()

    def test_insert_pdf_image_rejects_missing_image(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            pdf_path = Path(tmp) / "sample.pdf"
            out_path = Path(tmp) / "sample_image.pdf"
            make_heading_sample(pdf_path)

            with self.assertRaisesRegex(ValueError, "Image file not found"):
                pdf_engine.insert_pdf_image(
                    pdf_path,
                    out_path,
                    page=0,
                    point=pdf_engine.Point(96, 420),
                    image_path=Path(tmp) / "missing.png",
                )

    def test_write_html_pdf_writes_readable_pdf_text(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            out_path = Path(tmp) / "html.pdf"

            page_count = pdf_engine.write_html_pdf("<h1>Hello</h1><p>HTML export</p>", out_path, title="HTML Sample")

            self.assertEqual(1, page_count)
            doc = fitz.open(out_path)
            try:
                self.assertIn("Hello", doc[0].get_text())
                self.assertIn("HTML export", doc[0].get_text())
                self.assertEqual("HTML Sample", doc.metadata.get("title"))
            finally:
                doc.close()

    def test_write_markdown_pdf_converts_common_markdown(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            out_path = Path(tmp) / "markdown.pdf"

            page_count = pdf_engine.write_markdown_pdf("# Title\n\n- **Item**\n\n`code` text", out_path)

            self.assertEqual(1, page_count)
            doc = fitz.open(out_path)
            try:
                text = doc[0].get_text()
                self.assertIn("Title", text)
                self.assertIn("Item", text)
                self.assertIn("code", text)
            finally:
                doc.close()

    def test_document_info_returns_page_count_and_page_sizes(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            pdf_path = Path(tmp) / "multi.pdf"
            make_multi_page_sample(pdf_path, page_count=2)

            info = pdf_engine.document_info(pdf_path)

            self.assertEqual(2, info["page_count"])
            self.assertEqual([{"width": 595.0, "height": 842.0}, {"width": 595.0, "height": 842.0}], info["pages"])

    def test_add_watermark_writes_text_to_each_page(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            pdf_path = Path(tmp) / "multi.pdf"
            out_path = Path(tmp) / "watermarked.pdf"
            make_multi_page_sample(pdf_path, page_count=2)

            pdf_engine.add_watermark(pdf_path, out_path, "SPARROW")

            doc = fitz.open(out_path)
            try:
                self.assertIn("SPARROW", doc[0].get_text())
                self.assertIn("SPARROW", doc[1].get_text())
            finally:
                doc.close()

    def test_compress_pdf_writes_readable_optimized_copy_and_reports_sizes(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            pdf_path = Path(tmp) / "multi.pdf"
            out_path = Path(tmp) / "multi_compressed.pdf"
            make_multi_page_sample(pdf_path, page_count=2)

            result = pdf_engine.compress_pdf(pdf_path, out_path)

            self.assertGreater(result.input_bytes, 0)
            self.assertGreater(result.output_bytes, 0)
            self.assertEqual(result.input_bytes - result.output_bytes, result.saved_bytes)
            doc = fitz.open(out_path)
            try:
                self.assertEqual(2, len(doc))
                self.assertIn("Page 1", doc[0].get_text())
            finally:
                doc.close()

    def test_encrypt_pdf_requires_password_and_authenticates(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            pdf_path = Path(tmp) / "sample.pdf"
            out_path = Path(tmp) / "encrypted.pdf"
            make_multi_page_sample(pdf_path, page_count=1)

            pdf_engine.encrypt_pdf(pdf_path, out_path, user_pw="secret")

            doc = fitz.open(out_path)
            try:
                self.assertTrue(doc.needs_pass)
                self.assertEqual(0, doc.authenticate("wrong"))
                self.assertGreater(doc.authenticate("secret"), 0)
                self.assertIn("Page 1", doc[0].get_text())
            finally:
                doc.close()


    def test_read_form_fields_returns_widget_metadata(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            pdf_path = Path(tmp) / "form.pdf"
            make_form_sample(pdf_path)

            fields = pdf_engine.read_form_fields(pdf_path)

            self.assertEqual(1, len(fields))
            self.assertEqual("applicant_name", fields[0].name)
            self.assertEqual("Text", fields[0].type)
            self.assertEqual(0, fields[0].page)
            self.assertEqual(pdf_engine.Rect(140.0, 55.0, 330.0, 82.0), fields[0].rect)

    def test_fill_form_fields_writes_sibling_pdf_and_reports_missing_names(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            pdf_path = Path(tmp) / "form.pdf"
            out_path = Path(tmp) / "form_filled.pdf"
            make_form_sample(pdf_path)

            missing = pdf_engine.fill_form_fields(
                pdf_path,
                out_path,
                {"applicant_name": "Lei Li", "unknown_field": "ignored"},
            )

            self.assertEqual(["unknown_field"], missing)
            fields = pdf_engine.read_form_fields(out_path)
            self.assertEqual("Lei Li", fields[0].value)

    def test_add_typed_signature_writes_standard_free_text_annotation(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            pdf_path = Path(tmp) / "sample.pdf"
            out_path = Path(tmp) / "sample_signed.pdf"
            make_heading_sample(pdf_path)

            pdf_engine.add_typed_signature(
                pdf_path,
                out_path,
                page=0,
                point=pdf_engine.Point(96, 520),
                text="Lei Li",
                signer="Lei Li",
            )

            doc = fitz.open(out_path)
            try:
                annotations = [
                    (annot.type[1], annot.info.get("content"), annot.info.get("title"))
                    for annot in (doc[0].annots() or [])
                ]
                self.assertEqual([("FreeText", "Lei Li", "Lei Li")], annotations)
                self.assertIn("Lei Li", doc[0].get_text())
            finally:
                doc.close()

    def test_add_image_signature_writes_visible_image_content(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            pdf_path = Path(tmp) / "sample.pdf"
            image_path = Path(tmp) / "signature.png"
            out_path = Path(tmp) / "sample_image_signed.pdf"
            make_heading_sample(pdf_path)
            image_path.write_bytes(EMBEDDED_PNG)

            pdf_engine.add_image_signature(
                pdf_path,
                out_path,
                page=0,
                point=pdf_engine.Point(96, 520),
                image_path=image_path,
                width=120,
                height=45,
            )

            doc = fitz.open(out_path)
            try:
                self.assertEqual(1, len(doc[0].get_images(full=True)))
                self.assertIn("Introduction", doc[0].get_text())
            finally:
                doc.close()

    def test_crop_pages_sets_cropbox_on_selected_pages(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            pdf_path = Path(tmp) / "multi.pdf"
            out_path = Path(tmp) / "multi_cropped.pdf"
            make_multi_page_sample(pdf_path, page_count=2)

            pdf_engine.crop_pages(
                pdf_path,
                out_path,
                pdf_engine.CropMargins(left=10, top=20, right=30, bottom=40),
                page_indices=[0],
            )

            doc = fitz.open(out_path)
            try:
                self.assertEqual(fitz.Rect(10, 20, 565, 802), doc[0].cropbox)
                self.assertEqual(fitz.Rect(0, 0, 595, 842), doc[1].cropbox)
            finally:
                doc.close()

    def test_crop_pages_rejects_invalid_margins(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            pdf_path = Path(tmp) / "sample.pdf"
            out_path = Path(tmp) / "sample_cropped.pdf"
            make_multi_page_sample(pdf_path, page_count=1)

            with self.assertRaisesRegex(ValueError, "no visible page area"):
                pdf_engine.crop_pages(
                    pdf_path,
                    out_path,
                    pdf_engine.CropMargins(left=300, top=0, right=300, bottom=0),
                )


if __name__ == "__main__":
    unittest.main()
