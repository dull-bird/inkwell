import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Bot,
  ChevronRight,
  Crop,
  File,
  FileText,
  FolderOpen,
  Highlighter,
  Image as ImageIcon,
  LayoutPanelLeft,
  Lock,
  MessageSquare,
  Moon,
  PanelRight,
  Puzzle,
  PackageOpen,
  PenLine,
  RotateCw,
  Scissors,
  Search,
  Shield,
  Sparkles,
  Stamp,
  Square,
  Strikethrough,
  Sun,
  Trash2,
  Underline,
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
  buildCropRequest,
  buildCompressRequest,
  buildEncryptRequest,
  buildExportImagesRequest,
  buildExtractImagesRequest,
  buildExtractPagesRequest,
  buildExportTextRequest,
  buildAddAttachmentRequest,
  buildExtractAttachmentsRequest,
  buildHtmlToPdfRequest,
  buildImagesToPdfRequest,
  buildImageSignatureRequest,
  buildFillFormRequest,
  buildFreeTextRequest,
  buildInsertBlankPagesRequest,
  buildInsertImageRequest,
  buildMarkdownToPdfRequest,
  buildRemoveAttachmentsRequest,
  buildResizePagesRequest,
  buildSetOutlineRequest,
  buildShapeRequest,
  buildRedactRequest,
  buildStampRequest,
  buildTextMarkupRequest,
  buildTypedSignatureRequest,
  buildWatermarkRequest,
  describeCompressionOutput,
  describeFileOutput,
  SHAPE_ANNOTATION_KINDS,
  STANDARD_STAMP_KINDS,
  TEXT_EXPORT_FORMATS,
  type ShapeAnnotationKind,
  type StandardStampKind,
  type TextExportFormat,
  type TextMarkupKind,
} from './pdfFileActions';
import { parsePageRanges } from './pdfRanges';
import { buildRemainingPageOrder, buildRotationMap, expandPageRanges } from './pageOperations';
import { pdfPlacementLabel, pdfPlacementPrompt, type PdfPlacementMode } from './pdfPlacementMode';
import { nativePdfCoreStatusSummary, type NativePdfCoreStatus } from '../shared/native-pdf-core';
import {
  DEFAULT_AI_PERMISSION_MODE,
  canAutomaticallyAnalyze,
  getDefaultDocumentAiEnabled,
  isAiAllowed,
  type AiPermissionMode,
} from './privacy';
import { filterSkillCatalog, SPARROW_SKILLS } from './skillCatalog';
import {
  applyOperationsWithNativeBridge,
  clearPreviewWithNativeBridge,
  getCurrentDocumentWithNativeBridge,
  previewAnnotationOperationsWithNativeBridge,
  previewHighlightOperationsWithNativeBridge,
  previewTextQueryMarkupWithNativeBridge,
  type NativeHighlightPreviewResult,
  redoWithNativeBridge,
  undoWithNativeBridge,
} from './pdfOperationBridge';
import { isNativeSidePanelSurface } from './nativeSidePanel';
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

interface CompressResponse extends FileOutputResponse {
  input_bytes: number;
  output_bytes: number;
  saved_bytes: number;
  saved_percent: number;
}

interface TextMarkupResponse extends FileOutputResponse {
  kind: TextMarkupKind;
  query: string;
  count: number;
}

interface RedactResponse extends FileOutputResponse {
  query: string;
  count: number;
  pages: number[];
}

interface ExtractPagesResponse extends FileOutputResponse {
  page_count: number;
}

interface SplitResponse {
  output_dir: string;
  files: string[];
}

interface ExportImagesResponse {
  output_dir: string;
  files: string[];
  page_count: number;
  dpi: number;
}

interface ExtractImagesResponse {
  output_dir: string;
  images: Array<{
    path: string;
    page: number;
    xref: number;
    width: number;
    height: number;
    ext: string;
  }>;
  count: number;
}

interface ExportTextResponse {
  output: string;
  format: TextExportFormat;
  page_count: number;
}

interface OutlineResponse {
  outline: Array<{ level: number; title: string; page: number; x?: number; y?: number }>;
  count: number;
}

interface AttachmentsResponse {
  attachments: Array<{ name: string; filename: string; description: string; size: number }>;
  count: number;
}

