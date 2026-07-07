import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Bot,
  ChevronRight,
  File,
  FileText,
  FolderOpen,
  Highlighter,
  LayoutPanelLeft,
  Lock,
  MessageSquare,
  Moon,
  PanelRight,
  Puzzle,
  PackageOpen,
  RotateCw,
  Scissors,
  Search,
  Shield,
  Sparkles,
  Stamp,
  Sun,
  Trash2,
  Wand2,
} from 'lucide-react';
import PdfViewer, { type CommentTarget, type HighlightOperation } from './components/PdfViewer';
import ChatPanel from './components/ChatPanel';
import ErrorBoundary from './components/ErrorBoundary';
import SparrowMark from './components/SparrowMark';
import { buildAiBrushPrompt, validateAiBrushRun } from './aiBrush';
import { buildSemanticHeadingHighlightPrompt } from './agentPrompts';
import { analyzeDocumentText, type DocumentAnalysis } from './documentAnalysis';
import {
  buildEncryptRequest,
  buildFillFormRequest,
  buildTypedSignatureRequest,
  buildWatermarkRequest,
  describeFileOutput,
} from './pdfFileActions';
import { parsePageRanges } from './pdfRanges';
import { buildRemainingPageOrder, buildRotationMap } from './pageOperations';
import { nativePdfCoreStatusSummary, type NativePdfCoreStatus } from '../shared/native-pdf-core';
import {
  DEFAULT_AI_PERMISSION_MODE,
  getDefaultDocumentAiEnabled,
  isAiAllowed,
  type AiPermissionMode,
} from './privacy';
import { filterSkillCatalog, SPARROW_SKILLS } from './skillCatalog';
import {
  buildNativeAgentHandoffMarkdown,
  buildNativeAgentNextPrompt,
  normalizeSessionNotes,
  type ChatTranscriptMessage,
  type SessionExportDocument,
} from './sessionExport';
import type { WorkspaceDocumentContext } from './workspaceContext';
import {
  buildWorkspaceTree,
  normalizePdfPaths,
  normalizeWorkspacePaths,
  type WorkspaceTreeNode,
} from './workspaceFiles';
import { buildMergePaths } from './workspaceMerge';

interface BackendState {
  url: string;
  token: string;
}

type DocumentStatus = 'loading' | 'ready' | 'error';
type AnalysisStatus = 'idle' | 'analyzing' | 'ready' | 'error';
type SidebarView = 'files' | 'tools' | 'skills' | 'privacy';

interface SparrowDocument {
  id: string;
  path: string;
  title: string;
  status: DocumentStatus;
  pageCount?: number;
  analysisStatus: AnalysisStatus;
  analysis?: DocumentAnalysis;
  aiEnabled: boolean;
  error?: string;
}

interface ApplyResponse {
  output: string;
}

interface FileOutputResponse {
  output: string;
}

interface SplitResponse {
  output_dir: string;
  files: string[];
}

interface ExtractTextResponse {
  text: string | Record<string, string>;
}

interface DocumentInfoResponse {
  page_count: number;
}

interface FormFieldsResponse {
  fields: Array<{ name: string; type: string; value: unknown; page: number }>;
}

interface PendingAgentPrompt {
  id: string;
  text: string;
}

