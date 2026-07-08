# Form Samples

`inkwell-sample-intake-form.pdf` is a small AcroForm PDF for manual testing of
Sparrow's form workflow.

Expected field names:

- `applicant_name`
- `email`
- `organization`
- `document_type`
- `review_goal`
- `needs_summary`
- `needs_highlights`
- `allow_ai_tools`

In Sparrow, open the PDF, use **Fill & Sign -> Detect fields**, edit the JSON,
then use **Fill form**. The current UI fills by field name and saves a sibling
`*_filled.pdf` copy; it does not yet provide direct in-page field editing.