interface ExtractAttachmentsResponse {
  output_dir: string;
  files: Array<{ name: string; path: string; size: number }>;
  count: number;
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

interface NativeEditState {
  batchId?: string;
  previewCounts: number[];
  redoPreviewCounts: number[];
  clearUndoPreviewCounts: number[];
  redoClearPreviewCounts: number[];
  undoAvailable: boolean;
  redoAvailable: boolean;
  outputPath?: string;
}

export default function App() {
  const [documents, setDocuments] = useState<SparrowDocument[]>([]);
  const [workspacePaths, setWorkspacePaths] = useState<string[]>([]);
  const [activeDocumentId, setActiveDocumentId] = useState<string | null>(null);
  const [backend, setBackend] = useState<BackendState | null>(null);
  const [nativeCoreStatus, setNativeCoreStatus] = useState<NativePdfCoreStatus | null>(null);
  const [highlightsByDocument, setHighlightsByDocument] = useState<Record<string, HighlightOperation[]>>({});
  const [nativeEditsByDocument, setNativeEditsByDocument] = useState<Record<string, NativeEditState>>({});
  const [commentTargetsByDocument, setCommentTargetsByDocument] = useState<Record<string, CommentTarget>>({});
  const [placementMode, setPlacementMode] = useState<PdfPlacementMode>('none');
  const [undoStack, setUndoStack] = useState<Array<{ documentId: string; operations: HighlightOperation[] }>>([]);
  const [redoStack, setRedoStack] = useState<Array<{ documentId: string; operations: HighlightOperation[] }>>([]);
  const [agentOutput, setAgentOutput] = useState<string | null>(null);
  const [pathOutput, setPathOutput] = useState<{ path: string; label: string } | null>(null);
  const [sessionExportDir, setSessionExportDir] = useState<string | null>(null);
  const [sessionNotes, setSessionNotes] = useState('');
  const [chatTranscript, setChatTranscript] = useState<ChatTranscriptMessage[]>([]);
  const [commentText, setCommentText] = useState('Needs review');
  const [markupText, setMarkupText] = useState('');
  const [redactText, setRedactText] = useState('');
  const [stampKind, setStampKind] = useState<StandardStampKind>('Approved');
  const [shapeKind, setShapeKind] = useState<ShapeAnnotationKind>('rectangle');
  const [shapeDimensions, setShapeDimensions] = useState('160, 90');
  const [imageFilePath, setImageFilePath] = useState('');
  const [imageDimensions, setImageDimensions] = useState('180, 120');
  const [splitRanges, setSplitRanges] = useState('');
  const [pageEditRanges, setPageEditRanges] = useState('');
  const [blankPageInsertAfter, setBlankPageInsertAfter] = useState('');
  const [blankPageCount, setBlankPageCount] = useState('1');
  const [pageSizeText, setPageSizeText] = useState('595, 842');
  const [outlineJson, setOutlineJson] = useState('[]');
  const [attachmentFilePath, setAttachmentFilePath] = useState('');
  const [attachmentName, setAttachmentName] = useState('');
  const [attachmentDescription, setAttachmentDescription] = useState('');
  const [attachmentNames, setAttachmentNames] = useState('');
  const [rotationDegrees, setRotationDegrees] = useState(90);
  const [cropMargins, setCropMargins] = useState('36, 36, 36, 36');
  const [watermarkText, setWatermarkText] = useState('Internal Review');
  const [exportImageDpi, setExportImageDpi] = useState('144');
  const [exportTextFormat, setExportTextFormat] = useState<TextExportFormat>('markdown');
  const [conversionImagePaths, setConversionImagePaths] = useState('');
  const [conversionMarkupTitle, setConversionMarkupTitle] = useState('Converted document');
  const [conversionHtml, setConversionHtml] = useState('<h1>Title</h1><p>Paste HTML here.</p>');
  const [conversionMarkdown, setConversionMarkdown] = useState('# Title\n\nPaste Markdown here.');
  const [conversionPageSize, setConversionPageSize] = useState('595, 842');
  const [conversionMargin, setConversionMargin] = useState('36');
  const [encryptPassword, setEncryptPassword] = useState('');
  const [formValuesJson, setFormValuesJson] = useState('{\n  "applicant_name": ""\n}');
  const [signatureText, setSignatureText] = useState('');
  const [signatureImagePath, setSignatureImagePath] = useState('');
  const [signatureImageDimensions, setSignatureImageDimensions] = useState('180, 60');
  const [aiBrushInstruction, setAiBrushInstruction] = useState('highlight claims that need citations');
  const [skillSearch, setSkillSearch] = useState('');
  const [sidebarView, setSidebarView] = useState<SidebarView>('files');
  const [leftSidebarVisible, setLeftSidebarVisible] = useState(true);
  const [rightSidebarVisible, setRightSidebarVisible] = useState(true);
  const [theme, setTheme] = useState<'light' | 'dark'>('light');
  const [aiPermissionMode, setAiPermissionMode] = useState<AiPermissionMode>(DEFAULT_AI_PERMISSION_MODE);
  const [pendingAgentPrompt, setPendingAgentPrompt] = useState<PendingAgentPrompt | null>(null);
  const [status, setStatus] = useState<string | null>('AI 默认关闭；打开 PDF 会自动做本地文档感知。');
  const [busy, setBusy] = useState(false);
  const nativeSidePanel = isNativeSidePanelSurface();

  const activeDocument = documents.find((document) => document.id === activeDocumentId) ?? null;
  const highlights = activeDocument ? highlightsByDocument[activeDocument.id] ?? [] : [];
  const nativeEditState = activeDocument ? nativeEditsByDocument[activeDocument.id] ?? null : null;
  const nativePreviewCount = nativeEditState?.previewCounts.reduce((total, count) => total + count, 0) ?? 0;
  const undoDisabled = nativeEditState ? !nativeEditState.undoAvailable : undoStack.length === 0;
  const redoDisabled = nativeEditState ? !nativeEditState.redoAvailable : redoStack.length === 0;
  const commentTarget = activeDocument ? commentTargetsByDocument[activeDocument.id] ?? null : null;
  const aiAllowed = activeDocument ? isAiAllowed(aiPermissionMode, activeDocument.aiEnabled) : false;
  const filteredSkills = useMemo(() => filterSkillCatalog(SPARROW_SKILLS, skillSearch), [skillSearch]);

  const beginPlacement = useCallback(
    (mode: PdfPlacementMode) => {
      if (!activeDocument) {
        setStatus('Open a PDF first.');
        return;
      }
      setPlacementMode(mode);
      setCommentTargetsByDocument((current) => {
        const next = { ...current };
        delete next[activeDocument.id];
        return next;
      });
      setStatus(pdfPlacementPrompt(mode));
    },
    [activeDocument],
  );

  const clearPlacementTarget = useCallback((documentId: string) => {
    setPlacementMode('none');
    setCommentTargetsByDocument((current) => {
      const next = { ...current };
      delete next[documentId];
      return next;
    });
  }, []);

  const activeDocumentContext = activeDocument
    ? {
        title: activeDocument.title,
        path: activeDocument.path,
        label: activeDocument.analysis?.label ?? 'PDF',
        summary:
          activeDocument.analysis?.summary ??
          (activeDocument.analysisStatus === 'analyzing' ? '正在本地分析。' : '尚未完成本地分析。'),
      }
    : null;

  const workspaceDocuments = useMemo<WorkspaceDocumentContext[]>(
    () =>
      documents.map((document) => ({
        title: document.title,
        path: document.path,
        label: document.analysis?.label ?? 'PDF',
        summary: document.analysis?.summary ?? (document.analysisStatus === 'analyzing' ? '正在本地分析。' : '尚未完成本地分析。'),
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

  useEffect(() => {
    if (!nativeSidePanel) return;

    let cancelled = false;
    void getCurrentDocumentWithNativeBridge()
      .then((result) => {
        if (cancelled) return;
        if (!result.handled) {
          setStatus('PDF4QT bridge is not available in this panel.');
          return;
        }
        if (!result.document) {
          setStatus('No PDF4QT document is open.');
          return;
        }

        const document: SparrowDocument = {
          id: result.document.id,
          path: result.document.path,
          title: result.document.title,
          status: 'ready',
          pageCount: result.document.pageCount,
          analysisStatus: 'idle',
          aiEnabled: getDefaultDocumentAiEnabled(aiPermissionMode),
        };
        setDocuments((current) => {
          const existingIndex = current.findIndex((item) => item.id === document.id);
          if (existingIndex < 0) return [...current, document];
          return current.map((item) => (item.id === document.id ? { ...item, ...document } : item));
        });
        setWorkspacePaths((current) => normalizeWorkspacePaths([...current, document.path]));
        setHighlightsByDocument((current) => ({ ...current, [document.id]: current[document.id] ?? [] }));
        setActiveDocumentId(document.id);
        setStatus(`Connected to PDF4QT document ${document.title}.`);
      })
      .catch((error) => {
        if (!cancelled) setStatus(error instanceof Error ? error.message : String(error));
      });

    return () => {
      cancelled = true;
    };
  }, [aiPermissionMode, nativeSidePanel]);

  useEffect(() => {
    setPlacementMode('none');
  }, [activeDocumentId]);

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
        setStatus(`已打开 ${document.title}。AI 仍关闭，本地文档感知会自动运行。`);
      } catch (error) {
        setDocumentPatch(document.id, {
          status: 'error',
          error: error instanceof Error ? error.message : String(error),
        });
      }
    },
    [setDocumentPatch],
  );

  const analyzeDocumentLocally = useCallback(
    async (document: SparrowDocument, nextBackend: BackendState, manual = false) => {
      setDocumentPatch(document.id, { analysisStatus: 'analyzing' });
      try {
        const result = await postJson<ExtractTextResponse>(nextBackend.url, nextBackend.token, '/extract-text', {
          path: document.path,
        });
        const text = typeof result.text === 'string' ? result.text : Object.values(result.text).join('\n');
        setDocumentPatch(document.id, { analysisStatus: 'ready', analysis: analyzeDocumentText(text) });
        setStatus(`${manual ? '已重新' : '已自动'}完成 ${document.title} 的本地文档感知。`);
      } catch (error) {
        setDocumentPatch(document.id, {
          analysisStatus: 'error',
          error: error instanceof Error ? error.message : String(error),
        });
        setStatus(error instanceof Error ? error.message : String(error));
      }
    },
    [setDocumentPatch],
  );

  const activateDocument = useCallback(async (document: SparrowDocument, options: { openNativeShell?: boolean } = {}) => {
    setActiveDocumentId(document.id);
    await window.electronAPI.setCurrentFile(document.path);
    if (options.openNativeShell ?? true) {
      try {
        await window.electronAPI.openNativeShell(document.path);
        setStatus(`已在 PDF4QT 中打开 ${document.title}。React 仅保留 agent/workspace side panel。`);
      } catch (error) {
        setStatus(error instanceof Error ? error.message : String(error));
      }
    }
  }, []);

  const loadPdf = useCallback(
    async (path: string, options: { openExistingInNativeShell?: boolean } = {}) => {
      addWorkspacePaths([path]);
      const [backendUrl, backendToken] = await Promise.all([
        window.electronAPI.getBackendUrl(),
        window.electronAPI.getBackendToken(),
      ]);
      const nextBackend = { url: backendUrl, token: backendToken };
      const existing = documents.find((document) => document.path === path);
      setBackend(nextBackend);

      if (existing) {
        await activateDocument(existing, { openNativeShell: options.openExistingInNativeShell ?? true });
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
      setStatus(`正在打开 ${document.title}，随后会自动做本地文档感知。`);
      void loadDocumentInfo(document, nextBackend);
      if (canAutomaticallyAnalyze(aiPermissionMode)) {
        void analyzeDocumentLocally(document, nextBackend);
      }
    },
    [activateDocument, addWorkspacePaths, aiPermissionMode, analyzeDocumentLocally, documents, loadDocumentInfo],
  );

  const handleOpenFile = async () => {
    const path = await window.electronAPI.openPdfFile();
    if (!path) return;
    let nativeShellOpened = false;
    try {
      await window.electronAPI.openNativeShell(path);
      nativeShellOpened = true;
    } catch (error) {
      setStatus(error instanceof Error ? error.message : String(error));
    }
    await loadPdf(path, { openExistingInNativeShell: false });
    if (nativeShellOpened) {
      setStatus(`已在 PDF4QT 中打开 ${fileName(path)}。React 仅保留 agent/workspace side panel。`);
    }
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
    setBusy(true);
    try {
      const nextBackend = backend ?? {
        url: await window.electronAPI.getBackendUrl(),
        token: await window.electronAPI.getBackendToken(),
      };
      await analyzeDocumentLocally(activeDocument, nextBackend, true);
    } finally {
      setBusy(false);
    }
  }, [activeDocument, analyzeDocumentLocally, backend]);

  const enableAiForActiveDocument = useCallback(() => {
    if (!activeDocument) return;
    setDocumentPatch(activeDocument.id, { aiEnabled: true });
    setStatus(`已为 ${activeDocument.title} 开启 AI。`);
    setRightSidebarVisible(true);
  }, [activeDocument, setDocumentPatch]);

  const recordNativePreview = useCallback(
    (documentId: string, nativePreview: NativeHighlightPreviewResult, count: number) => {
      setNativeEditsByDocument((current) => {
        const previous = current[documentId];
        return {
          ...current,
          [documentId]: {
            batchId: nativePreview.batchId,
            previewCounts: [...(previous?.previewCounts ?? []), count],
            redoPreviewCounts: [],
            clearUndoPreviewCounts: [],
            redoClearPreviewCounts: [],
            undoAvailable: nativePreview.undoAvailable ?? true,
            redoAvailable: nativePreview.redoAvailable ?? false,
            outputPath: previous?.outputPath,
          },
        };
      });
    },
    [],
  );

  const addHighlightBatch = useCallback(
    async (batch: HighlightOperation[]) => {
      if (!activeDocument) {
        setStatus('Open a PDF first.');
        return;
      }
      if (batch.length === 0) {
        setStatus('No matching text blocks found.');
        return;
      }
      try {
        const nativePreview = await previewHighlightOperationsWithNativeBridge(batch, {
          documentId: activeDocument.path,
          label: `Agent highlights for ${activeDocument.title}`,
      });
      if (nativePreview.handled) {
        const count = nativePreview.rectCount ?? nativePreview.operationCount ?? batch.length;
        recordNativePreview(activeDocument.id, nativePreview, count);
        setStatus(`已在 PDF4QT 中预览 ${count} 个高亮。`);
        return;
      }
    } catch (error) {
      setStatus(error instanceof Error ? error.message : String(error));
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
  [activeDocument, recordNativePreview],
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

  const undo = useCallback(async () => {
    if (activeDocument && nativeEditState) {
      try {
        const nativeUndo = await undoWithNativeBridge();
        if (nativeUndo.handled) {
          setNativeEditsByDocument((current) => {
            const previous = current[activeDocument.id] ?? nativeEditState;
            const previewCounts = previous.previewCounts.slice();
            const redoPreviewCounts = previous.redoPreviewCounts.slice();
            const clearUndoPreviewCounts = previous.clearUndoPreviewCounts.slice();
            const redoClearPreviewCounts = previous.redoClearPreviewCounts.slice();
            if (clearUndoPreviewCounts.length > 0 && previewCounts.length === 0) {
              previewCounts.push(...clearUndoPreviewCounts);
              redoClearPreviewCounts.splice(0, redoClearPreviewCounts.length, ...clearUndoPreviewCounts);
              clearUndoPreviewCounts.splice(0);
            } else {
              const undoneCount = previewCounts.pop();
              if (undoneCount !== undefined) redoPreviewCounts.push(undoneCount);
            }
            return {
              ...current,
              [activeDocument.id]: {
                ...previous,
                previewCounts,
                redoPreviewCounts,
                clearUndoPreviewCounts,
                redoClearPreviewCounts,
                undoAvailable: nativeUndo.undoAvailable ?? previewCounts.length > 0,
                redoAvailable: nativeUndo.redoAvailable ?? (redoPreviewCounts.length > 0 || redoClearPreviewCounts.length > 0),
              },
            };
          });
          setStatus('已通过 PDF4QT 撤回上一组预览操作。');
          return;
        }
      } catch (error) {
        setStatus(error instanceof Error ? error.message : String(error));
        return;
      }
    }

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
  }, [activeDocument, nativeEditState]);

  const redo = useCallback(async () => {
    if (activeDocument && nativeEditState) {
      try {
        const nativeRedo = await redoWithNativeBridge();
        if (nativeRedo.handled) {
          setNativeEditsByDocument((current) => {
            const previous = current[activeDocument.id] ?? nativeEditState;
            const previewCounts = previous.previewCounts.slice();
            const redoPreviewCounts = previous.redoPreviewCounts.slice();
            const clearUndoPreviewCounts = previous.clearUndoPreviewCounts.slice();
            const redoClearPreviewCounts = previous.redoClearPreviewCounts.slice();
            if (redoClearPreviewCounts.length > 0) {
              previewCounts.splice(0);
              clearUndoPreviewCounts.splice(0, clearUndoPreviewCounts.length, ...redoClearPreviewCounts);
              redoClearPreviewCounts.splice(0);
            } else {
              const redoneCount = redoPreviewCounts.pop();
              if (redoneCount !== undefined) previewCounts.push(redoneCount);
            }
            return {
              ...current,
              [activeDocument.id]: {
                ...previous,
                previewCounts,
                redoPreviewCounts,
                clearUndoPreviewCounts,
                redoClearPreviewCounts,
                undoAvailable: nativeRedo.undoAvailable ?? previewCounts.length > 0,
                redoAvailable: nativeRedo.redoAvailable ?? (redoPreviewCounts.length > 0 || redoClearPreviewCounts.length > 0),
              },
            };
          });
          setStatus('已通过 PDF4QT 恢复上一组预览操作。');
          return;
        }
      } catch (error) {
        setStatus(error instanceof Error ? error.message : String(error));
        return;
      }
    }

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
  }, [activeDocument, nativeEditState]);

  const clearPreview = useCallback(async () => {
    if (!activeDocument || (highlights.length === 0 && nativePreviewCount === 0)) return;

    if (nativeEditState) {
      try {
        const nativeClear = await clearPreviewWithNativeBridge();
        if (nativeClear.handled) {
          setNativeEditsByDocument((current) => {
            const previous = current[activeDocument.id] ?? nativeEditState;
            const clearedCounts = previous.previewCounts.slice();
            return {
              ...current,
              [activeDocument.id]: {
                ...previous,
                previewCounts: [],
                redoPreviewCounts: [],
                clearUndoPreviewCounts: clearedCounts,
                redoClearPreviewCounts: [],
                undoAvailable: nativeClear.undoAvailable ?? true,
                redoAvailable: nativeClear.redoAvailable ?? false,
              },
            };
          });
          const clearedCount = nativeClear.rectCount ?? nativeClear.operationCount ?? nativePreviewCount;
          setStatus(`已通过 PDF4QT 清除 ${clearedCount} 个预览标注。`);
          return;
        }
      } catch (error) {
        setStatus(error instanceof Error ? error.message : String(error));
        return;
      }
    }

    setHighlightsByDocument((current) => ({
      ...current,
      [activeDocument.id]: [],
    }));
    setUndoStack((current) => current.filter((batch) => batch.documentId !== activeDocument.id));
    setRedoStack((current) => current.filter((batch) => batch.documentId !== activeDocument.id));
    setStatus('已清除当前文档的预览标注。');
  }, [activeDocument, highlights.length, nativeEditState, nativePreviewCount]);

  const applyHighlights = useCallback(async () => {
    if (!activeDocument || (highlights.length === 0 && !nativeEditState)) return;
    setBusy(true);
    try {
      if (nativeEditState) {
        const nativeApply = await applyOperationsWithNativeBridge({ batchId: nativeEditState.batchId });
        if (nativeApply.handled) {
          if (nativeApply.outputPath) setAgentOutput(nativeApply.outputPath);
          setNativeEditsByDocument((current) => ({
            ...current,
            [activeDocument.id]: {
              ...nativeEditState,
              previewCounts: [],
              redoPreviewCounts: [],
              clearUndoPreviewCounts: [],
              redoClearPreviewCounts: [],
              undoAvailable: nativeApply.undoAvailable ?? nativeEditState.undoAvailable,
              redoAvailable: nativeApply.redoAvailable ?? nativeEditState.redoAvailable,
              outputPath: nativeApply.outputPath ?? nativeEditState.outputPath,
            },
          }));
          setStatus(nativeApply.outputPath ? `已通过 PDF4QT 保存 ${fileName(nativeApply.outputPath)}` : '已通过 PDF4QT 应用修改。');
          return;
        }
      }

      if (highlights.length === 0) return;
      const result = await backendPost<ApplyResponse>('/apply', { path: activeDocument.path, operations: highlights });
      setAgentOutput(result.output);
      await loadPdf(result.output);
      setStatus(`已保存并打开 ${fileName(result.output)}`);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : String(error));
    } finally {
      setBusy(false);
    }
  }, [activeDocument, backendPost, highlights, loadPdf, nativeEditState]);

  const addComment = useCallback(async () => {
    if (!activeDocument) {
      setStatus('Open a PDF first.');
      return;
    }
    if (!commentTarget || placementMode !== 'comment') {
      beginPlacement('comment');
      return;
    }
    const text = commentText.trim();
    if (!text) {
      setStatus('Comment text cannot be empty.');
      return;
    }
    setBusy(true);
    const documentId = activeDocument.id;
    try {
      const request = {
        path: activeDocument.path,
        page: commentTarget.page,
        x: commentTarget.x,
        y: commentTarget.y,
        text,
        author: 'Sparrow',
      };
      const nativePreview = await previewAnnotationOperationsWithNativeBridge(
        [
          {
            type: 'comment',
            page: request.page,
            x: request.x,
            y: request.y,
            text: request.text,
            author: request.author,
          },
        ],
        {
          documentId: activeDocument.path,
          label: `Comment "${request.text}" in ${activeDocument.title}`,
        },
      );
      if (nativePreview.handled) {
        recordNativePreview(documentId, nativePreview, nativePreview.operationCount ?? 1);
        clearPlacementTarget(documentId);
        setStatus('已在 PDF4QT 中预览批注，可撤回或应用保存。');
        return;
      }
      const result = await backendPost<FileOutputResponse>('/comment', request);
      setAgentOutput(result.output);
      await loadPdf(result.output);
      clearPlacementTarget(documentId);
      setStatus(`已添加批注并打开 ${fileName(result.output)}`);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : String(error));
    } finally {
      setBusy(false);
    }
  }, [
    activeDocument,
    backendPost,
    beginPlacement,
    clearPlacementTarget,
    commentTarget,
    commentText,
    loadPdf,
    placementMode,
    recordNativePreview,
  ]);

  const addFreeText = useCallback(async () => {
    if (!activeDocument) {
      setStatus('Open a PDF first.');
      return;
    }
    if (!commentTarget || placementMode !== 'free-text') {
      beginPlacement('free-text');
      return;
    }
    setBusy(true);
    const documentId = activeDocument.id;
    try {
      const request = buildFreeTextRequest(
        activeDocument.path,
        commentTarget.page,
        commentTarget.x,
        commentTarget.y,
        commentText,
        'Sparrow',
      );
      const nativePreview = await previewAnnotationOperationsWithNativeBridge(
        [
          {
            type: 'freeText',
            page: request.page,
            x: request.x,
            y: request.y,
            text: request.text,
            author: request.author,
          },
        ],
        {
          documentId: activeDocument.path,
          label: `Free text "${request.text}" in ${activeDocument.title}`,
        },
      );
      if (nativePreview.handled) {
        recordNativePreview(documentId, nativePreview, nativePreview.operationCount ?? 1);
        clearPlacementTarget(documentId);
        setStatus('已在 PDF4QT 中预览可见文本标注，可撤回或应用保存。');
        return;
      }
      const result = await backendPost<FileOutputResponse>('/free-text', request);
      setAgentOutput(result.output);
      await loadPdf(result.output);
      clearPlacementTarget(documentId);
      setStatus(describeFileOutput('free-text', result.output));
    } catch (error) {
      setStatus(error instanceof Error ? error.message : String(error));
    } finally {
      setBusy(false);
    }
  }, [
    activeDocument,
    backendPost,
    beginPlacement,
    clearPlacementTarget,
    commentTarget,
    commentText,
    loadPdf,
    placementMode,
    recordNativePreview,
  ]);

  const addStamp = useCallback(async () => {
    if (!activeDocument) {
      setStatus('Open a PDF first.');
      return;
    }
    if (!commentTarget || placementMode !== 'stamp') {
      beginPlacement('stamp');
      return;
    }
    setBusy(true);
    const documentId = activeDocument.id;
    try {
      const request = buildStampRequest(
        activeDocument.path,
        commentTarget.page,
        commentTarget.x,
        commentTarget.y,
        stampKind,
        'Sparrow',
      );
      const nativePreview = await previewAnnotationOperationsWithNativeBridge(
        [
          {
            type: 'stamp',
            page: request.page,
            x: request.x,
            y: request.y,
            stamp: request.stamp,
            author: request.author,
          },
        ],
        {
          documentId: activeDocument.path,
          label: `${request.stamp} stamp in ${activeDocument.title}`,
        },
      );
      if (nativePreview.handled) {
        recordNativePreview(documentId, nativePreview, nativePreview.operationCount ?? 1);
        clearPlacementTarget(documentId);
        setStatus(`已在 PDF4QT 中预览 ${request.stamp} 印章，可撤回或应用保存。`);
        return;
      }
      const result = await backendPost<FileOutputResponse>(
        '/stamp',
        request,
      );
      setAgentOutput(result.output);
      await loadPdf(result.output);
      clearPlacementTarget(documentId);
      setStatus(describeFileOutput('stamp', result.output));
    } catch (error) {
      setStatus(error instanceof Error ? error.message : String(error));
    } finally {
      setBusy(false);
    }
  }, [
    activeDocument,
    backendPost,
    beginPlacement,
    clearPlacementTarget,
    commentTarget,
    loadPdf,
    placementMode,
    recordNativePreview,
    stampKind,
  ]);

  const addShape = useCallback(async () => {
    if (!activeDocument) {
      setStatus('Open a PDF first.');
      return;
    }
    if (!commentTarget || placementMode !== 'shape') {
      beginPlacement('shape');
      return;
    }
    setBusy(true);
    const documentId = activeDocument.id;
    try {
      const request = buildShapeRequest(
        activeDocument.path,
        commentTarget.page,
        commentTarget.x,
        commentTarget.y,
        shapeKind,
        shapeDimensions,
        'Sparrow',
      );
      const nativePreview = await previewAnnotationOperationsWithNativeBridge(
        [
          {
            type: 'shape',
            page: request.page,
            x: request.x,
            y: request.y,
            kind: request.kind,
            width: request.width,
            height: request.height,
            color: request.color,
            strokeWidth: request.stroke_width,
            author: request.author,
          },
        ],
        {
          documentId: activeDocument.path,
          label: `${request.kind} shape in ${activeDocument.title}`,
        },
      );
      if (nativePreview.handled) {
        recordNativePreview(documentId, nativePreview, nativePreview.operationCount ?? 1);
        clearPlacementTarget(documentId);
        setStatus(`已在 PDF4QT 中预览 ${request.kind} 形状标注，可撤回或应用保存。`);
        return;
      }
      const result = await backendPost<FileOutputResponse>('/shape', request);
      setAgentOutput(result.output);
      await loadPdf(result.output);
      clearPlacementTarget(documentId);
      setStatus(describeFileOutput('shape', result.output));
    } catch (error) {
      setStatus(error instanceof Error ? error.message : String(error));
    } finally {
      setBusy(false);
    }
  }, [
    activeDocument,
    backendPost,
    beginPlacement,
    clearPlacementTarget,
    commentTarget,
    loadPdf,
    placementMode,
    recordNativePreview,
    shapeDimensions,
    shapeKind,
  ]);

  const addPdfImage = useCallback(async () => {
    if (!activeDocument) {
      setStatus('Open a PDF first.');
      return;
    }
    if (!commentTarget || placementMode !== 'image') {
      beginPlacement('image');
      return;
    }
  setBusy(true);
  const documentId = activeDocument.id;
  try {
    const request = buildInsertImageRequest(
      activeDocument.path,
      commentTarget.page,
      commentTarget.x,
      commentTarget.y,
      imageFilePath,
      imageDimensions,
    );
    const nativePreview = await previewAnnotationOperationsWithNativeBridge(
      [
        {
          type: 'imageStamp',
          page: request.page,
          x: request.x,
          y: request.y,
          imagePath: request.image_path,
          author: 'Sparrow',
          width: request.width,
          height: request.height,
        },
      ],
      {
        documentId: activeDocument.path,
        label: `Image in ${activeDocument.title}`,
      },
    );
    if (nativePreview.handled) {
      recordNativePreview(documentId, nativePreview, nativePreview.operationCount ?? 1);
      clearPlacementTarget(documentId);
      setStatus('已在 PDF4QT 中预览图片标注，可撤回或应用保存。');
      return;
    }
    const result = await backendPost<FileOutputResponse>(
      '/insert-image',
      request,
    );
      setAgentOutput(result.output);
      await loadPdf(result.output);
      clearPlacementTarget(documentId);
      setStatus(describeFileOutput('insert-image', result.output));
    } catch (error) {
      setStatus(error instanceof Error ? error.message : String(error));
    } finally {
      setBusy(false);
    }
  }, [
    activeDocument,
    backendPost,
    beginPlacement,
    clearPlacementTarget,
    commentTarget,
    imageDimensions,
  imageFilePath,
  loadPdf,
  placementMode,
  recordNativePreview,
]);

  const addTextMarkup = useCallback(
    async (kind: TextMarkupKind) => {
      if (!activeDocument) {
        setStatus('Open a PDF first.');
        return;
      }
      setBusy(true);
    try {
      const request = buildTextMarkupRequest(activeDocument.path, markupText, kind, 'Sparrow');
      const nativePreview = await previewTextQueryMarkupWithNativeBridge(kind, request.query, {
        documentId: activeDocument.path,
        label: `${kind} "${request.query}" in ${activeDocument.title}`,
        color: request.color,
      });
      if (nativePreview.handled) {
        const count = nativePreview.operationCount ?? nativePreview.rectCount ?? 0;
        setNativeEditsByDocument((current) => {
          const previous = current[activeDocument.id];
          return {
            ...current,
            [activeDocument.id]: {
              batchId: nativePreview.batchId,
              previewCounts: [...(previous?.previewCounts ?? []), count],
              redoPreviewCounts: [],
              clearUndoPreviewCounts: [],
              redoClearPreviewCounts: [],
              undoAvailable: nativePreview.undoAvailable ?? true,
              redoAvailable: nativePreview.redoAvailable ?? false,
              outputPath: previous?.outputPath,
            },
          };
        });
        setStatus(`已在 PDF4QT 中预览 ${count} 处 ${kind === 'underline' ? '下划线' : '删除线'}。`);
        return;
      }

      const result = await backendPost<TextMarkupResponse>('/text-markup', request);
      setAgentOutput(result.output);
      await loadPdf(result.output);
      setStatus(`${describeFileOutput(kind, result.output)}，共 ${result.count} 处。`);
      } catch (error) {
        setStatus(error instanceof Error ? error.message : String(error));
      } finally {
        setBusy(false);
      }
    },
    [activeDocument, backendPost, loadPdf, markupText],
  );

  const redactPdfText = useCallback(async () => {
    if (!activeDocument) {
      setStatus('Open a PDF first.');
      return;
  }
  setBusy(true);
  const documentId = activeDocument.id;
  try {
    let pageIndices: number[] | undefined;
    if (pageEditRanges.trim()) {
      if (!activeDocument.pageCount) throw new Error('Page count is not ready yet.');
      const pageRanges = parsePageRanges(pageEditRanges);
      pageIndices = pageRanges ? expandPageRanges(activeDocument.pageCount, pageRanges) : undefined;
    }
    const request = buildRedactRequest(activeDocument.path, redactText, pageIndices);
    const nativePreview = await previewAnnotationOperationsWithNativeBridge(
      [{ type: 'redact', query: request.query, pageIndices: request.page_indices, author: 'Sparrow' }],
      {
        documentId: activeDocument.path,
        label: `Redact "${request.query}" in ${activeDocument.title}`,
      },
    );
    if (nativePreview.handled) {
      recordNativePreview(documentId, nativePreview, nativePreview.operationCount ?? 1);
      const pages = pageIndices?.length ? `，限定 ${pageIndices.length} 页` : '';
      setStatus(`已在 PDF4QT 中标记涂黑区域${pages}，应用保存时将生成真正移除内容的 PDF。`);
      return;
    }

    const result = await backendPost<RedactResponse>(
      '/redact',
      request,
    );
      setAgentOutput(result.output);
      await loadPdf(result.output);
      const pages = result.pages.length ? `，涉及 ${result.pages.length} 页` : '';
      setStatus(`${describeFileOutput('redact', result.output)}，共 ${result.count} 处${pages}。`);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : String(error));
    } finally {
      setBusy(false);
    }
}, [activeDocument, backendPost, loadPdf, pageEditRanges, recordNativePreview, redactText]);

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
      setPathOutput({ path: result.output_dir, label: 'Open split folder' });
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

  const extractPages = useCallback(async () => {
    if (!activeDocument?.pageCount) {
      setStatus('Page count is not ready yet.');
      return;
    }
    if (!pageEditRanges.trim()) {
      setStatus('Enter page ranges to extract, for example 2-5, 8.');
      return;
    }
    setBusy(true);
    try {
      const pageRanges = parsePageRanges(pageEditRanges);
      if (!pageRanges) throw new Error('Enter page ranges to extract.');
      const pageIndices = expandPageRanges(activeDocument.pageCount, pageRanges);
      const result = await backendPost<ExtractPagesResponse>(
        '/extract-pages',
        buildExtractPagesRequest(activeDocument.path, pageIndices),
      );
      setAgentOutput(result.output);
      await loadPdf(result.output);
      setStatus(`${describeFileOutput('extract', result.output)}，共 ${result.page_count} 页。`);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : String(error));
    } finally {
      setBusy(false);
    }
  }, [activeDocument, backendPost, loadPdf, pageEditRanges]);

  const insertBlankPages = useCallback(async () => {
    if (!activeDocument?.pageCount) {
      setStatus('Page count is not ready yet.');
      return;
    }
    setBusy(true);
    try {
      const result = await backendPost<ExtractPagesResponse>(
        '/insert-blank-pages',
        buildInsertBlankPagesRequest(
          activeDocument.path,
          blankPageInsertAfter,
          blankPageCount,
          activeDocument.pageCount,
          pageSizeText,
        ),
      );
      setAgentOutput(result.output);
      await loadPdf(result.output);
      setStatus(`${describeFileOutput('insert-blank-pages', result.output)}，共插入 ${result.page_count} 页。`);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : String(error));
    } finally {
      setBusy(false);
    }
  }, [activeDocument, backendPost, blankPageCount, blankPageInsertAfter, loadPdf, pageSizeText]);