export default function App() {
  const [documents, setDocuments] = useState<SparrowDocument[]>([]);
  const [workspacePaths, setWorkspacePaths] = useState<string[]>([]);
  const [activeDocumentId, setActiveDocumentId] = useState<string | null>(null);
  const [backend, setBackend] = useState<BackendState | null>(null);
  const [nativeCoreStatus, setNativeCoreStatus] = useState<NativePdfCoreStatus | null>(null);
  const [highlightsByDocument, setHighlightsByDocument] = useState<Record<string, HighlightOperation[]>>({});
  const [commentTargetsByDocument, setCommentTargetsByDocument] = useState<Record<string, CommentTarget>>({});
  const [undoStack, setUndoStack] = useState<Array<{ documentId: string; operations: HighlightOperation[] }>>([]);
  const [redoStack, setRedoStack] = useState<Array<{ documentId: string; operations: HighlightOperation[] }>>([]);
  const [agentOutput, setAgentOutput] = useState<string | null>(null);
  const [splitOutputDir, setSplitOutputDir] = useState<string | null>(null);
  const [sessionExportDir, setSessionExportDir] = useState<string | null>(null);
  const [sessionNotes, setSessionNotes] = useState('');
  const [chatTranscript, setChatTranscript] = useState<ChatTranscriptMessage[]>([]);
  const [commentText, setCommentText] = useState('Needs review');
  const [splitRanges, setSplitRanges] = useState('');
  const [pageEditRanges, setPageEditRanges] = useState('');
  const [rotationDegrees, setRotationDegrees] = useState(90);
  const [watermarkText, setWatermarkText] = useState('Internal Review');
  const [encryptPassword, setEncryptPassword] = useState('');
  const [formValuesJson, setFormValuesJson] = useState('{\n  "applicant_name": ""\n}');
  const [signatureText, setSignatureText] = useState('');
  const [aiBrushInstruction, setAiBrushInstruction] = useState('highlight claims that need citations');
  const [skillSearch, setSkillSearch] = useState('');
  const [sidebarView, setSidebarView] = useState<SidebarView>('files');
  const [leftSidebarVisible, setLeftSidebarVisible] = useState(true);
  const [rightSidebarVisible, setRightSidebarVisible] = useState(true);
  const [theme, setTheme] = useState<'light' | 'dark'>('light');
  const [aiPermissionMode, setAiPermissionMode] = useState<AiPermissionMode>(DEFAULT_AI_PERMISSION_MODE);
  const [pendingAgentPrompt, setPendingAgentPrompt] = useState<PendingAgentPrompt | null>(null);
  const [status, setStatus] = useState<string | null>('AI 默认关闭。打开 PDF 不会自动读取正文。');
  const [busy, setBusy] = useState(false);

  const activeDocument = documents.find((document) => document.id === activeDocumentId) ?? null;
  const highlights = activeDocument ? highlightsByDocument[activeDocument.id] ?? [] : [];
  const commentTarget = activeDocument ? commentTargetsByDocument[activeDocument.id] ?? null : null;
  const aiAllowed = activeDocument ? isAiAllowed(aiPermissionMode, activeDocument.aiEnabled) : false;
  const filteredSkills = useMemo(() => filterSkillCatalog(SPARROW_SKILLS, skillSearch), [skillSearch]);

  const activeDocumentContext = activeDocument
    ? {
        title: activeDocument.title,
        path: activeDocument.path,
        label: activeDocument.analysis?.label ?? 'PDF',
        summary:
          activeDocument.analysis?.summary ??
          (activeDocument.analysisStatus === 'analyzing' ? '正在分析。' : '尚未手动分析。'),
      }
    : null;

  const workspaceDocuments = useMemo<WorkspaceDocumentContext[]>(
    () =>
      documents.map((document) => ({
        title: document.title,
        path: document.path,
        label: document.analysis?.label ?? 'PDF',
        summary: document.analysis?.summary ?? (document.analysisStatus === 'analyzing' ? '正在分析。' : '尚未手动分析。'),
      })),
    [documents],
  );
  const combinedWorkspacePaths = useMemo(
    () => normalizeWorkspacePaths([...workspacePaths, ...documents.map((document) => document.path)]),
    [documents, workspacePaths],
  );

  useEffect(() => {
    void window.electronAPI
      .getNativePdfCoreStatus()
      .then(setNativeCoreStatus)
      .catch((error) => {
        setStatus(error instanceof Error ? error.message : String(error));
      });
  }, []);

  const pdfUrl = useMemo(() => {
    if (!backend || !activeDocument) return null;
    return `${backend.url}/pdf?path=${encodeURIComponent(activeDocument.path)}`;
  }, [backend, activeDocument]);

  const backendPost = useCallback(
    async <T,>(endpoint: string, body: unknown): Promise<T> => {
      if (!backend) throw new Error('Backend not ready yet.');
      return postJson<T>(backend.url, backend.token, endpoint, body);
    },
    [backend],
  );

  const setDocumentPatch = useCallback((id: string, patch: Partial<SparrowDocument>) => {
    setDocuments((current) => current.map((document) => (document.id === id ? { ...document, ...patch } : document)));
  }, []);

  const addWorkspacePaths = useCallback((paths: string[]) => {
    setWorkspacePaths((current) => normalizeWorkspacePaths([...current, ...paths]));
  }, []);

  const loadDocumentInfo = useCallback(
    async (document: SparrowDocument, nextBackend: BackendState) => {
      try {
        const info = await postJson<DocumentInfoResponse>(nextBackend.url, nextBackend.token, '/document-info', {
          path: document.path,
        });
        setDocumentPatch(document.id, { status: 'ready', pageCount: info.page_count });
        setStatus(`已打开 ${document.title}。分析和 AI 需要手动开启。`);
      } catch (error) {
        setDocumentPatch(document.id, {
          status: 'error',
          error: error instanceof Error ? error.message : String(error),
        });
      }
    },
    [setDocumentPatch],
  );

  const activateDocument = useCallback(async (document: SparrowDocument) => {
    setActiveDocumentId(document.id);
    await window.electronAPI.setCurrentFile(document.path);
  }, []);

  const loadPdf = useCallback(
    async (path: string) => {
      addWorkspacePaths([path]);
      const [backendUrl, backendToken] = await Promise.all([
        window.electronAPI.getBackendUrl(),
        window.electronAPI.getBackendToken(),
      ]);
      const nextBackend = { url: backendUrl, token: backendToken };
      const existing = documents.find((document) => document.path === path);
      setBackend(nextBackend);

      if (existing) {
        await activateDocument(existing);
        return;
      }

      const document: SparrowDocument = {
        id: crypto.randomUUID(),
        path,
        title: fileName(path),
        status: 'loading',
        analysisStatus: 'idle',
        aiEnabled: getDefaultDocumentAiEnabled(aiPermissionMode),
      };
      setDocuments((current) => [...current, document]);
      setHighlightsByDocument((current) => ({ ...current, [document.id]: [] }));
      setActiveDocumentId(document.id);
      await window.electronAPI.setCurrentFile(path);
      setStatus(`正在打开 ${document.title}。不会自动读取正文。`);
      void loadDocumentInfo(document, nextBackend);
    },
    [activateDocument, addWorkspacePaths, aiPermissionMode, documents, loadDocumentInfo],
  );

  const handleOpenFile = async () => {
    const path = await window.electronAPI.openPdfFile();
    if (!path) return;
    await loadPdf(path);
  };

  const handleOpenFolder = async () => {
    const paths = normalizeWorkspacePaths(await window.electronAPI.openPdfFolder());
    if (paths.length === 0) {
      setStatus('No PDF or Markdown files found in folder.');
      return;
    }
    addWorkspacePaths(paths);
    const pdfPaths = normalizePdfPaths(paths);
    const markdownCount = paths.length - pdfPaths.length;
    setStatus(`Adding ${pdfPaths.length} PDFs and ${markdownCount} Markdown files to workspace.`);
    for (const path of pdfPaths) {
      await loadPdf(path);
    }
    setStatus(`Added ${pdfPaths.length} PDFs and ${markdownCount} Markdown files to workspace.`);
  };

  const analyzeActiveDocument = useCallback(async () => {
    if (!activeDocument) {
      setStatus('Open a PDF first.');
      return;
    }
    setDocumentPatch(activeDocument.id, { analysisStatus: 'analyzing' });
    setBusy(true);
    try {
      const result = await backendPost<ExtractTextResponse>('/extract-text', { path: activeDocument.path });
      const text = typeof result.text === 'string' ? result.text : Object.values(result.text).join('\n');
      setDocumentPatch(activeDocument.id, { analysisStatus: 'ready', analysis: analyzeDocumentText(text) });
      setStatus(`已手动分析 ${activeDocument.title}。`);
    } catch (error) {
      setDocumentPatch(activeDocument.id, {
        analysisStatus: 'error',
        error: error instanceof Error ? error.message : String(error),
      });
      setStatus(error instanceof Error ? error.message : String(error));
    } finally {
      setBusy(false);
    }
  }, [activeDocument, backendPost, setDocumentPatch]);

  const enableAiForActiveDocument = useCallback(() => {
    if (!activeDocument) return;
    setDocumentPatch(activeDocument.id, { aiEnabled: true });
    setStatus(`已为 ${activeDocument.title} 开启 AI。`);
    setRightSidebarVisible(true);
  }, [activeDocument, setDocumentPatch]);

  const addHighlightBatch = useCallback(
    (batch: HighlightOperation[]) => {
      if (!activeDocument) {
        setStatus('Open a PDF first.');
        return;
      }
      if (batch.length === 0) {
        setStatus('No matching text blocks found.');
        return;
      }
      const stableBatch = batch.map((op) => ({ ...op, id: op.id || crypto.randomUUID() }));
      setHighlightsByDocument((current) => ({
        ...current,
        [activeDocument.id]: [...(current[activeDocument.id] ?? []), ...stableBatch],
      }));
      setUndoStack((current) => [...current, { documentId: activeDocument.id, operations: stableBatch }]);
      setRedoStack([]);
      setStatus(`已预览 ${stableBatch.length} 个高亮，可撤回或应用保存。`);
    },
    [activeDocument],
  );

  const highlightHeadings = useCallback(() => {
    if (!activeDocument) {
      setStatus('Open a PDF first.');
      return;
    }
    if (!aiAllowed) {
      setRightSidebarVisible(true);
      setStatus('高亮标题需要 AI 语义判断。请先为当前 PDF 开启 AI。');
      return;
    }
    setRightSidebarVisible(true);
    setPendingAgentPrompt({
      id: crypto.randomUUID(),
      text: buildSemanticHeadingHighlightPrompt(activeDocument.title),
    });
    setStatus('已把 AI 高亮标题请求发送给小雀。');
  }, [activeDocument, aiAllowed]);

  const undo = useCallback(() => {
    setUndoStack((current) => {
      const batch = current.at(-1);
      if (!batch) return current;
      const batchIds = new Set(batch.operations.map((operation) => operation.id));
      setHighlightsByDocument((byDocument) => ({
        ...byDocument,
        [batch.documentId]: (byDocument[batch.documentId] ?? []).filter((operation) => !batchIds.has(operation.id)),
      }));
      setRedoStack((redo) => [...redo, batch]);
      setStatus('已撤回上一组预览操作。');
      return current.slice(0, -1);
    });
  }, []);

  const redo = useCallback(() => {
    setRedoStack((current) => {
      const batch = current.at(-1);
      if (!batch) return current;
      setHighlightsByDocument((byDocument) => ({
        ...byDocument,
        [batch.documentId]: [...(byDocument[batch.documentId] ?? []), ...batch.operations],
      }));
      setUndoStack((undoStackCurrent) => [...undoStackCurrent, batch]);
      setStatus('已恢复上一组预览操作。');
      return current.slice(0, -1);
    });
  }, []);

  const applyHighlights = useCallback(async () => {
    if (!activeDocument || highlights.length === 0) return;
    setBusy(true);
    try {
      const result = await backendPost<ApplyResponse>('/apply', { path: activeDocument.path, operations: highlights });
      setAgentOutput(result.output);
      await loadPdf(result.output);
      setStatus(`已保存并打开 ${fileName(result.output)}`);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : String(error));
    } finally {
      setBusy(false);
    }
  }, [activeDocument, backendPost, highlights, loadPdf]);

  const addComment = useCallback(async () => {
    if (!activeDocument) {
      setStatus('Open a PDF first.');
      return;
    }
    if (!commentTarget) {
      setStatus('Click a PDF page place comment first.');
      return;
    }
    const text = commentText.trim();
    if (!text) {
      setStatus('Comment text cannot be empty.');
      return;
    }
    setBusy(true);
    try {
      const result = await backendPost<FileOutputResponse>('/comment', {
        path: activeDocument.path,
        page: commentTarget.page,
        x: commentTarget.x,
        y: commentTarget.y,
        text,
        author: 'Sparrow',
      });
      setAgentOutput(result.output);
      await loadPdf(result.output);
      setStatus(`已添加批注并打开 ${fileName(result.output)}`);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : String(error));
    } finally {
      setBusy(false);
    }
  }, [activeDocument, backendPost, commentTarget, commentText, loadPdf]);

  const splitPdf = useCallback(async () => {
    if (!activeDocument) {
      setStatus('Open a PDF first.');
      return;
    }
    setBusy(true);
    try {
      const pageRanges = parsePageRanges(splitRanges);
      const result = await backendPost<SplitResponse>('/split', {
        path: activeDocument.path,
        ...(pageRanges ? { page_ranges: pageRanges } : {}),
      });
      setAgentOutput(null);
      setSplitOutputDir(result.output_dir);
      setStatus(`已拆分为 ${result.files.length} 个 PDF：${result.output_dir}`);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : String(error));
    } finally {
      setBusy(false);
    }
  }, [activeDocument, backendPost, splitRanges]);

  const mergeWorkspacePdfs = useCallback(async () => {
    setBusy(true);
    try {
      const paths = buildMergePaths(documents);
      const result = await backendPost<FileOutputResponse>('/merge', { paths });
      setAgentOutput(result.output);
      await loadPdf(result.output);
      setStatus(`已合并 ${paths.length} 个 PDF 并打开结果。`);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : String(error));
    } finally {
      setBusy(false);
    }
  }, [backendPost, documents, loadPdf]);

  const rotatePages = useCallback(async () => {
    if (!activeDocument?.pageCount) {
      setStatus('Page count is not ready yet.');
      return;
    }
    setBusy(true);
    try {
      const pageRanges = parsePageRanges(pageEditRanges) ?? ([[1, activeDocument.pageCount]] as [number, number][]);
      const rotations = buildRotationMap(activeDocument.pageCount, pageRanges, rotationDegrees);
      const result = await backendPost<FileOutputResponse>('/rotate', { path: activeDocument.path, rotations });
      setAgentOutput(result.output);
      await loadPdf(result.output);
      setStatus(`已旋转页面并打开 ${fileName(result.output)}`);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : String(error));
    } finally {
      setBusy(false);
    }
  }, [activeDocument, backendPost, loadPdf, pageEditRanges, rotationDegrees]);

  const deletePages = useCallback(async () => {
    if (!activeDocument?.pageCount) {
      setStatus('Page count is not ready yet.');
      return;
    }
    if (!pageEditRanges.trim()) {
      setStatus('Enter page ranges to delete, for example 2-3.');
      return;
    }
    setBusy(true);
    try {
      const pageRanges = parsePageRanges(pageEditRanges);
      if (!pageRanges) throw new Error('Enter page ranges to delete.');
      const newOrder = buildRemainingPageOrder(activeDocument.pageCount, pageRanges);
      const result = await backendPost<FileOutputResponse>('/reorder', { path: activeDocument.path, new_order: newOrder });
      setAgentOutput(result.output);
      await loadPdf(result.output);
      setStatus(`已删除页面并打开 ${fileName(result.output)}`);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : String(error));
    } finally {
      setBusy(false);
    }
  }, [activeDocument, backendPost, loadPdf, pageEditRanges]);

  const addWatermark = useCallback(async () => {
    if (!activeDocument) {
      setStatus('Open a PDF first.');
      return;
    }
    setBusy(true);
    try {
      const result = await backendPost<FileOutputResponse>(
        '/watermark',
        buildWatermarkRequest(activeDocument.path, watermarkText),
      );
      setAgentOutput(result.output);
      await loadPdf(result.output);
      setStatus(describeFileOutput('watermark', result.output));
    } catch (error) {
      setStatus(error instanceof Error ? error.message : String(error));
    } finally {
      setBusy(false);
    }
  }, [activeDocument, backendPost, loadPdf, watermarkText]);

  const encryptPdf = useCallback(async () => {
    if (!activeDocument) {
      setStatus('Open a PDF first.');
      return;
    }
    setBusy(true);
    try {
      const result = await backendPost<FileOutputResponse>(
        '/encrypt',
        buildEncryptRequest(activeDocument.path, encryptPassword),
      );
      setAgentOutput(result.output);
      setStatus(describeFileOutput('encrypt', result.output));
    } catch (error) {
      setStatus(error instanceof Error ? error.message : String(error));
    } finally {
      setBusy(false);
    }
  }, [activeDocument, backendPost, encryptPassword]);

  const readFormFields = useCallback(async () => {
    if (!activeDocument) {
      setStatus('Open a PDF first.');
      return;
    }
    setBusy(true);
    try {
      const result = await backendPost<FormFieldsResponse>('/form-fields', { path: activeDocument.path });
      const draft = Object.fromEntries(result.fields.map((field) => [field.name, field.value ?? '']));
      setFormValuesJson(JSON.stringify(draft, null, 2));
      setStatus(`检测到 ${result.fields.length} 个可填写表单字段。`);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : String(error));
    } finally {
      setBusy(false);
    }
  }, [activeDocument, backendPost]);

  const fillFormFields = useCallback(async () => {
    if (!activeDocument) {
      setStatus('Open a PDF first.');
      return;
    }
    setBusy(true);
    try {
      const result = await backendPost<FileOutputResponse>('/fill-form', buildFillFormRequest(activeDocument.path, formValuesJson));
      setAgentOutput(result.output);
      await loadPdf(result.output);
      setStatus(describeFileOutput('fill-form', result.output));
    } catch (error) {
      setStatus(error instanceof Error ? error.message : String(error));
    } finally {
      setBusy(false);
    }
  }, [activeDocument, backendPost, formValuesJson, loadPdf]);

  const addTypedSignature = useCallback(async () => {
    if (!activeDocument) {
      setStatus('Open a PDF first.');
      return;
    }
    if (!commentTarget) {
      setStatus('Click a PDF page to choose signature position first.');
      return;
    }
    setBusy(true);
    try {
      const request = buildTypedSignatureRequest(
        activeDocument.path,
        commentTarget.page,
        commentTarget.x,
        commentTarget.y,
        signatureText,
      );
      const result = await backendPost<FileOutputResponse>('/signature', request);
      setAgentOutput(result.output);
      await loadPdf(result.output);
      setStatus(describeFileOutput('signature', result.output));
    } catch (error) {
      setStatus(error instanceof Error ? error.message : String(error));
    } finally {
      setBusy(false);
    }
  }, [activeDocument, backendPost, commentTarget, loadPdf, signatureText]);

  const runAiBrush = useCallback(() => {
    if (!activeDocument) {
      setStatus('Open a PDF first.');
      return;
    }
    try {
      const instruction = validateAiBrushRun(aiAllowed, aiBrushInstruction);
      setRightSidebarVisible(true);
      setPendingAgentPrompt({
        id: crypto.randomUUID(),
        text: buildAiBrushPrompt(activeDocument.title, instruction),
      });
      setStatus('AI 画笔请求已发送给小雀。');
    } catch (error) {
      setStatus(error instanceof Error ? error.message : String(error));
    }
  }, [activeDocument, aiAllowed, aiBrushInstruction]);

  const openOutputPath = useCallback(async (path: string) => {
    try {
      await window.electronAPI.openPath(path);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : String(error));
    }
  }, []);

  const toSessionExportDocument = useCallback(
    (document: SparrowDocument): SessionExportDocument => ({
      title: document.title,
      path: document.path,
      pageCount: document.pageCount,
      analysisLabel: document.analysis?.label,
      analysisSummary: document.analysis?.summary,
      previewHighlightCount: highlightsByDocument[document.id]?.length ?? 0,
    }),
    [highlightsByDocument],
  );

  const exportNativeAgentSession = useCallback(async () => {
    const exportedAt = new Date().toISOString();
    const exportDocuments = documents.map(toSessionExportDocument);
    const activeExportDocument = activeDocument ? toSessionExportDocument(activeDocument) : null;
    const notesMarkdown = normalizeSessionNotes(sessionNotes);
    const nextPrompt = buildNativeAgentNextPrompt({
      activePdfPath: activeDocument?.path,
      handoffPath: './handoff.md',
      notesPath: './notes.md',
    });
    const handoffMarkdown = buildNativeAgentHandoffMarkdown({
      appName: 'Sparrow',
      exportedAt,
      activeDocument: activeExportDocument,
      documents: exportDocuments,
      workspacePaths: combinedWorkspacePaths,
      notesMarkdown,
      transcript: chatTranscript,
      aiPermissionMode,
    });

    setBusy(true);
    try {
      const result = await window.electronAPI.exportNativeAgentSession({
        suggestedName: activeDocument?.title ?? 'sparrow-session',
        handoffMarkdown,
        notesMarkdown,
        nextPrompt,
        activePdfPath: activeDocument?.path ?? null,
        hasUnsavedPreviewOperations: exportDocuments.some((document) => document.previewHighlightCount > 0),
      });
      setSessionExportDir(result.directory);
      setStatus(`已导出给原生 Agent：${result.directory}`);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : String(error));
    } finally {
      setBusy(false);
    }
  }, [
    activeDocument,
    aiPermissionMode,
    chatTranscript,
    combinedWorkspacePaths,
    documents,
    sessionNotes,
    toSessionExportDocument,
  ]);

  const handleFileOutput = useCallback((path: string) => {
    setAgentOutput(path);
    setStatus(`Agent produced ${fileName(path)}`);
  }, []);

  const handleSplitOutput = useCallback((outputDir: string, fileCount: number) => {
    setAgentOutput(null);
    setSplitOutputDir(outputDir);
    setStatus(`Agent split into ${fileCount} PDFs at ${outputDir}`);
  }, []);

  const activityItems: Array<{ id: SidebarView; label: string; icon: typeof FileText }> = [
    { id: 'files', label: 'Files', icon: FileText },
    { id: 'tools', label: 'Tools', icon: Highlighter },
    { id: 'skills', label: 'Skills', icon: Puzzle },
    { id: 'privacy', label: 'Privacy', icon: Shield },
  ];

  return (
    <ErrorBoundary>
      <div
        className="sparrow-app"
        data-theme={theme}
        style={{
          gridTemplateColumns: `48px ${leftSidebarVisible ? '278px' : '0'} minmax(0, 1fr) ${
            rightSidebarVisible ? '390px' : '0'
          }`,
        }}
      >
        <nav className="activity-rail" aria-label="Primary">
          <button className="brand-rail-button" title="Sparrow" aria-label="Sparrow">
            <SparrowMark size={28} />
          </button>
          <div className="activity-buttons">
            {activityItems.map((item) => {
              const Icon = item.icon;
              return (
                <button
                  key={item.id}
                  className={sidebarView === item.id && leftSidebarVisible ? 'active' : ''}
                  title={item.label}
                  aria-label={item.label}
                  onClick={() => {
                    setSidebarView(item.id);
                    setLeftSidebarVisible(true);
                  }}
                >
                  <Icon size={18} />
                </button>
              );
            })}
          </div>
          <div className="activity-bottom">
            <button
              title={theme === 'light' ? 'Dark theme' : 'Light theme'}
              aria-label="Toggle theme"
              onClick={() => setTheme((current) => (current === 'light' ? 'dark' : 'light'))}
            >
              {theme === 'light' ? <Moon size={18} /> : <Sun size={18} />}
            </button>
          </div>
        </nav>

        <aside className="sparrow-sidebar" aria-hidden={!leftSidebarVisible}>
          {leftSidebarVisible && (
            <>
              <div className="sidebar-header">
                <div>
                  <div className="brand-title">雀阅</div>
                  <div className="brand-subtitle">Sparrow PDF Editor</div>
                </div>
                <button className="icon-button" onClick={() => setLeftSidebarVisible(false)} title="Hide left sidebar">
                  <LayoutPanelLeft size={17} />
                </button>
              </div>
              {sidebarView === 'files' && (
                <FilesPane
                  activeDocumentId={activeDocumentId}
                  documents={documents}
                  workspacePaths={combinedWorkspacePaths}
                  busy={busy}
                  onOpenFile={handleOpenFile}
                  onOpenFolder={handleOpenFolder}
                  onActivateDocument={activateDocument}
                  onMergeWorkspace={mergeWorkspacePdfs}
                />
              )}
              {sidebarView === 'tools' && (
                <ToolsPane
                  activeDocument={activeDocument}
                  busy={busy}
                  highlights={highlights}
                  undoDisabled={undoStack.length === 0}
                  redoDisabled={redoStack.length === 0}
                  pageEditRanges={pageEditRanges}
                  rotationDegrees={rotationDegrees}
                  splitRanges={splitRanges}
                  commentText={commentText}
                  commentTarget={commentTarget}
                  watermarkText={watermarkText}
                  encryptPassword={encryptPassword}
                  formValuesJson={formValuesJson}
                  signatureText={signatureText}
                  aiBrushInstruction={aiBrushInstruction}
                  sessionNotes={sessionNotes}
                  nativeCoreStatus={nativeCoreStatus}
                  aiAllowed={aiAllowed}
                  onAnalyze={analyzeActiveDocument}
                  onHighlightHeadings={highlightHeadings}
                  onUndo={undo}
                  onRedo={redo}
                  onApplyHighlights={applyHighlights}
                  onSetPageEditRanges={setPageEditRanges}
                  onSetRotationDegrees={setRotationDegrees}
                  onRotatePages={rotatePages}
                  onDeletePages={deletePages}
                  onSetSplitRanges={setSplitRanges}
                  onSplitPdf={splitPdf}
                  onSetCommentText={setCommentText}
                  onAddComment={addComment}
                  onSetWatermarkText={setWatermarkText}
                  onAddWatermark={addWatermark}
                  onSetEncryptPassword={setEncryptPassword}
                  onEncryptPdf={encryptPdf}
                  onReadFormFields={readFormFields}
                  onSetFormValuesJson={setFormValuesJson}
                  onFillFormFields={fillFormFields}
                  onSetSignatureText={setSignatureText}
                  onAddTypedSignature={addTypedSignature}
                  onSetAiBrushInstruction={setAiBrushInstruction}
                  onRunAiBrush={runAiBrush}
                  onSetSessionNotes={setSessionNotes}
                  onExportNativeAgent={exportNativeAgentSession}
                />
              )}
              {sidebarView === 'skills' && (
                <SkillsPane search={skillSearch} skills={filteredSkills} onSearchChange={setSkillSearch} />
              )}
              {sidebarView === 'privacy' && (
                <PrivacyPane
                  mode={aiPermissionMode}
                  aiAllowed={aiAllowed}
                  activeDocument={activeDocument}
                  onModeChange={setAiPermissionMode}
                  onEnableDocumentAi={enableAiForActiveDocument}
                  onAnalyze={analyzeActiveDocument}
                  busy={busy}
                />
              )}
            </>
          )}
        </aside>

        <main className="sparrow-main">
          <div className="tab-strip">
            {!leftSidebarVisible && (
              <button className="chrome-button" onClick={() => setLeftSidebarVisible(true)} title="Show left sidebar">
                <LayoutPanelLeft size={16} />
              </button>
            )}
            {documents.map((document) => (
              <button
                key={document.id}
                className={`pdf-tab ${document.id === activeDocumentId ? 'active' : ''}`}
                onClick={() => void activateDocument(document)}
              >
                {document.title}
              </button>
            ))}
            <div className="tab-spacer" />
            <button
              className="chrome-button"
              onClick={() => setRightSidebarVisible((visible) => !visible)}
              title={rightSidebarVisible ? 'Hide agent panel' : 'Show agent panel'}
            >
              <PanelRight size={16} />
            </button>
          </div>

          <div className="editor-status-bar">
            <div className="status-cluster">
              <span className={`privacy-pill ${aiAllowed ? 'enabled' : ''}`}>
                {aiAllowed ? 'AI enabled' : 'AI off'}
              </span>
              <span className="status-line">{status}</span>
            </div>
            <div className="output-actions">
              {agentOutput && (
                <>
                  <button className="ghost-button" onClick={() => void loadPdf(agentOutput)}>
                    Open result
                  </button>
                  <button className="ghost-button" onClick={() => void openOutputPath(agentOutput)}>
                    System open
                  </button>
                </>
              )}
              {splitOutputDir && !agentOutput && (
                <button className="ghost-button" onClick={() => void openOutputPath(splitOutputDir)}>
                  Open split folder
                </button>
              )}
              {sessionExportDir && (
                <button className="ghost-button" onClick={() => void openOutputPath(sessionExportDir)}>
                  Open handoff
                </button>
              )}
            </div>
          </div>

          <div className="viewer-frame">
            {pdfUrl && backend && activeDocument ? (
              <PdfViewer
                url={pdfUrl}
                token={backend.token}
                highlights={highlights}
                commentTarget={commentTarget}
                onCommentTargetChange={(target) => {
                  setCommentTargetsByDocument((current) => ({ ...current, [activeDocument.id]: target }));
                  setStatus(`Comment target set on page ${target.page + 1}.`);
                }}
              />
            ) : (
              <EmptyState onOpen={handleOpenFile} />
            )}
          </div>
        </main>

        <div className="agent-shell" aria-hidden={!rightSidebarVisible}>
          {rightSidebarVisible && (
            <ChatPanel
              activeDocumentTitle={activeDocument?.title ?? null}
              activeDocumentContext={activeDocumentContext}
              analysis={activeDocument?.analysis ?? null}
              analysisStatus={activeDocument?.analysisStatus ?? 'idle'}
              workspaceDocuments={workspaceDocuments}
              aiEnabled={aiAllowed}
              privacyMode={aiPermissionMode}
              externalPrompt={pendingAgentPrompt}
              onExternalPromptConsumed={(id) => {
                setPendingAgentPrompt((current) => (current?.id === id ? null : current));
              }}
              onEnableAi={enableAiForActiveDocument}
              onAnalyzeDocument={analyzeActiveDocument}
                onFileOutput={handleFileOutput}
                onSplitOutput={handleSplitOutput}
                onPreviewHighlights={addHighlightBatch}
                onTranscriptChange={setChatTranscript}
              />
          )}
        </div>
      </div>
    </ErrorBoundary>
  );
}

