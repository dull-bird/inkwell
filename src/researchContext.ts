import type { WorkspaceDocumentContext } from './workspaceContext';

export function buildResearchPrompt(document: WorkspaceDocumentContext, userRequest: string): string {
  return [
    '请作为小雀为当前 PDF 做快速联网资料检索。',
    '',
    '当前 PDF：',
    `Title: ${document.title}`,
    `Path: ${document.path}`,
    `Type: ${document.label}`,
    `Local analysis: ${document.summary}`,
    '',
    '用户意图：',
    userRequest,
    '',
    '执行要求：',
    '- 先用 read_pdf_text 读取当前 PDF 的题名、摘要、目录或第一页关键信息，避免只根据文件名搜索',
    '- 联网搜索相关资料，优先找官方页面、论文页、出版社页、课程页、作者主页、代码仓库或可信资料',
    '- 回答中必须给出可点击链接',
    '- 如果找到 PDF、代码、数据集、课件、补充材料或出版社样章，请单独列为“下载选项”',
    '- 保持回答简洁，不要展开长思维链',
  ].join('\n');
}