  const cropPages = useCallback(async () => {
    if (!activeDocument?.pageCount) {
      setStatus('Page count is not ready yet.');
      return;
    }
    setBusy(true);
    try {
      const pageRanges = parsePageRanges(pageEditRanges);
      const pageIndices = pageRanges ? expandPageRanges(activeDocument.pageCount, pageRanges) : undefined;
      const result = await backendPost<FileOutputResponse>(
        '/crop',
        buildCropRequest(activeDocument.path, cropMargins, pageIndices),
      );
      setAgentOutput(result.output);
      await loadPdf(result.output);
      setStatus(describeFileOutput('crop', result.output));
    } catch (error) {
      setStatus(error instanceof Error ? error.message : String(error));
    } finally {
      setBusy(false);
    }
  }, [activeDocument, backendPost, cropMargins, loadPdf, pageEditRanges]);

  const resizePages = useCallback(async () => {
    if (!activeDocument?.pageCount) {
      setStatus('Page count is not ready yet.');
      return;
    }
    setBusy(true);
    try {
      const pageRanges = parsePageRanges(pageEditRanges);
      const pageIndices = pageRanges ? expandPageRanges(activeDocument.pageCount, pageRanges) : undefined;
      const result = await backendPost<FileOutputResponse>(
        '/resize-pages',
        buildResizePagesRequest(activeDocument.path, pageSizeText, pageIndices),
      );
      setAgentOutput(result.output);
      await loadPdf(result.output);
      setStatus(describeFileOutput('resize-pages', result.output));
    } catch (error) {
      setStatus(error instanceof Error ? error.message : String(error));
    } finally {
      setBusy(false);
    }
  }, [activeDocument, backendPost, loadPdf, pageEditRanges, pageSizeText]);