interface FilesPaneProps {
  activeDocumentId: string | null;
  documents: SparrowDocument[];
  workspacePaths: string[];
  busy: boolean;
  onOpenFile: () => void;
  onOpenFolder: () => void;
  onActivateDocument: (document: SparrowDocument) => Promise<void>;
  onMergeWorkspace: () => void;
}

function FilesPane({
  activeDocumentId,
  documents,
  workspacePaths,
  busy,
  onOpenFile,
  onOpenFolder,
  onActivateDocument,
  onMergeWorkspace,
}: FilesPaneProps) {
  const tree = useMemo(() => buildWorkspaceTree(workspacePaths), [workspacePaths]);
  const documentByPath = useMemo(
    () => new Map(documents.map((document) => [document.path, document])),
    [documents],
  );

  return (
    <div className="sidebar-content">
      <div className="sidebar-actions">
        <button className="primary-button" onClick={onOpenFile}>
          <FileText size={16} />
          Open PDF
        </button>
        <button className="secondary-button" onClick={onOpenFolder}>
          <FolderOpen size={16} />
          Add Folder
        </button>
      </div>

      <section className="sidebar-section">
        <div className="section-title">Workspace</div>
        {workspacePaths.length === 0 ? (
          <div className="empty-hint">Open files or folder to start.</div>
        ) : (
          <div className="workspace-tree" aria-label={`${tree.rootName} files`}>
            <div className="workspace-root-label">{tree.rootName}</div>
            <WorkspaceTreeRows
              activeDocumentId={activeDocumentId}
              documentByPath={documentByPath}
              nodes={tree.children}
              onActivateDocument={onActivateDocument}
            />
          </div>
        )}
        <div className="document-list legacy-document-list" aria-hidden="true">
          {documents.length === 0 && <div className="empty-hint">Open files or a folder to start.</div>}
          {documents.map((document) => (
            <button
              key={document.id}
              className={`document-item ${document.id === activeDocumentId ? 'active' : ''}`}
              onClick={() => void onActivateDocument(document)}
            >
              <span className="document-name">{document.title}</span>
              <span className="document-kind">
                {document.status === 'loading'
                  ? 'Loading'
                  : `${document.analysis?.label ?? 'PDF'}${document.pageCount ? ` · ${document.pageCount} pages` : ''}`}
              </span>
            </button>
          ))}
        </div>
        <button className="workspace-merge-button" onClick={onMergeWorkspace} disabled={documents.length < 2 || busy}>
          Merge {documents.length > 1 ? `${documents.length} PDFs` : 'PDFs'}
        </button>
      </section>
    </div>
  );
}

