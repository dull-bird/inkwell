#!/usr/bin/env python3
"""Generate the fillable PDF sample used for manual Sparrow form testing."""

from __future__ import annotations

from pathlib import Path

import fitz


ROOT = Path(__file__).resolve().parents[1]
OUTPUT = ROOT / "samples" / "forms" / "inkwell-sample-intake-form.pdf"


def add_label(page: fitz.Page, text: str, x: float, y: float) -> None:
    page.insert_text((x, y), text, fontsize=10.5, fontname="helv", color=(0.10, 0.13, 0.18))


def add_text_field(page: fitz.Page, name: str, label: str, rect: fitz.Rect, value: str = "") -> None:
    add_label(page, label, rect.x0, rect.y0 - 8)
    widget = fitz.Widget()
    widget.field_name = name
    widget.field_label = label
    widget.field_type = fitz.PDF_WIDGET_TYPE_TEXT
    widget.field_value = value
    widget.rect = rect
    widget.border_color = (0.30, 0.35, 0.42)
    widget.fill_color = (1, 1, 1)
    widget.text_fontsize = 10
    page.add_widget(widget)


def add_checkbox(page: fitz.Page, name: str, label: str, rect: fitz.Rect, checked: bool = False) -> None:
    widget = fitz.Widget()
    widget.field_name = name
    widget.field_label = label
    widget.field_type = fitz.PDF_WIDGET_TYPE_CHECKBOX
    widget.field_value = widget.on_state() if checked else "Off"
    widget.rect = rect
    widget.border_color = (0.30, 0.35, 0.42)
    widget.fill_color = (1, 1, 1)
    page.add_widget(widget)
    add_label(page, label, rect.x1 + 8, rect.y1 - 4)


def add_combo(page: fitz.Page, name: str, label: str, rect: fitz.Rect, values: list[str], selected: str) -> None:
    add_label(page, label, rect.x0, rect.y0 - 8)
    widget = fitz.Widget()
    widget.field_name = name
    widget.field_label = label
    widget.field_type = fitz.PDF_WIDGET_TYPE_COMBOBOX
    widget.choice_values = values
    widget.field_value = selected
    widget.rect = rect
    widget.border_color = (0.30, 0.35, 0.42)
    widget.fill_color = (1, 1, 1)
    widget.text_fontsize = 10
    page.add_widget(widget)


def build_pdf(path: Path) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    if path.exists():
        path.unlink()

    doc = fitz.open()
    page = doc.new_page(width=612, height=792)

    page.draw_rect(fitz.Rect(0, 0, 612, 96), color=(0.09, 0.14, 0.20), fill=(0.09, 0.14, 0.20))
    page.insert_text((54, 48), "Inkwell Sample Intake Form", fontsize=22, fontname="helv", color=(1, 1, 1))
    page.insert_text(
        (54, 73),
        "A small AcroForm fixture for testing field detection and JSON-based filling.",
        fontsize=10.5,
        fontname="helv",
        color=(0.82, 0.88, 0.96),
    )

    page.insert_text((54, 130), "Applicant", fontsize=15, fontname="helv", color=(0.09, 0.14, 0.20))
    add_text_field(page, "applicant_name", "Applicant name", fitz.Rect(54, 160, 300, 188), "")
    add_text_field(page, "email", "Email", fitz.Rect(324, 160, 558, 188), "")
    add_text_field(page, "organization", "Organization", fitz.Rect(54, 220, 300, 248), "Inkwell Labs")
    add_combo(
        page,
        "document_type",
        "Document type",
        fitz.Rect(324, 220, 558, 248),
        ["Research paper", "Contract", "Financial report", "Other"],
        "Research paper",
    )

    page.insert_text((54, 305), "Request", fontsize=15, fontname="helv", color=(0.09, 0.14, 0.20))
    add_text_field(page, "review_goal", "Review goal", fitz.Rect(54, 338, 558, 374), "")
    add_checkbox(page, "needs_summary", "Generate executive summary", fitz.Rect(54, 410, 70, 426), True)
    add_checkbox(page, "needs_highlights", "Find and preview semantic highlights", fitz.Rect(54, 440, 70, 456), False)
    add_checkbox(page, "allow_ai_tools", "Allow AI tool calls for this document", fitz.Rect(54, 470, 70, 486), False)

    page.insert_text((54, 545), "Suggested fill JSON", fontsize=12, fontname="helv", color=(0.09, 0.14, 0.20))
    suggested = (
        '{\\n'
        '  "applicant_name": "Lei Li",\\n'
        '  "email": "lei@example.com",\\n'
        '  "organization": "Inkwell Labs",\\n'
        '  "document_type": "Research paper",\\n'
        '  "review_goal": "Check semantic headings and form handling",\\n'
        '  "needs_summary": true,\\n'
        '  "needs_highlights": true,\\n'
        '  "allow_ai_tools": false\\n'
        '}'
    )
    page.insert_textbox(
        fitz.Rect(54, 565, 558, 705),
        suggested,
        fontsize=9.5,
        fontname="cour",
        color=(0.11, 0.17, 0.24),
        fill=(0.96, 0.97, 0.98),
    )

    doc.save(path, garbage=4, deflate=True)
    doc.close()


if __name__ == "__main__":
    build_pdf(OUTPUT)
    print(OUTPUT)