  const readOutline = useCallback(async () => {
    if (!activeDocument) {
      setStatus('Open a PDF first.');
      return;
    }
    setBusy(true);
    try {
      const result = await backendPost<OutlineResponse>('/outline', { path: activeDocument.path });
      setOutlineJson(JSON.stringify(result.outline, null, 2));
      setStatus(`检测到 ${result.count} 个书签/大纲项。`);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : String(error));
    } finally {
      setBusy(false);
    }
  }, [activeDocument, backendPost]);

  const setOutline = useCallback(async () => {
    if (!activeDocument?.pageCount) {
      setStatus('Page count is not ready yet.');
      return;
    }
    setBusy(true);
    try {
      const result = await backendPost<FileOutputResponse>(
        '/set-outline',
        buildSetOutlineRequest(activeDocument.path, outlineJson, activeDocument.pageCount),
      );
      setAgentOutput(result.output);
      await loadPdf(result.output);
      setStatus(describeFileOutput('set-outline', result.output));
    } catch (error) {
      setStatus(error instanceof Error ? error.message : String(error));
    } finally {
      setBusy(false);
    }
  }, [activeDocument, backendPost, loadPdf, outlineJson]);

  const listAttachments = useCallback(async () => {
    if (!activeDocument) {
      setStatus('Open a PDF first.');
      return;
    }
    setBusy(true);
    try {
      const result = await backendPost<AttachmentsResponse>('/attachments', { path: activeDocument.path });
      setAttachmentNames(result.attachments.map((attachment) => attachment.name).join('\n'));
      setStatus(`检测到 ${result.count} 个 PDF 附件。`);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : String(error));
    } finally {
      setBusy(false);
    }
  }, [activeDocument, backendPost]);

  const addAttachment = useCallback(async () => {
    if (!activeDocument) {
      setStatus('Open a PDF first.');
      return;
    }
    setBusy(true);
    try {
      const result = await backendPost<FileOutputResponse>(
        '/add-attachment',
        buildAddAttachmentRequest(activeDocument.path, attachmentFilePath, attachmentName, attachmentDescription),
      );
      setAgentOutput(result.output);
      await loadPdf(result.output);
      setStatus(describeFileOutput('add-attachment', result.output));
    } catch (error) {
      setStatus(error instanceof Error ? error.message : String(error));
    } finally {
      setBusy(false);
    }
  }, [activeDocument, attachmentDescription, attachmentFilePath, attachmentName, backendPost, loadPdf]);

  const extractAttachments = useCallback(async () => {
    if (!activeDocument) {
      setStatus('Open a PDF first.');
      return;
    }
    setBusy(true);
    try {
      const result = await backendPost<ExtractAttachmentsResponse>(
        '/extract-attachments',
        buildExtractAttachmentsRequest(activeDocument.path, attachmentNames),
      );
      setAgentOutput(null);
      setPathOutput({ path: result.output_dir, label: 'Open attachments folder' });
      setStatus(`已提取 ${result.count} 个附件到 ${result.output_dir}。`);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : String(error));
    } finally {
      setBusy(false);
    }
  }, [activeDocument, attachmentNames, backendPost]);

  const removeAttachments = useCallback(async () => {
    if (!activeDocument) {
      setStatus('Open a PDF first.');
      return;
    }
    setBusy(true);
    try {
      const result = await backendPost<FileOutputResponse>(
        '/remove-attachments',
        buildRemoveAttachmentsRequest(activeDocument.path, attachmentNames),
      );
      setAgentOutput(result.output);
      await loadPdf(result.output);
      setStatus(describeFileOutput('remove-attachments', result.output));
    } catch (error) {
      setStatus(error instanceof Error ? error.message : String(error));
    } finally {
      setBusy(false);
    }
  }, [activeDocument, attachmentNames, backendPost, loadPdf]);

  const addWatermark = useCallback(async () => {
    if (!activeDocument) {
      setStatus('Open a PDF first.');
      return;
    }
    setBusy(true);
    const documentId = activeDocument.id;
    try {
      const request = buildWatermarkRequest(activeDocument.path, watermarkText);
      const nativePreview = await previewAnnotationOperationsWithNativeBridge(
        [{ type: 'watermark', text: request.text, author: 'Sparrow', opacity: 0.16 }],
        {
          documentId: activeDocument.path,
          label: `Watermark "${request.text}" in ${activeDocument.title}`,
        },
      );
      if (nativePreview.handled) {
        recordNativePreview(documentId, nativePreview, nativePreview.operationCount ?? 1);
        setStatus('已在 PDF4QT 中预览水印，可撤回或应用保存。');
        return;
      }

      const result = await backendPost<FileOutputResponse>(
        '/watermark',
        request,
      );
      setAgentOutput(result.output);
      await loadPdf(result.output);
      setStatus(describeFileOutput('watermark', result.output));
    } catch (error) {
      setStatus(error instanceof Error ? error.message : String(error));
    } finally {
      setBusy(false);
    }
  }, [activeDocument, backendPost, loadPdf, recordNativePreview, watermarkText]);

  const compressPdf = useCallback(async () => {
    if (!activeDocument) {
      setStatus('Open a PDF first.');
      return;
    }
    setBusy(true);
    try {
      const result = await backendPost<CompressResponse>('/compress', buildCompressRequest(activeDocument.path));
      setAgentOutput(result.output);
      await loadPdf(result.output);
      setStatus(describeCompressionOutput(result.output, result.saved_bytes, result.saved_percent));
    } catch (error) {
      setStatus(error instanceof Error ? error.message : String(error));
    } finally {
      setBusy(false);
    }
  }, [activeDocument, backendPost, loadPdf]);

  const exportImages = useCallback(async () => {
    if (!activeDocument?.pageCount) {
      setStatus('Page count is not ready yet.');
      return;
    }
    setBusy(true);
    try {
      const pageRanges = parsePageRanges(pageEditRanges);
      const pageIndices = pageRanges ? expandPageRanges(activeDocument.pageCount, pageRanges) : undefined;
      const result = await backendPost<ExportImagesResponse>(
        '/export-images',
        buildExportImagesRequest(activeDocument.path, exportImageDpi, pageIndices),
      );
      setAgentOutput(null);
      setPathOutput({ path: result.output_dir, label: 'Open image folder' });
      setStatus(`已导出 ${result.page_count} 张 PNG 图片到 ${result.output_dir}（${result.dpi} DPI）。`);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : String(error));
    } finally {
      setBusy(false);
    }
  }, [activeDocument, backendPost, exportImageDpi, pageEditRanges]);

  const extractImages = useCallback(async () => {
    if (!activeDocument?.pageCount) {
      setStatus('Page count is not ready yet.');
      return;
    }
    setBusy(true);
    try {
      const pageRanges = parsePageRanges(pageEditRanges);
      const pageIndices = pageRanges ? expandPageRanges(activeDocument.pageCount, pageRanges) : undefined;
      const result = await backendPost<ExtractImagesResponse>(
        '/extract-images',
        buildExtractImagesRequest(activeDocument.path, pageIndices),
      );
      setAgentOutput(null);
      setPathOutput({ path: result.output_dir, label: 'Open extracted images' });
      setStatus(
        result.count > 0
          ? `已提取 ${result.count} 张内嵌图片到 ${result.output_dir}。`
          : `未找到内嵌图片，已检查并创建输出目录：${result.output_dir}`,
      );
    } catch (error) {
      setStatus(error instanceof Error ? error.message : String(error));
    } finally {
      setBusy(false);
    }
  }, [activeDocument, backendPost, pageEditRanges]);

  const exportText = useCallback(async () => {
    if (!activeDocument?.pageCount) {
      setStatus('Page count is not ready yet.');
      return;
    }
    setBusy(true);
    try {
      const pageRanges = parsePageRanges(pageEditRanges);
      const pageIndices = pageRanges ? expandPageRanges(activeDocument.pageCount, pageRanges) : undefined;
      const result = await backendPost<ExportTextResponse>(
        '/export-text',
        buildExportTextRequest(activeDocument.path, exportTextFormat, pageIndices),
      );
      setAgentOutput(null);
      setPathOutput({
        path: result.output,
        label: result.format === 'markdown' ? 'Open Markdown export' : 'Open text export',
      });
      setStatus(`已导出 ${result.page_count} 页为 ${result.format === 'markdown' ? 'Markdown' : 'TXT'}：${result.output}`);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : String(error));
    } finally {
      setBusy(false);
    }
  }, [activeDocument, backendPost, exportTextFormat, pageEditRanges]);

  const convertImagesToPdf = useCallback(async () => {
    setBusy(true);
    try {
      const result = await backendPost<ExtractPagesResponse>(
        '/images-to-pdf',
        buildImagesToPdfRequest(conversionImagePaths, conversionPageSize, conversionMargin),
      );
      setAgentOutput(result.output);
      await loadPdf(result.output);
      setStatus(`${describeFileOutput('images-to-pdf', result.output)}，共 ${result.page_count} 页。`);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : String(error));
    } finally {
      setBusy(false);
    }
  }, [backendPost, conversionImagePaths, conversionMargin, conversionPageSize, loadPdf]);

  const convertHtmlToPdf = useCallback(async () => {
    setBusy(true);
    try {
      const result = await backendPost<ExtractPagesResponse>(
        '/html-to-pdf',
        buildHtmlToPdfRequest(conversionHtml, conversionMarkupTitle, conversionPageSize, conversionMargin),
      );
      setAgentOutput(result.output);
      await loadPdf(result.output);
      setStatus(`${describeFileOutput('html-to-pdf', result.output)}，共 ${result.page_count} 页。`);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : String(error));
    } finally {
      setBusy(false);
    }
  }, [backendPost, conversionHtml, conversionMargin, conversionMarkupTitle, conversionPageSize, loadPdf]);

  const convertMarkdownToPdf = useCallback(async () => {
    setBusy(true);
    try {
      const result = await backendPost<ExtractPagesResponse>(
        '/markdown-to-pdf',
        buildMarkdownToPdfRequest(conversionMarkdown, conversionMarkupTitle, conversionPageSize, conversionMargin),
      );
      setAgentOutput(result.output);
      await loadPdf(result.output);
      setStatus(`${describeFileOutput('markdown-to-pdf', result.output)}，共 ${result.page_count} 页。`);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : String(error));
    } finally {
      setBusy(false);
    }
  }, [backendPost, conversionMarkdown, conversionMargin, conversionMarkupTitle, conversionPageSize, loadPdf]);

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
    if (!commentTarget || placementMode !== 'signature') {
      beginPlacement('signature');
      return;
    }
    setBusy(true);
    const documentId = activeDocument.id;
    try {
      const request = buildTypedSignatureRequest(
        activeDocument.path,
        commentTarget.page,
        commentTarget.x,
        commentTarget.y,
        signatureText,
      );
      const nativePreview = await previewAnnotationOperationsWithNativeBridge(
        [
          {
            type: 'freeText',
            page: request.page,
            x: request.x,
            y: request.y,
            text: request.text,
            author: request.signer,
            width: 180,
            height: 40,
          },
        ],
        {
          documentId: activeDocument.path,
          label: `Typed signature "${request.text}" in ${activeDocument.title}`,
        },
      );
      if (nativePreview.handled) {
        recordNativePreview(documentId, nativePreview, nativePreview.operationCount ?? 1);
        clearPlacementTarget(documentId);
        setStatus('已在 PDF4QT 中预览签名文本，可撤回或应用保存。');
        return;
      }
      const result = await backendPost<FileOutputResponse>('/signature', request);
      setAgentOutput(result.output);
      await loadPdf(result.output);
      clearPlacementTarget(documentId);
      setStatus(describeFileOutput('signature', result.output));
    } catch (error) {
      setStatus(error instanceof Error ? error.message : String(error));
    } finally {
      setBusy(false);
    }
  }, [
    activeDocument,
    backendPost,
    beginPlacement,
    clearPlacementTarget,
    commentTarget,
    loadPdf,
    placementMode,
    recordNativePreview,
    signatureText,
  ]);

  const addImageSignature = useCallback(async () => {
    if (!activeDocument) {
      setStatus('Open a PDF first.');
      return;
    }
    if (!commentTarget || placementMode !== 'image-signature') {
      beginPlacement('image-signature');
      return;
    }
  setBusy(true);
  const documentId = activeDocument.id;
  try {
    const request = buildImageSignatureRequest(
      activeDocument.path,
      commentTarget.page,
      commentTarget.x,
      commentTarget.y,
      signatureImagePath,
      signatureImageDimensions,
      signatureText || 'Sparrow',
    );
    const nativePreview = await previewAnnotationOperationsWithNativeBridge(
      [
        {
          type: 'imageStamp',
          page: request.page,
          x: request.x,
          y: request.y,
          imagePath: request.image_path,
          author: request.signer,
          width: request.width,
          height: request.height,
        },
      ],
      {
        documentId: activeDocument.path,
        label: `Image signature in ${activeDocument.title}`,
      },
    );
    if (nativePreview.handled) {
      recordNativePreview(documentId, nativePreview, nativePreview.operationCount ?? 1);
      clearPlacementTarget(documentId);
      setStatus('已在 PDF4QT 中预览图片签名，可撤回或应用保存。');
      return;
    }
    const result = await backendPost<FileOutputResponse>(
      '/image-signature',
      request,
    );
      setAgentOutput(result.output);
      await loadPdf(result.output);
      clearPlacementTarget(documentId);
      setStatus(describeFileOutput('image-signature', result.output));
    } catch (error) {
      setStatus(error instanceof Error ? error.message : String(error));
    } finally {
      setBusy(false);
    }
  }, [
    activeDocument,
    backendPost,
    beginPlacement,
    clearPlacementTarget,
    commentTarget,
    loadPdf,
  placementMode,
  recordNativePreview,
  signatureImageDimensions,
  signatureImagePath,
    signatureText,
  ]);

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
    setPathOutput(null);
    setStatus(`Agent produced ${fileName(path)}`);
  }, []);

  const handleSplitOutput = useCallback((outputDir: string, fileCount: number) => {
    setAgentOutput(null);
    setPathOutput({ path: outputDir, label: 'Open split folder' });
    setStatus(`Agent split into ${fileCount} PDFs at ${outputDir}`);
  }, []);

  const handleFolderOutput = useCallback((outputDir: string, label: string, fileCount: number) => {
    setAgentOutput(null);
    setPathOutput({ path: outputDir, label });
    setStatus(`Agent produced ${fileCount} files at ${outputDir}`);
  }, []);

  const handlePathOutput = useCallback((path: string, label: string) => {
    setAgentOutput(null);
    setPathOutput({ path, label });
    setStatus(`Agent produced ${fileName(path)}`);
  }, []);

  const activityItems: Array<{ id: SidebarView; label: string; icon: typeof FileText }> = [
    { id: 'files', label: 'Files', icon: FileText },
    { id: 'tools', label: 'Tools', icon: Highlighter },
    { id: 'skills', label: 'Skills', icon: Puzzle },
    { id: 'privacy', label: 'Privacy', icon: Shield },
  ];

  if (nativeSidePanel) {
    return (
      <ErrorBoundary>
        <div className="native-agent-panel-shell" data-theme={theme}>
          <NativeSidePanelControls
            activeDocument={activeDocument}
            aiAllowed={aiAllowed}
            busy={busy}
            nativeCoreStatus={nativeCoreStatus}
            nativePreviewCount={nativePreviewCount}
            status={status}
            undoDisabled={undoDisabled}
            redoDisabled={redoDisabled}
            onEnableAi={enableAiForActiveDocument}
            onHighlightHeadings={highlightHeadings}
            onUndo={undo}
            onRedo={redo}
            onClearPreview={clearPreview}
            onApplyHighlights={applyHighlights}
            onExportNativeAgent={exportNativeAgentSession}
          />
          <ChatPanel
            activeDocumentTitle={activeDocument?.title ?? null}
            activeDocumentContext={activeDocumentContext}
            analysis={activeDocument?.analysis ?? null}
            analysisStatus={activeDocument?.analysisStatus ?? 'idle'}
            workspaceDocuments={workspaceDocuments}
            aiEnabled={aiAllowed}
            privacyMode={aiPermissionMode}
            onPrivacyModeChange={setAiPermissionMode}
            externalPrompt={pendingAgentPrompt}
            onExternalPromptConsumed={(id) => {
              setPendingAgentPrompt((current) => (current?.id === id ? null : current));
            }}
            onEnableAi={enableAiForActiveDocument}
            onAnalyzeDocument={analyzeActiveDocument}
            onFileOutput={handleFileOutput}
            onSplitOutput={handleSplitOutput}
            onFolderOutput={handleFolderOutput}
            onPathOutput={handlePathOutput}
            onPreviewHighlights={addHighlightBatch}
            onTranscriptChange={setChatTranscript}
          />
        </div>
      </ErrorBoundary>
    );
  }

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
                  nativePreviewCount={nativePreviewCount}
                  undoDisabled={undoDisabled}
                  redoDisabled={redoDisabled}
                  pageEditRanges={pageEditRanges}
                  blankPageInsertAfter={blankPageInsertAfter}
                  blankPageCount={blankPageCount}
                  pageSizeText={pageSizeText}
                  outlineJson={outlineJson}
                  attachmentFilePath={attachmentFilePath}
                  attachmentName={attachmentName}
                  attachmentDescription={attachmentDescription}
                  attachmentNames={attachmentNames}
                  rotationDegrees={rotationDegrees}
                  cropMargins={cropMargins}
                  splitRanges={splitRanges}
                  commentText={commentText}
                  markupText={markupText}
                  stampKind={stampKind}
                  commentTarget={commentTarget}
                  placementMode={placementMode}
                  imageFilePath={imageFilePath}
                  imageDimensions={imageDimensions}
                  watermarkText={watermarkText}
                  encryptPassword={encryptPassword}
                  formValuesJson={formValuesJson}
                  signatureText={signatureText}
                  signatureImagePath={signatureImagePath}
                  signatureImageDimensions={signatureImageDimensions}
                  aiBrushInstruction={aiBrushInstruction}
                  sessionNotes={sessionNotes}
                  nativeCoreStatus={nativeCoreStatus}
                  aiAllowed={aiAllowed}
                  onAnalyze={analyzeActiveDocument}
                  onHighlightHeadings={highlightHeadings}
                  onUndo={undo}
                  onRedo={redo}
                  onClearPreview={clearPreview}
                  onApplyHighlights={applyHighlights}
                  onSetPageEditRanges={setPageEditRanges}
                  onSetBlankPageInsertAfter={setBlankPageInsertAfter}
                  onSetBlankPageCount={setBlankPageCount}
                  onSetPageSizeText={setPageSizeText}
                  onInsertBlankPages={insertBlankPages}
                  onResizePages={resizePages}
                  onSetOutlineJson={setOutlineJson}
                  onReadOutline={readOutline}
                  onSetOutline={setOutline}
                  onSetAttachmentFilePath={setAttachmentFilePath}
                  onSetAttachmentName={setAttachmentName}
                  onSetAttachmentDescription={setAttachmentDescription}
                  onSetAttachmentNames={setAttachmentNames}
                  onListAttachments={listAttachments}
                  onAddAttachment={addAttachment}
                  onExtractAttachments={extractAttachments}
                  onRemoveAttachments={removeAttachments}
                  onSetRotationDegrees={setRotationDegrees}
                  onRotatePages={rotatePages}
                  onDeletePages={deletePages}
                  onExtractPages={extractPages}
                  onSetCropMargins={setCropMargins}
                  onCropPages={cropPages}
                  onSetSplitRanges={setSplitRanges}
                  onSplitPdf={splitPdf}
                  onSetCommentText={setCommentText}
                  onAddComment={addComment}
                  onAddFreeText={addFreeText}
                  onSetMarkupText={setMarkupText}
                  onAddTextMarkup={addTextMarkup}
                  redactText={redactText}
                  onSetRedactText={setRedactText}
                  onRedactText={redactPdfText}
                  onSetStampKind={setStampKind}
                  onAddStamp={addStamp}
                  shapeKind={shapeKind}
                  shapeDimensions={shapeDimensions}
                  onSetShapeKind={setShapeKind}
                  onSetShapeDimensions={setShapeDimensions}
                  onAddShape={addShape}
                  onSetImageFilePath={setImageFilePath}
                  onSetImageDimensions={setImageDimensions}
                  onAddPdfImage={addPdfImage}
                  onSetWatermarkText={setWatermarkText}
                  onAddWatermark={addWatermark}
                  onCompressPdf={compressPdf}
                  exportImageDpi={exportImageDpi}
                  conversionImagePaths={conversionImagePaths}
                  conversionMarkupTitle={conversionMarkupTitle}
                  conversionHtml={conversionHtml}
                  conversionMarkdown={conversionMarkdown}
                  conversionPageSize={conversionPageSize}
                  conversionMargin={conversionMargin}
                  onSetExportImageDpi={setExportImageDpi}
                  onExportImages={exportImages}
                  onExtractImages={extractImages}
                  exportTextFormat={exportTextFormat}
                  onSetExportTextFormat={setExportTextFormat}
                  onExportText={exportText}
                  onSetConversionImagePaths={setConversionImagePaths}
                  onSetConversionMarkupTitle={setConversionMarkupTitle}
                  onSetConversionHtml={setConversionHtml}
                  onSetConversionMarkdown={setConversionMarkdown}
                  onSetConversionPageSize={setConversionPageSize}
                  onSetConversionMargin={setConversionMargin}
                  onConvertImagesToPdf={convertImagesToPdf}
                  onConvertHtmlToPdf={convertHtmlToPdf}
                  onConvertMarkdownToPdf={convertMarkdownToPdf}
                  onSetEncryptPassword={setEncryptPassword}
                  onEncryptPdf={encryptPdf}
                  onReadFormFields={readFormFields}
                  onSetFormValuesJson={setFormValuesJson}
                  onFillFormFields={fillFormFields}
                  onSetSignatureText={setSignatureText}
                  onAddTypedSignature={addTypedSignature}
                  onSetSignatureImagePath={setSignatureImagePath}
                  onSetSignatureImageDimensions={setSignatureImageDimensions}
                  onAddImageSignature={addImageSignature}
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
              {pathOutput && !agentOutput && (
                <button className="ghost-button" onClick={() => void openOutputPath(pathOutput.path)}>
                  {pathOutput.label}
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
          {activeDocument ? (
            <PdfViewer path={activeDocument.path} />
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
              onPrivacyModeChange={setAiPermissionMode}
              externalPrompt={pendingAgentPrompt}
              onExternalPromptConsumed={(id) => {
                setPendingAgentPrompt((current) => (current?.id === id ? null : current));
              }}
              onEnableAi={enableAiForActiveDocument}
              onAnalyzeDocument={analyzeActiveDocument}
              onFileOutput={handleFileOutput}
              onSplitOutput={handleSplitOutput}
              onFolderOutput={handleFolderOutput}
              onPathOutput={handlePathOutput}
              onPreviewHighlights={addHighlightBatch}
              onTranscriptChange={setChatTranscript}
              />
          )}
        </div>
      </div>
    </ErrorBoundary>
  );
}