function WorkspaceTreeRows({
  activeDocumentId,
  documentByPath,
  nodes,
  onActivateDocument,
  depth = 0,
}: {
  activeDocumentId: string | null;
  documentByPath: Map<string, SparrowDocument>;
  nodes: WorkspaceTreeNode[];
  onActivateDocument: (document: SparrowDocument) => Promise<void>;
  depth?: number;
}) {
  return (
    <div className="workspace-tree-level">
      {nodes.map((node) => (
        <WorkspaceTreeRow
          key={node.id}
          activeDocumentId={activeDocumentId}
          depth={depth}
          document={documentByPath.get(node.path)}
          documentByPath={documentByPath}
          node={node}
          onActivateDocument={onActivateDocument}
        />
      ))}
    </div>
  );
}

function WorkspaceTreeRow({
  activeDocumentId,
  depth,
  document,
  documentByPath,
  node,
  onActivateDocument,
}: {
  activeDocumentId: string | null;
  depth: number;
  document?: SparrowDocument;
  documentByPath: Map<string, SparrowDocument>;
  node: WorkspaceTreeNode;
  onActivateDocument: (document: SparrowDocument) => Promise<void>;
}) {
  const [open, setOpen] = useState(true);
  const isFolder = node.kind === 'folder';
  const active = document?.id === activeDocumentId;
  const Icon = isFolder ? FolderOpen : node.kind === 'markdown' ? File : FileText;
  const label =
    document?.status === 'loading'
      ? 'Loading'
      : document
        ? `${document.analysis?.label ?? 'PDF'}${document.pageCount ? ` · ${document.pageCount} pages` : ''}`
        : node.kind === 'markdown'
          ? 'Markdown'
          : 'File';

  return (
    <>
      <button
        className={`workspace-tree-row ${active ? 'active' : ''} ${isFolder ? 'folder' : ''}`}
        onClick={() => {
          if (isFolder) {
            setOpen((value) => !value);
            return;
          }
          if (document) void onActivateDocument(document);
        }}
        style={{ paddingLeft: 8 + depth * 14 }}
      >
        {isFolder ? (
          <ChevronRight className={`tree-caret ${open ? 'open' : ''}`} size={13} />
        ) : (
          <span className="tree-caret-spacer" />
        )}
        <Icon size={15} />
        <span className="workspace-tree-name">{node.name}</span>
        <span className="workspace-tree-kind">{label}</span>
      </button>
      {isFolder && open && node.children && (
        <WorkspaceTreeRows
          activeDocumentId={activeDocumentId}
          depth={depth + 1}
          documentByPath={documentByPath}
          nodes={node.children}
          onActivateDocument={onActivateDocument}
        />
      )}
    </>
  );
}

