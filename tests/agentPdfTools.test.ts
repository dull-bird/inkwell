import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const agentSource = readFileSync(resolve('electron/agent.ts'), 'utf8');

test('provides one-step agent text highlighting that writes and opens a PDF', () => {
  assert.match(agentSource, /highlight_pdf_text: tool\(/);
  assert.match(agentSource, /await this\.backendCall\('\/highlight'/);
  assert.match(agentSource, /await this\.backendCall\('\/apply'/);
  assert.match(agentSource, /notifyOutput\(result\.output\)/);
});

test('agent heading highlighting writes an output PDF instead of only previewing operations', () => {
  assert.match(agentSource, /highlight_pdf_headings: tool\(/);
  assert.match(agentSource, /await this\.backendCall\('\/highlight-headings'/);
  assert.match(agentSource, /match_count/);
});

test('agent prompt steers visible highlight requests to output-producing tools', () => {
  assert.match(agentSource, /For user-visible highlighting, use highlight_pdf_text or highlight_pdf_headings/);
  assert.match(agentSource, /Use find_pdf_text only when the user explicitly asks to search or preview/);
});

test('provides agent page organization tools for blank insertion and resize', () => {
  assert.match(agentSource, /insert_blank_pdf_pages: tool\(/);
  assert.match(agentSource, /this\.backendCall\('\/insert-blank-pages'/);
  assert.match(agentSource, /resize_pdf_pages: tool\(/);
  assert.match(agentSource, /this\.backendCall\('\/resize-pages'/);
});

test('provides agent direct image editing and image signature tools', () => {
  assert.match(agentSource, /insert_pdf_image: tool\(/);
  assert.match(agentSource, /this\.backendCall\('\/insert-image'/);
  assert.match(agentSource, /add_image_signature: tool\(/);
  assert.match(agentSource, /this\.backendCall\('\/image-signature'/);
  assert.match(agentSource, /not certificate-based digital signatures/);
});

test('provides agent outline and attachment tools', () => {
  assert.match(agentSource, /read_pdf_outline: tool\(/);
  assert.match(agentSource, /this\.backendCall\('\/outline'/);
  assert.match(agentSource, /set_pdf_outline: tool\(/);
  assert.match(agentSource, /this\.backendCall\('\/set-outline'/);
  assert.match(agentSource, /list_pdf_attachments: tool\(/);
  assert.match(agentSource, /this\.backendCall\('\/attachments'/);
  assert.match(agentSource, /add_pdf_attachment: tool\(/);
  assert.match(agentSource, /this\.backendCall\('\/add-attachment'/);
  assert.match(agentSource, /extract_pdf_attachments: tool\(/);
  assert.match(agentSource, /this\.backendCall\('\/extract-attachments'/);
  assert.match(agentSource, /remove_pdf_attachments: tool\(/);
  assert.match(agentSource, /this\.backendCall\('\/remove-attachments'/);
});

test('provides agent format conversion tools', () => {
  assert.match(agentSource, /create_pdf_from_images: tool\(/);
  assert.match(agentSource, /this\.backendCall\('\/images-to-pdf'/);
  assert.match(agentSource, /convert_html_to_pdf: tool\(/);
  assert.match(agentSource, /this\.backendCall\('\/html-to-pdf'/);
  assert.match(agentSource, /convert_markdown_to_pdf: tool\(/);
  assert.match(agentSource, /this\.backendCall\('\/markdown-to-pdf'/);
});