interface NativeSidePanelControlsProps {
  activeDocument: SparrowDocument | null;
  aiAllowed: boolean;
  busy: boolean;
  nativeCoreStatus: NativePdfCoreStatus | null;
  nativePreviewCount: number;
  status: string | null;
  undoDisabled: boolean;
  redoDisabled: boolean;
  onEnableAi: () => void;
  onHighlightHeadings: () => void;
  onUndo: () => void;
  onRedo: () => void;
  onClearPreview: () => void;
  onApplyHighlights: () => void;
  onExportNativeAgent: () => void;
}

function NativeSidePanelControls(props: NativeSidePanelControlsProps) {
  const disabled = !props.activeDocument || props.busy;
  const nativeStatus = props.nativeCoreStatus ? nativePdfCoreStatusSummary(props.nativeCoreStatus) : 'PDF4QT shell';

  return (
    <section className="native-side-panel-controls">
      <div className="native-panel-document">
        <div className="section-title">PDF4QT Document</div>
        <h2>{props.activeDocument?.title ?? 'No PDF open'}</h2>
        <p>{props.activeDocument?.path ?? 'Open a PDF in the native shell.'}</p>
        {props.activeDocument?.pageCount ? <span>{props.activeDocument.pageCount} pages</span> : null}
      </div>

      <div className="native-panel-status">
        <span className={`privacy-pill ${props.aiAllowed ? 'enabled' : ''}`}>
          {props.aiAllowed ? 'AI enabled' : 'AI off'}
        </span>
        <span>{nativeStatus}</span>
      </div>

      <div className="native-panel-actions">
        <button onClick={props.onEnableAi} disabled={!props.activeDocument || props.aiAllowed || props.busy}>
          Enable AI
        </button>
        <button onClick={props.onHighlightHeadings} disabled={disabled}>
          <Highlighter size={15} /> AI Headings
        </button>
        <button onClick={props.onUndo} disabled={props.undoDisabled || props.busy}>
          Undo
        </button>
        <button onClick={props.onRedo} disabled={props.redoDisabled || props.busy}>
          Redo
        </button>
        <button onClick={props.onClearPreview} disabled={disabled || props.nativePreviewCount === 0}>
          Clear {props.nativePreviewCount ? `(${props.nativePreviewCount})` : ''}
        </button>
        <button onClick={props.onApplyHighlights} disabled={disabled || props.nativePreviewCount === 0}>
          Apply {props.nativePreviewCount ? `(${props.nativePreviewCount})` : ''}
        </button>
        <button onClick={props.onExportNativeAgent} disabled={disabled}>
          Export handoff
        </button>
      </div>

      {props.status ? <div className="native-panel-message">{props.status}</div> : null}
    </section>
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
  nativePreviewCount: number;
  undoDisabled: boolean;
  redoDisabled: boolean;
  pageEditRanges: string;
  blankPageInsertAfter: string;
  blankPageCount: string;
  pageSizeText: string;
  outlineJson: string;
  attachmentFilePath: string;
  attachmentName: string;
  attachmentDescription: string;
  attachmentNames: string;
  rotationDegrees: number;
  cropMargins: string;
  splitRanges: string;
  commentText: string;
  markupText: string;
  redactText: string;
  stampKind: StandardStampKind;
  shapeKind: ShapeAnnotationKind;
  shapeDimensions: string;
  imageFilePath: string;
  imageDimensions: string;
  commentTarget: CommentTarget | null;
  placementMode: PdfPlacementMode;
  watermarkText: string;
  exportImageDpi: string;
  exportTextFormat: TextExportFormat;
  conversionImagePaths: string;
  conversionMarkupTitle: string;
  conversionHtml: string;
  conversionMarkdown: string;
  conversionPageSize: string;
  conversionMargin: string;
  encryptPassword: string;
  formValuesJson: string;
  signatureText: string;
  signatureImagePath: string;
  signatureImageDimensions: string;
  aiBrushInstruction: string;
  sessionNotes: string;
  nativeCoreStatus: NativePdfCoreStatus | null;
  aiAllowed: boolean;
  onAnalyze: () => void;
  onHighlightHeadings: () => void;
  onUndo: () => void;
  onRedo: () => void;
  onClearPreview: () => void;
  onApplyHighlights: () => void;
  onSetPageEditRanges: (value: string) => void;
  onSetBlankPageInsertAfter: (value: string) => void;
  onSetBlankPageCount: (value: string) => void;
  onSetPageSizeText: (value: string) => void;
  onInsertBlankPages: () => void;
  onResizePages: () => void;
  onSetOutlineJson: (value: string) => void;
  onReadOutline: () => void;
  onSetOutline: () => void;
  onSetAttachmentFilePath: (value: string) => void;
  onSetAttachmentName: (value: string) => void;
  onSetAttachmentDescription: (value: string) => void;
  onSetAttachmentNames: (value: string) => void;
  onListAttachments: () => void;
  onAddAttachment: () => void;
  onExtractAttachments: () => void;
  onRemoveAttachments: () => void;
  onSetRotationDegrees: (value: number) => void;
  onRotatePages: () => void;
  onDeletePages: () => void;
  onExtractPages: () => void;
  onSetCropMargins: (value: string) => void;
  onCropPages: () => void;
  onSetSplitRanges: (value: string) => void;
  onSplitPdf: () => void;
  onSetCommentText: (value: string) => void;
  onAddComment: () => void;
  onAddFreeText: () => void;
  onSetMarkupText: (value: string) => void;
  onAddTextMarkup: (kind: TextMarkupKind) => void;
  onSetRedactText: (value: string) => void;
  onRedactText: () => void;
  onSetStampKind: (value: StandardStampKind) => void;
  onAddStamp: () => void;
  onSetShapeKind: (value: ShapeAnnotationKind) => void;
  onSetShapeDimensions: (value: string) => void;
  onAddShape: () => void;
  onSetImageFilePath: (value: string) => void;
  onSetImageDimensions: (value: string) => void;
  onAddPdfImage: () => void;
  onSetWatermarkText: (value: string) => void;
  onAddWatermark: () => void;
  onCompressPdf: () => void;
  onSetExportImageDpi: (value: string) => void;
  onExportImages: () => void;
  onExtractImages: () => void;
  onSetExportTextFormat: (value: TextExportFormat) => void;
  onExportText: () => void;
  onSetConversionImagePaths: (value: string) => void;
  onSetConversionMarkupTitle: (value: string) => void;
  onSetConversionHtml: (value: string) => void;
  onSetConversionMarkdown: (value: string) => void;
  onSetConversionPageSize: (value: string) => void;
  onSetConversionMargin: (value: string) => void;
  onConvertImagesToPdf: () => void;
  onConvertHtmlToPdf: () => void;
  onConvertMarkdownToPdf: () => void;
  onSetEncryptPassword: (value: string) => void;
  onEncryptPdf: () => void;
  onReadFormFields: () => void;
  onSetFormValuesJson: (value: string) => void;
  onFillFormFields: () => void;
  onSetSignatureText: (value: string) => void;
  onAddTypedSignature: () => void;
  onSetSignatureImagePath: (value: string) => void;
  onSetSignatureImageDimensions: (value: string) => void;
  onAddImageSignature: () => void;
  onSetAiBrushInstruction: (value: string) => void;
  onRunAiBrush: () => void;
  onSetSessionNotes: (value: string) => void;
  onExportNativeAgent: () => void;
}

function ToolsPane(props: ToolsPaneProps) {
  const disabled = !props.activeDocument || props.busy;
  const conversionDisabled = props.busy;
  const applyCount = props.nativePreviewCount || props.highlights.length;
  return (
    <div className="sidebar-content">
      <section className="sidebar-section">
        <div className="section-title">Document</div>
        <div className="tool-grid">
          <button onClick={props.onAnalyze} disabled={disabled}>
            <Sparkles size={15} />
            Re-analyze
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
          <button onClick={props.onClearPreview} disabled={disabled || applyCount === 0}>
            Clear {applyCount ? `(${applyCount})` : ''}
          </button>
          <button onClick={props.onApplyHighlights} disabled={disabled || applyCount === 0}>
            Apply {applyCount ? `(${applyCount})` : ''}
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
          <button onClick={props.onExtractPages} disabled={disabled || !props.pageEditRanges.trim()}>
            <FileText size={15} />
            Extract
          </button>
          <input
            value={props.blankPageInsertAfter}
            onChange={(event) => props.onSetBlankPageInsertAfter(event.target.value)}
            placeholder="Insert after page"
            disabled={disabled}
          />
          <input
            value={props.blankPageCount}
            onChange={(event) => props.onSetBlankPageCount(event.target.value)}
            placeholder="Blank count"
            disabled={disabled}
          />
          <button onClick={props.onInsertBlankPages} disabled={disabled}>
            <FileText size={15} />
            Blank
          </button>
          <input
            value={props.pageSizeText}
            onChange={(event) => props.onSetPageSizeText(event.target.value)}
            placeholder="Page size: 595, 842"
            disabled={disabled}
          />
          <button onClick={props.onResizePages} disabled={disabled}>
            <Crop size={15} />
            Resize
          </button>
          <input
            value={props.cropMargins}
            onChange={(event) => props.onSetCropMargins(event.target.value)}
            placeholder="Crop margins: left, top, right, bottom"
            disabled={disabled}
          />
          <button onClick={props.onCropPages} disabled={disabled}>
            <Crop size={15} />
            Crop
          </button>
        </div>
      </section>

      <section className="sidebar-section">
        <div className="section-title">Outline & Attachments</div>
        <div className="page-tools">
          <textarea
            className="session-notes-input compact-textarea"
            value={props.outlineJson}
            onChange={(event) => props.onSetOutlineJson(event.target.value)}
            placeholder='[{"level":1,"title":"Introduction","page":1}]'
            rows={4}
            disabled={disabled}
          />
          <button onClick={props.onReadOutline} disabled={disabled}>
            <FileText size={15} />
            Read outline
          </button>
          <button onClick={props.onSetOutline} disabled={disabled}>
            <FileText size={15} />
            Save outline
          </button>
          <input
            value={props.attachmentFilePath}
            onChange={(event) => props.onSetAttachmentFilePath(event.target.value)}
            placeholder="Attachment file path"
            disabled={disabled}
          />
          <input
            value={props.attachmentName}
            onChange={(event) => props.onSetAttachmentName(event.target.value)}
            placeholder="Attachment name"
            disabled={disabled}
          />
          <input
            value={props.attachmentDescription}
            onChange={(event) => props.onSetAttachmentDescription(event.target.value)}
            placeholder="Attachment description"
            disabled={disabled}
          />
          <button onClick={props.onAddAttachment} disabled={disabled}>
            <PackageOpen size={15} />
            Attach
          </button>
          <textarea
            className="session-notes-input compact-textarea"
            value={props.attachmentNames}
            onChange={(event) => props.onSetAttachmentNames(event.target.value)}
            placeholder="Attachment names, one per line"
            rows={3}
            disabled={disabled}
          />
          <button onClick={props.onListAttachments} disabled={disabled}>
            <PackageOpen size={15} />
            List files
          </button>
          <button onClick={props.onExtractAttachments} disabled={disabled}>
            <FolderOpen size={15} />
            Extract files
          </button>
          <button onClick={props.onRemoveAttachments} disabled={disabled || !props.attachmentNames.trim()}>
            <Trash2 size={15} />
            Remove files
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
          <button onClick={props.onAddFreeText} disabled={disabled}>
            <FileText size={15} />
            Free text
          </button>
          <select
            value={props.stampKind}
            onChange={(event) => props.onSetStampKind(event.target.value as StandardStampKind)}
            disabled={disabled}
          >
            {STANDARD_STAMP_KINDS.map((stamp) => (
              <option value={stamp} key={stamp}>
                {stamp}
              </option>
            ))}
          </select>
          <button onClick={props.onAddStamp} disabled={disabled}>
            <Stamp size={15} />
            Stamp
          </button>
          <select
            value={props.shapeKind}
            onChange={(event) => props.onSetShapeKind(event.target.value as ShapeAnnotationKind)}
            disabled={disabled}
          >
            {SHAPE_ANNOTATION_KINDS.map((shape) => (
              <option value={shape} key={shape}>
                {shape}
              </option>
            ))}
          </select>
          <input
            value={props.shapeDimensions}
            onChange={(event) => props.onSetShapeDimensions(event.target.value)}
            placeholder="Shape W,H"
            disabled={disabled}
          />
          <button onClick={props.onAddShape} disabled={disabled}>
            <Square size={15} />
            Shape
          </button>
          <input
            value={props.imageFilePath}
            onChange={(event) => props.onSetImageFilePath(event.target.value)}
            placeholder="Image file path"
            disabled={disabled}
          />
          <input
            value={props.imageDimensions}
            onChange={(event) => props.onSetImageDimensions(event.target.value)}
            placeholder="Image W,H"
            disabled={disabled}
          />
          <button onClick={props.onAddPdfImage} disabled={disabled}>
            <ImageIcon size={15} />
            Image
          </button>
          <input
            value={props.markupText}
            onChange={(event) => props.onSetMarkupText(event.target.value)}
            placeholder="Text to mark"
            disabled={disabled}
          />
          <button onClick={() => props.onAddTextMarkup('underline')} disabled={disabled || !props.markupText.trim()}>
            <Underline size={15} />
            Underline
          </button>
          <button onClick={() => props.onAddTextMarkup('strikeout')} disabled={disabled || !props.markupText.trim()}>
            <Strikethrough size={15} />
            Strike
          </button>
          <input
            value={props.redactText}
            onChange={(event) => props.onSetRedactText(event.target.value)}
            placeholder="Text to redact"
            disabled={disabled}
          />
          <button onClick={props.onRedactText} disabled={disabled || !props.redactText.trim()}>
            <Shield size={15} />
            Redact
          </button>
        </div>
        <div className="field-hint">
          {props.commentTarget
            ? `Target for ${pdfPlacementLabel(props.placementMode)} P${props.commentTarget.page + 1} · ${Math.round(
                props.commentTarget.x,
              )},${Math.round(
                props.commentTarget.y,
              )}`
            : props.placementMode !== 'none'
              ? pdfPlacementPrompt(props.placementMode)
              : 'Click Comment, Free text, Stamp, Shape, or Image first, then choose a PDF position.'}
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
          <button onClick={props.onAddTypedSignature} disabled={disabled}>
            <Stamp size={15} />
            Sign here
          </button>
          <input
            value={props.signatureImagePath}
            onChange={(event) => props.onSetSignatureImagePath(event.target.value)}
            placeholder="Signature image path"
            disabled={disabled}
          />
          <input
            value={props.signatureImageDimensions}
            onChange={(event) => props.onSetSignatureImageDimensions(event.target.value)}
            placeholder="Signature W,H"
            disabled={disabled}
          />
          <button onClick={props.onAddImageSignature} disabled={disabled}>
            <PenLine size={15} />
            Image sign
          </button>
        </div>
        <div className="field-hint">
          {props.placementMode === 'signature' || props.placementMode === 'image-signature'
            ? pdfPlacementPrompt(props.placementMode)
            : 'Click Sign here or Image sign, then choose a PDF position. These are visible signatures, not certificate signatures.'}
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
          <button onClick={props.onCompressPdf} disabled={disabled}>
            <PackageOpen size={15} />
            Compress
          </button>
          <input
            value={props.exportImageDpi}
            onChange={(event) => props.onSetExportImageDpi(event.target.value)}
            placeholder="PNG DPI"
            disabled={disabled}
          />
          <button onClick={props.onExportImages} disabled={disabled}>
            <FileText size={15} />
            PNG
          </button>
          <button onClick={props.onExtractImages} disabled={disabled}>
            <PackageOpen size={15} />
            Images
          </button>
          <select
            value={props.exportTextFormat}
            onChange={(event) => props.onSetExportTextFormat(event.target.value as TextExportFormat)}
            disabled={disabled}
          >
            {TEXT_EXPORT_FORMATS.map((format) => (
              <option value={format} key={format}>
                {format === 'markdown' ? 'Markdown' : 'TXT'}
              </option>
            ))}
          </select>
          <button onClick={props.onExportText} disabled={disabled}>
            <FileText size={15} />
            Text
          </button>
          <textarea
            className="session-notes-input compact-textarea"
            value={props.conversionImagePaths}
            onChange={(event) => props.onSetConversionImagePaths(event.target.value)}
            placeholder="Image paths, one per line"
            rows={3}
            disabled={conversionDisabled}
          />
          <input
            value={props.conversionMarkupTitle}
            onChange={(event) => props.onSetConversionMarkupTitle(event.target.value)}
            placeholder="Converted PDF title"
            disabled={conversionDisabled}
          />
          <input
            value={props.conversionPageSize}
            onChange={(event) => props.onSetConversionPageSize(event.target.value)}
            placeholder="PDF size: 595, 842"
            disabled={conversionDisabled}
          />
          <input
            value={props.conversionMargin}
            onChange={(event) => props.onSetConversionMargin(event.target.value)}
            placeholder="Margin"
            disabled={conversionDisabled}
          />
          <button onClick={props.onConvertImagesToPdf} disabled={conversionDisabled || !props.conversionImagePaths.trim()}>
            <FileText size={15} />
            Images to PDF
          </button>
          <textarea
            className="session-notes-input compact-textarea"
            value={props.conversionHtml}
            onChange={(event) => props.onSetConversionHtml(event.target.value)}
            placeholder="HTML to convert"
            rows={4}
            disabled={conversionDisabled}
          />
          <button onClick={props.onConvertHtmlToPdf} disabled={conversionDisabled || !props.conversionHtml.trim()}>
            <FileText size={15} />
            HTML to PDF
          </button>
          <textarea
            className="session-notes-input compact-textarea"
            value={props.conversionMarkdown}
            onChange={(event) => props.onSetConversionMarkdown(event.target.value)}
            placeholder="Markdown to convert"
            rows={4}
            disabled={conversionDisabled}
          />
          <button onClick={props.onConvertMarkdownToPdf} disabled={conversionDisabled || !props.conversionMarkdown.trim()}>
            <FileText size={15} />
            Markdown to PDF
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
        <p className="native-core-secondary">
        {props.nativeCoreStatus?.mode === 'pdf4qt-ready'
          ? 'PDF4QT is active for page rendering and supported native commands.'
          : 'PDF4QT rendering is unavailable until the native host bridge is configured.'}
        </p>
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
          Re-analyze document
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