interface ToolsPaneProps {
  activeDocument: SparrowDocument | null;
  busy: boolean;
  highlights: HighlightOperation[];
  undoDisabled: boolean;
  redoDisabled: boolean;
  pageEditRanges: string;
  rotationDegrees: number;
  splitRanges: string;
  commentText: string;
  commentTarget: CommentTarget | null;
  watermarkText: string;
  encryptPassword: string;
  formValuesJson: string;
  signatureText: string;
  aiBrushInstruction: string;
  sessionNotes: string;
  nativeCoreStatus: NativePdfCoreStatus | null;
  aiAllowed: boolean;
  onAnalyze: () => void;
  onHighlightHeadings: () => void;
  onUndo: () => void;
  onRedo: () => void;
  onApplyHighlights: () => void;
  onSetPageEditRanges: (value: string) => void;
  onSetRotationDegrees: (value: number) => void;
  onRotatePages: () => void;
  onDeletePages: () => void;
  onSetSplitRanges: (value: string) => void;
  onSplitPdf: () => void;
  onSetCommentText: (value: string) => void;
  onAddComment: () => void;
  onSetWatermarkText: (value: string) => void;
  onAddWatermark: () => void;
  onSetEncryptPassword: (value: string) => void;
  onEncryptPdf: () => void;
  onReadFormFields: () => void;
  onSetFormValuesJson: (value: string) => void;
  onFillFormFields: () => void;
  onSetSignatureText: (value: string) => void;
  onAddTypedSignature: () => void;
  onSetAiBrushInstruction: (value: string) => void;
  onRunAiBrush: () => void;
  onSetSessionNotes: (value: string) => void;
  onExportNativeAgent: () => void;
}

