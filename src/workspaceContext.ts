export interface WorkspaceDocumentContext {
  title: string;
  path: string;
  label: string;
  summary: string;
}

export function buildWorkspaceSummaryPrompt(documents: WorkspaceDocumentContext[]): string {
  if (documents.length < 2) throw new Error('Workspace summary needs at least two PDFs.');

  const documentList = documents
    .map((document, index) => {
      return [
        `${index + 1}. ${document.title}`,
        `   Path: ${document.path}`,
        `   Type: ${document.label}`,
        `   Local analysis: ${document.summary}`,
      ].join('\n');
    })
    .join('\n\n');

  return [
    '请作为小雀处理当前 Sparrow 工作集里的多个 PDF。',
    '先用 read_pdf_text 逐个读取下面每个 PDF 的关键页面或全文，再给出一个跨文档总结。',
    '输出要求：',
    '- 先列出每个 PDF 的一句话摘要',
    '- 再提取共同主题、差异和冲突点',
    '- 最后给出建议的下一步操作，如比较、合并、拆分、生成阅读计划或联网搜索资料',
    '- 如果需要外部资料，请联网搜索并在回答中给出链接',
    '',
    'PDF 工作集：',
    documentList,
  ].join('\n');
}
