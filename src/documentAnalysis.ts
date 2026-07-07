export type DocumentKind =
  | 'academic-paper'
  | 'school-textbook'
  | 'university-textbook'
  | 'monograph'
  | 'report'
  | 'contract'
  | 'slides-or-handout'
  | 'general';

export interface SuggestedAction {
  id: string;
  label: string;
  prompt: string;
  intent: 'read' | 'annotate' | 'organize' | 'research' | 'compare';
}

export interface DocumentAnalysis {
  kind: DocumentKind;
  label: string;
  confidence: number;
  summary: string;
  signals: string[];
  suggestions: SuggestedAction[];
}

const LABELS: Record<DocumentKind, string> = {
  'academic-paper': '学术论文',
  'school-textbook': '中小学教材',
  'university-textbook': '大学教材',
  monograph: '专著',
  report: '报告',
  contract: '合同',
  'slides-or-handout': '讲义/幻灯片',
  general: '普通文档',
};

const BASE_SUGGESTIONS: SuggestedAction[] = [
  { id: 'summarize', label: '总结全文', prompt: '请快速总结当前 PDF 的核心内容。', intent: 'read' },
  { id: 'extract-outline', label: '提取大纲', prompt: '请提取当前 PDF 的结构化大纲。', intent: 'read' },
  { id: 'highlight-headings', label: '高亮标题', prompt: '请先理解 PDF 结构，再高亮真正的章节标题和小节标题。', intent: 'annotate' },
];

const SUGGESTIONS_BY_KIND: Record<DocumentKind, SuggestedAction[]> = {
  'academic-paper': [
    { id: 'highlight-key-claims', label: '高亮关键论点', prompt: '请找出并高亮这篇论文的关键论点、方法和结论。', intent: 'annotate' },
    { id: 'search-related-papers', label: '联网找相关论文', prompt: '请联网搜索这篇论文相关资料和后续工作，并在回答中给链接。', intent: 'research' },
    { id: 'extract-citations', label: '整理参考文献', prompt: '请提取参考文献并按主题分组。', intent: 'research' },
  ],
  'school-textbook': [
    { id: 'make-study-plan', label: '生成学习计划', prompt: '请按章节为这份教材生成学习计划和练习建议。', intent: 'read' },
    { id: 'extract-exercises', label: '提取习题', prompt: '请提取所有习题并按难度分类。', intent: 'organize' },
  ],
  'university-textbook': [
    { id: 'extract-theorems', label: '提取定理证明', prompt: '请提取重要定理、定义和证明思路。', intent: 'read' },
    { id: 'make-study-plan', label: '生成学习计划', prompt: '请为这本大学教材生成分阶段阅读计划。', intent: 'read' },
  ],
  monograph: [
    { id: 'chapter-map', label: '章节脉络', prompt: '请梳理这本专著的章节脉络和核心问题。', intent: 'read' },
    { id: 'search-author-context', label: '搜索作者背景', prompt: '请联网搜索作者和本书相关背景资料，并给出链接。', intent: 'research' },
  ],
  report: [
    { id: 'extract-findings', label: '提取结论建议', prompt: '请提取报告的主要发现、证据和建议。', intent: 'read' },
    { id: 'make-brief', label: '生成简报', prompt: '请把这份报告整理成一页简报。', intent: 'organize' },
  ],
  contract: [
    { id: 'extract-obligations', label: '提取权责风险', prompt: '请提取合同中的义务、期限、金额、违约和终止条款。', intent: 'read' },
    { id: 'highlight-risk-clauses', label: '高亮风险条款', prompt: '请高亮潜在风险条款并说明原因。', intent: 'annotate' },
  ],
  'slides-or-handout': [
    { id: 'make-speaker-notes', label: '整理讲稿', prompt: '请把这份讲义整理成演讲笔记。', intent: 'organize' },
    { id: 'extract-action-items', label: '提取行动项', prompt: '请提取这份材料中的行动项和待办。', intent: 'organize' },
  ],
  general: [],
};

export function analyzeDocumentText(text: string): DocumentAnalysis {
  const normalized = text.toLowerCase();
  const scores: Record<DocumentKind, number> = {
    'academic-paper': 0,
    'school-textbook': 0,
    'university-textbook': 0,
    monograph: 0,
    report: 0,
    contract: 0,
    'slides-or-handout': 0,
    general: 0.5,
  };
  const signals: Record<DocumentKind, string[]> = {
    'academic-paper': [],
    'school-textbook': [],
    'university-textbook': [],
    monograph: [],
    report: [],
    contract: [],
    'slides-or-handout': [],
    general: [],
  };

  addSignals(normalized, scores, signals, 'academic-paper', [
    ['abstract', 2],
    ['references', 2],
    ['doi:', 2],
    ['arxiv', 2],
    ['keywords', 1.5],
    ['methodology', 1],
    ['introduction', 0.8],
  ]);
  addSignals(normalized, scores, signals, 'school-textbook', [
    ['grade ', 2],
    ['practice', 1.4],
    ['exercise', 1.2],
    ['example', 1],
    ['lesson', 1],
    ['fractions', 1],
  ]);
  addSignals(normalized, scores, signals, 'university-textbook', [
    ['theorem', 2],
    ['proof', 2],
    ['problem set', 1.6],
    ['definition', 1.2],
    ['hilbert', 1.2],
    ['linear operator', 1.2],
  ]);
  addSignals(normalized, scores, signals, 'monograph', [
    ['bibliography', 1.5],
    ['index', 1],
    ['chapter', 0.8],
    ['preface', 1],
  ]);
  addSignals(normalized, scores, signals, 'report', [
    ['executive summary', 2],
    ['findings', 1.6],
    ['recommendations', 1.6],
    ['appendix', 1],
  ]);
  addSignals(normalized, scores, signals, 'contract', [
    ['agreement', 2],
    ['party', 1.4],
    ['effective date', 1.4],
    ['termination', 1.4],
    ['governing law', 1.4],
    ['confidentiality', 1.2],
  ]);
  addSignals(normalized, scores, signals, 'slides-or-handout', [
    ['agenda', 1.5],
    ['slide', 1.5],
    ['bullet', 1],
    ['handout', 1.5],
  ]);

  const kind = pickKind(scores);
  const confidence = Math.min(0.96, Math.max(0.35, scores[kind] / 7));
  return {
    kind,
    label: LABELS[kind],
    confidence,
    summary: buildSummary(kind, signals[kind]),
    signals: signals[kind],
    suggestions: [...BASE_SUGGESTIONS, ...SUGGESTIONS_BY_KIND[kind]],
  };
}

function addSignals(
  text: string,
  scores: Record<DocumentKind, number>,
  signals: Record<DocumentKind, string[]>,
  kind: DocumentKind,
  patterns: Array<[string, number]>,
) {
  for (const [pattern, weight] of patterns) {
    if (!text.includes(pattern)) continue;
    scores[kind] += weight;
    signals[kind].push(pattern);
  }
}

function pickKind(scores: Record<DocumentKind, number>): DocumentKind {
  return (Object.entries(scores) as Array<[DocumentKind, number]>).sort((a, b) => b[1] - a[1])[0][0];
}

function buildSummary(kind: DocumentKind, signals: string[]): string {
  if (kind === 'general') return '小雀还没有识别出强类型特征，先按普通文档处理。';
  return `小雀识别为${LABELS[kind]}，依据：${signals.slice(0, 4).join('、')}。`;
}