function ToolsPane(props: ToolsPaneProps) {
  const disabled = !props.activeDocument || props.busy;
  return (
    <div className="sidebar-content">
      <section className="sidebar-section">
        <div className="section-title">Document</div>
        <div className="tool-grid">
          <button onClick={props.onAnalyze} disabled={disabled}>
            <Sparkles size={15} />
            Analyze
          </button>
          <button onClick={props.onHighlightHeadings} disabled={disabled}>
            <Highlighter size={15} />
            AI Headings
          </button>
          <button onClick={props.onUndo} disabled={props.undoDisabled || props.busy}>
            Undo
          </button>
          <button onClick={props.onRedo} disabled={props.redoDisabled || props.busy}>
            Redo
          </button>
          <button onClick={props.onApplyHighlights} disabled={disabled || props.highlights.length === 0}>
            Apply {props.highlights.length ? `(${props.highlights.length})` : ''}
          </button>
        </div>
      </section>

      <section className="sidebar-section">
        <div className="section-title">Pages</div>
        <div className="page-tools">
          <input
            value={props.pageEditRanges}
            onChange={(event) => props.onSetPageEditRanges(event.target.value)}
            placeholder="Pages: 2-5, 8"
            disabled={disabled}
          />
          <select
            value={props.rotationDegrees}
            onChange={(event) => props.onSetRotationDegrees(Number(event.target.value))}
            disabled={disabled}
          >
            <option value={90}>90°</option>
            <option value={180}>180°</option>
            <option value={270}>270°</option>
          </select>
          <button onClick={props.onRotatePages} disabled={disabled}>
            <RotateCw size={15} />
            Rotate
          </button>
          <button onClick={props.onDeletePages} disabled={disabled}>
            <Trash2 size={15} />
            Delete
          </button>
        </div>
      </section>

      <section className="sidebar-section">
        <div className="section-title">Split</div>
        <div className="page-tools">
          <input
            value={props.splitRanges}
            onChange={(event) => props.onSetSplitRanges(event.target.value)}
            placeholder="Ranges: 2-5, 8"
            disabled={disabled}
          />
          <button onClick={props.onSplitPdf} disabled={disabled}>
            <Scissors size={15} />
            Split PDF
          </button>
        </div>
      </section>

      <section className="sidebar-section">
        <div className="section-title">Annotate</div>
        <div className="page-tools">
          <input
            value={props.commentText}
            onChange={(event) => props.onSetCommentText(event.target.value)}
            placeholder="Comment"
            disabled={disabled}
          />
          <button onClick={props.onAddComment} disabled={disabled}>
            <MessageSquare size={15} />
            Comment
          </button>
        </div>
        <div className="field-hint">
          {props.commentTarget
            ? `Target P${props.commentTarget.page + 1} · ${Math.round(props.commentTarget.x)},${Math.round(
                props.commentTarget.y,
              )}`
            : 'Click a page to choose comment position.'}
        </div>
      </section>

      <section className="sidebar-section">
        <div className="section-title">Fill & Sign</div>
        <div className="page-tools">
          <textarea
            className="session-notes-input compact-textarea"
            value={props.formValuesJson}
            onChange={(event) => props.onSetFormValuesJson(event.target.value)}
            placeholder='{"field_name": "value"}'
            rows={4}
            disabled={disabled}
          />
          <button onClick={props.onReadFormFields} disabled={disabled}>
            <FileText size={15} />
            Detect fields
          </button>
          <button onClick={props.onFillFormFields} disabled={disabled}>
            <FileText size={15} />
            Fill form
          </button>
          <input
            value={props.signatureText}
            onChange={(event) => props.onSetSignatureText(event.target.value)}
            placeholder="Typed signature"
            disabled={disabled}
          />
          <button onClick={props.onAddTypedSignature} disabled={disabled || !props.commentTarget}>
            <Stamp size={15} />
            Sign here
          </button>
        </div>
        <div className="field-hint">
          Click a page to choose signature position. Typed signatures are visible FreeText annotations, not certificate signatures.
        </div>
      </section>

      <section className="sidebar-section">
        <div className="section-title">Export</div>
        <div className="page-tools">
          <input
            value={props.watermarkText}
            onChange={(event) => props.onSetWatermarkText(event.target.value)}
            placeholder="Watermark text"
            disabled={disabled}
          />
          <button onClick={props.onAddWatermark} disabled={disabled}>
            <Stamp size={15} />
            Watermark
          </button>
          <input
            value={props.encryptPassword}
            onChange={(event) => props.onSetEncryptPassword(event.target.value)}
            placeholder="Password"
            type="password"
            disabled={disabled}
          />
          <button onClick={props.onEncryptPdf} disabled={disabled}>
            <Lock size={15} />
            Encrypt
          </button>
        </div>
      </section>

      <section className="sidebar-section">
        <div className="section-title">Agent Handoff</div>
        <textarea
          className="session-notes-input"
          value={props.sessionNotes}
          onChange={(event) => props.onSetSessionNotes(event.target.value)}
          placeholder="Markdown notes for the handoff..."
          rows={5}
        />
        <button className="workspace-merge-button" onClick={props.onExportNativeAgent} disabled={props.busy}>
          <PackageOpen size={15} />
          Export to Agent
        </button>
        <div className="field-hint">
          Exports handoff.md, notes.md, chat transcript and PDF reference for Claude Code or Codex CLI.
        </div>
      </section>

      <section className="sidebar-section">
        <div className="section-title">Experimental</div>
        <div className="page-tools">
          <input
            value={props.aiBrushInstruction}
            onChange={(event) => props.onSetAiBrushInstruction(event.target.value)}
            placeholder="AI brush instruction"
            disabled={disabled}
          />
          <button onClick={props.onRunAiBrush} disabled={disabled || !props.aiAllowed}>
            <Wand2 size={15} />
            AI Brush
          </button>
        </div>
        <div className="field-hint">AI Brush only runs after AI is enabled for this PDF.</div>
      </section>

      <section className="native-core-note">
        <div className="section-title">Native Core</div>
        <p>{props.nativeCoreStatus ? nativePdfCoreStatusSummary(props.nativeCoreStatus) : 'Checking PDF core...'}</p>
        {props.nativeCoreStatus?.mode !== 'pdf4qt-ready' && (
          <p className="native-core-secondary">
            Current runtime stays on pdf.js/PyMuPDF until the PDF4QT host bridge is available.
          </p>
        )}
      </section>
    </div>
  );
}

