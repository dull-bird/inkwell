from __future__ import annotations

import tempfile
import unittest
from pathlib import Path

import fitz

from inkwell import pdf_engine


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


if __name__ == "__main__":
    unittest.main()