interface SkillsPaneProps {
  search: string;
  skills: typeof SPARROW_SKILLS;
  onSearchChange: (value: string) => void;
}

function SkillsPane({ search, skills, onSearchChange }: SkillsPaneProps) {
  return (
    <div className="sidebar-content">
      <section className="sidebar-section">
        <div className="section-title">Local Skill Preview</div>
        <p className="catalog-note">
          Skills shown here are curated ideas and local entries. Future installs stay inside Sparrow's app data
          directory and do not modify Codex, Claude, or other agent skill folders.
        </p>
        <label className="search-field">
          <Search size={15} />
          <input value={search} onChange={(event) => onSearchChange(event.target.value)} placeholder="Search skills" />
        </label>
        <div className="skill-list">
          {skills.map((skill) => {
            const sourceUrl = skill.repositoryUrl ?? skill.homepageUrl;
            return (
              <article key={skill.id} className="skill-card">
                <div className="skill-card-header">
                  <div className="skill-name">{skill.name}</div>
                  <span className={`skill-source ${skill.source}`}>{skill.source}</span>
                </div>
                <p>{skill.description}</p>
                <div className="skill-meta">
                  <span>{skill.author}</span>
                  <span>{skill.license}</span>
                  {sourceUrl && (
                    <a href={sourceUrl} target="_blank" rel="noreferrer">
                      Source
                    </a>
                  )}
                </div>
                <div className="tag-row">
                  {skill.tags.slice(0, 3).map((tag) => (
                    <span key={tag}>{tag}</span>
                  ))}
                </div>
                <div className="skill-install-scope">{skill.installPathHint}</div>
                <button disabled>{skill.installed ? 'Enabled locally' : 'Local install later'}</button>
              </article>
            );
          })}
        </div>
      </section>
    </div>
  );
}

interface PrivacyPaneProps {
  mode: AiPermissionMode;
  aiAllowed: boolean;
  activeDocument: SparrowDocument | null;
  busy: boolean;
  onModeChange: (mode: AiPermissionMode) => void;
  onEnableDocumentAi: () => void;
  onAnalyze: () => void;
}

function PrivacyPane({ mode, aiAllowed, activeDocument, busy, onModeChange, onEnableDocumentAi, onAnalyze }: PrivacyPaneProps) {
  return (
    <div className="sidebar-content">
      <section className="sidebar-section">
        <div className="section-title">AI Permission</div>
        <div className="permission-options">
          <button className={mode === 'manual' ? 'active' : ''} onClick={() => onModeChange('manual')}>
            <Shield size={16} />
            Ask per PDF
          </button>
          <button className={mode === 'always' ? 'active' : ''} onClick={() => onModeChange('always')}>
            <Bot size={16} />
            Always on
          </button>
        </div>
        <p className="privacy-copy">
          默认不会把正文交给 AI，也不会自动分析。你可以先打开文件判断敏感性，再为单份 PDF 开启 AI。
        </p>
        <button className="primary-button" onClick={onEnableDocumentAi} disabled={!activeDocument || aiAllowed}>
          Enable AI for this PDF
        </button>
        <button className="secondary-button" onClick={onAnalyze} disabled={!activeDocument || busy}>
          Analyze document now
        </button>
      </section>
    </div>
  );
}

async function postJson<T>(backendUrl: string, backendToken: string, endpoint: string, body: unknown): Promise<T> {
  const response = await fetch(`${backendUrl}${endpoint}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Inkwell-Token': backendToken },
    body: JSON.stringify(body),
  });
  const json = await response.json().catch(() => null);
  if (!response.ok) {
    const message = (json as { detail?: string } | null)?.detail ?? `HTTP ${response.status}`;
    throw new Error(message);
  }
  return json as T;
}

function fileName(path: string): string {
  return path.split(/[\\/]/).pop() || path;
}

function EmptyState({ onOpen }: { onOpen: () => void }) {
  return (
    <div className="empty-state">
      <SparrowMark size={44} />
      <h2>雀阅 Sparrow</h2>
      <p>Open PDFs, manage a workspace, edit pages and annotations, then enable AI only when the document is safe to share.</p>
      <button className="primary-button" onClick={onOpen}>
        <FileText size={16} />
        Open PDF
      </button>
    </div>
  );
}
