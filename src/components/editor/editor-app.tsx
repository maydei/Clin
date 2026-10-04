"use client";


import { ViewChrome, ViewRegion, PanelResize, TouchChromeHandle } from "./view-chrome";
import { collapseTargets, toggleGroupCollapse, groupSelectionInGrid } from "@/lib/editor/group-view";
import { SquareTerminal } from "lucide-react";
import { assertExportSources } from "@/lib/editor/export-task";
import { SelectGroup } from "@/components/ui/select";
import { Field, FieldLabel, FieldGroup } from "@/components/ui/field";
import { CommandMenu, type EditorCommand } from "./command-menu";
import { CropDialog } from "./crop-dialog";
import { cropPage } from "@/lib/editor/crop";
import { cameraToFitPages } from "@/lib/editor/canvas-focus";
import { Accordion, AccordionItem, AccordionTrigger, AccordionContent } from "@/components/ui/accordion";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { PDFDocumentProxy } from "pdfjs-dist";
import {
  AlertTriangle,
  Archive,
  BookOpen,
  Columns3,
  Copy,
  ClipboardCopy,
  Download,
  Eraser,
  FilePlus2,
  FilePenLine,
  FileUp,
  FolderOpen,
  Hand,
  Highlighter,
  History,
  ImageDown,
  LayoutGrid,
  Layers3,
  Menu,
  MousePointer2,
  PanelLeft,
  PanelRight,
  PenLine,
  Presentation,
  Printer,
  Redo2,
  RotateCcw,
  RotateCw,
  Rows3,
  Save,
  SaveAll,
  ScanText,
  Cog,
  SlidersHorizontal,
  ShieldCheck,
  Square,
  StickyNote,
  Trash2,
  Type,
  Undo2,
  ZoomIn,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuShortcut,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { AlertDialog, AlertDialogContent, AlertDialogHeader, AlertDialogTitle, AlertDialogDescription, AlertDialogFooter, AlertDialogCancel, AlertDialogAction } from "@/components/ui/alert-dialog";
import { Checkbox } from "@/components/ui/checkbox";
import { Progress } from "@/components/ui/progress";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import { TooltipProvider } from "@/components/ui/tooltip";
import { InfiniteCanvas } from "./infinite-canvas";
import { GeneralSettings } from "./general-settings";
import { ClinBrand } from "./clin-brand";
import { ColorPicker } from "./color-picker";
import { DashboardView, ToolList, type DashboardTool } from "./dashboard-view";
import { Inspector } from "./inspector";
import { PageRail } from "./page-rail";
import { PresentationView, type PresentationTransition } from "./presentation-view";
import { ReaderView } from "./reader-view";
import { ToolButton } from "./tool-button";
import { QuickOrganizer } from "./quick-organizer";
import {
  clearAutosave,
  loadAutosave,
  loadRecentProjects,
  loadRecentProject,
  removeRecentProject,
  clearRecentProjects,
  type RecentProject,
  saveAutosave,
  saveRecentProject,
} from "@/lib/editor/autosave";
import { downloadBytes } from "@/lib/editor/download";
import { exportCanvasImage } from "@/lib/editor/canvas-export";
import { outputWorker } from "@/lib/editor/output-worker-client";
import { ExportPreviewPage } from "./export-preview-page";
import { VisiblePage } from "./visible-page";
import { exportPageImage, exportPageImages } from "@/lib/editor/image-export";
import { boundsForPages, fitBounds, type Bounds } from "@/lib/editor/geometry";
import { commit, createHistory, redo, undo } from "@/lib/editor/history";
import {
  addAnnotation,
  alignPages,
  arrangePagesInDirection,
  clearAnnotationObjects,
  clearStrokeAnnotations,
  createEditorState,
  createGroup,
  deleteAnnotations,
  deleteGroup,
  deletePages,
  moveAnnotation,
  movePagesToGroup,
  normalizeEditorState,
  orderedPagesForExport,
  setGroupOrderMode,
  renameGroup,
  rotatePages,
  selectAnnotation,
  selectGroup,
  selectPages,
  setPageTextBlocks,
  setTool,
  ungroupPages,
  updateAnnotation,
  updateGroupExport,
  updatePageName,
} from "@/lib/editor/model";
import { importImageFile, importPdfFile, isSupportedImageFile, restorePdfSource, type ImportedPdf } from "@/lib/editor/pdf-runtime";
import { decodeProjectAsync, encodeProjectAsync } from "@/lib/editor/project-file";
import { exportRasterPdf, type RasterProfile } from "@/lib/editor/raster-export";
import { DEFAULT_ACCENT, accentForeground } from "@/lib/editor/accent";
import { readPreferences, writePreferences } from "@/lib/editor/preferences";
import { prepareSpatialDocument, reorderSpatialDocument } from "@/lib/editor/spatial-order";
import { applySelection, duplicateSelection, moveMixedSelection, explicitSelection, ungroupSelection, selectTreeItem } from "@/lib/editor/selection";
import { performanceEntries, recordDuration, setPerformanceEnabled } from "@/lib/editor/performance-log";
import { releasePageCache, renderingSnapshot } from "@/lib/editor/render-scheduler";
import { abortable, recognizePageText, terminateOcrWorker } from "@/lib/editor/ocr";
import { printEditorPages } from "@/lib/editor/print-export";
import { chooseOutputDirectory, writeBytesToDirectory, type OutputDirectoryHandle } from "@/lib/editor/local-save";
import { protectPdf, signPdf } from "@/lib/editor/secure-output-client";
import { createReplacement, extractPdfTextBlocks } from "@/lib/editor/text-index";
import type { Camera, DocumentSource, DocumentTextBlock, EditorPage, EditorProject, EditorState, EditorTool } from "@/lib/editor/types";

type ExportMode = "editable" | RasterProfile;
type ExportOutput = "pdf" | "png" | "jpeg" | "print";
type ThemeMode = "system" | "light" | "dark";
type AppEnvironment = "canvas" | "reader" | "dashboard";
type CleanupAction = "reload" | "strokes" | "annotations" | "restore" | "empty";
type DiagnosticEntry = { id: string; time: string; context: string; message: string; details: string };

const toolItems: Array<{ id: EditorTool; label: string; icon: typeof MousePointer2; shortcut?: string }> = [
  { id: "select", label: "Seleccionar", icon: MousePointer2, shortcut: "V" },
  { id: "hand", label: "Mano", icon: Hand, shortcut: "Espacio" },
  { id: "ink", label: "Lápiz", icon: PenLine, shortcut: "P" },
  { id: "highlight", label: "Resaltador", icon: Highlighter },
  { id: "text", label: "Texto", icon: Type, shortcut: "T" },
  { id: "edit-text", label: "Editar texto", icon: FilePenLine, shortcut: "E" },
  { id: "rectangle", label: "Rectángulo", icon: Square, shortcut: "R" },
  { id: "eraser", label: "Borrador", icon: Eraser, shortcut: "O" },
];

const shortcutTools: Record<string, EditorTool> = { v: "select", p: "ink", t: "text", e: "edit-text", r: "rectangle", o: "eraser" };

const safeFilename = (name: string, extension: string) => {
  const base = name.trim().replace(/[<>:"/\\|?*\u0000-\u001f]/g, "_") || "documento";
  return base.toLowerCase().endsWith(extension) ? base : `${base}${extension}`;
};

const confirmationStorageKey = "limpio-pdf:cleanup-confirmations:v1";

const cleanupCopy: Record<CleanupAction, { label: string; description: string }> = {
  reload: { label: "Recargar", description: "Recupera el orden, la posición, los grupos, las páginas y las anotaciones del último guardado manual." },
  strokes: { label: "Borrar trazos", description: "Elimina lápiz y resaltador de las páginas y de la pizarra." },
  annotations: { label: "Borrar anotaciones", description: "Elimina trazos, formas y cuadros de texto. Mantiene las sustituciones de texto PDF." },
  restore: { label: "Restaurar", description: "Devuelve los documentos al estado original importado, incluidas páginas, rotaciones, sustituciones y anotaciones." },
  empty: { label: "Vaciar espacio", description: "Cierra todos los documentos y deja el proyecto vacío." },
};

const quickToolLabels: Record<DashboardTool, string> = {
  organize: "Organizar",
  compress: "Comprimir",
  split: "Separar",
  protect: "Proteger y firmar",
};

const readableError = (error: unknown) => {
  const raw = error instanceof Error ? error.message : String(error || "Error desconocido");
  if (/PKCS#12|P12|PFX|Integrity/i.test(raw)) {
    return "No se pudo abrir el certificado. Comprueba que sea un P12/PFX válido y que su contraseña sea correcta.";
  }
  return raw;
};

function appendImportedDocuments(base: EditorState, imported: ImportedPdf[], nativeTextBlocks: DocumentTextBlock[]) {
  const addedPages = imported.flatMap((item) => item.pages);
  let next: EditorState = {
    ...base,
    pages: [...base.pages, ...addedPages].map((page, order) => ({ ...page, order })),
    textBlocks: [...base.textBlocks, ...nativeTextBlocks],
    selectedPageIds: addedPages.map((page) => page.id),
    selectedGroupId: null,
    selectedAnnotationId: null,
  };
  imported.forEach((item) => {
    next = createGroup(next, item.pages.map((page) => page.id), {
      id: `source-${item.source.id}`,
      name: item.source.name.replace(/\.(pdf|png|jpe?g|webp)$/i, ""),
      parentId: null,
    });
  });
  return applySelection(next, addedPages.map((page) => ({ kind: "page", id: page.id })));
}

export function EditorApp() {
  const [history, setHistory] = useState(() => createHistory(createEditorState()));
  const [sources, setSources] = useState<DocumentSource[]>([]);
  const [documents, setDocuments] = useState<Map<string, PDFDocumentProxy>>(() => new Map());
  const [camera, setCamera] = useState<Camera>({ x: 120, y: 80, zoom: 0.72 });
  const [projectId, setProjectId] = useState(() => crypto.randomUUID());
  const [projectName, setProjectName] = useState("Sin título");
  const [recentProjects, setRecentProjects] = useState<RecentProject[]>([]);
  const [inkColor, setInkColor] = useState("#e11d48");
  const [highlightColor, setHighlightColor] = useState("#facc15");
  const [inkSize, setInkSize] = useState(4);
  const [pressureEnabled, setPressureEnabled] = useState(true);
  const [pressureSensitivity, setPressureSensitivity] = useState(1);
  const [strokeSmoothing, setStrokeSmoothing] = useState(0.8);
  const [accentColor, setAccentColor] = useState(DEFAULT_ACCENT);
  const [theme, setTheme] = useState<ThemeMode>("system");
  const [environment, setEnvironment] = useState<AppEnvironment>("dashboard");
  const [startup, setStartup] = useState<AppEnvironment>("dashboard");
  const [diagnosticsEnabled, setDiagnosticsEnabled] = useState(false);
  const diagnosticsEnabledRef = useRef(false);
  const [status, setStatus] = useState("Listo");
  const [showStatusBar, setShowStatusBar] = useState(false);
  const [revealMargin, setRevealMargin] = useState(24);
  const [startInZen, setStartInZen] = useState(false);
  const [zen, setZen] = useState(false);
  const [interfaceHidden, setInterfaceHidden] = useState(false);
  const [leftWidth, setLeftWidth] = useState(288);
  const [rightWidth, setRightWidth] = useState(288);
  const [readerWidth, setReaderWidth] = useState(224);
  const chromeHidden = interfaceHidden && environment !== "dashboard";
  const changeZen = useCallback(async (enabled: boolean) => {
    try {
      if (window.clinDesktop?.setZen) { await window.clinDesktop.setZen(enabled); setZen(enabled); }
      else if (enabled) await document.documentElement.requestFullscreen();
      else if (document.fullscreenElement) await document.exitFullscreen();
    } catch { setStatus("No se pudo cambiar el modo de pantalla completa."); }
  }, []);
  useEffect(() => {
    const desktop = window.clinDesktop;
    const syncBrowser = () => { if (!desktop) setZen(Boolean(document.fullscreenElement)); };
    document.addEventListener("fullscreenchange", syncBrowser);
    const stop = desktop?.onWindowState?.(value => setZen(value.zen));
    void desktop?.getWindowState?.().then(value => setZen(value.zen)).catch(() => undefined);
    const textScale = () => { void desktop?.getTextScale?.().then(value => { document.documentElement.style.fontSize = `${16 * value}px`; document.documentElement.style.setProperty("--windows-text-scale", String(value)); }).catch(() => undefined); };
    textScale(); window.addEventListener("focus", textScale);
    return () => { stop?.(); window.removeEventListener("focus", textScale); document.removeEventListener("fullscreenchange", syncBrowser); };
  }, []);
  const [preferencesReady, setPreferencesReady] = useState(false);
  const [commandsOpen, setCommandsOpen] = useState(false);
  const [cropPageId, setCropPageId] = useState<string | null>(null);
  const [captureMode, setCaptureMode] = useState(false);
  const captureController = useRef<AbortController | null>(null);
  const [generalSettingsOpen, setGeneralSettingsOpen] = useState(false);
  const [penSettingsOpen, setPenSettingsOpen] = useState(false);
  const [newProjectOpen, setNewProjectOpen] = useState(false);
  const cleanupCancelRef = useRef<HTMLButtonElement>(null);
  const [cleanupAction, setCleanupAction] = useState<CleanupAction | null>(null);
  const [rememberCleanupChoice, setRememberCleanupChoice] = useState(false);
  const [confirmationPreferences, setConfirmationPreferences] = useState<Record<CleanupAction, boolean>>(() => {
    const defaults: Record<CleanupAction, boolean> = { reload: true, strokes: true, annotations: true, restore: true, empty: true };
    if (typeof window === "undefined") return defaults;
    try {
      const stored = window.localStorage.getItem(confirmationStorageKey);
      return stored ? { ...defaults, ...JSON.parse(stored) } : defaults;
    } catch {
      return defaults;
    }
  });
  const [manualCheckpoint, setManualCheckpoint] = useState<EditorState | null>(null);
  const [originalState, setOriginalState] = useState<EditorState | null>(null);
  const [whiteboardMode, setWhiteboardMode] = useState(false);
  const [presentationOpen, setPresentationOpen] = useState(false);
  const [presentationTransition, setPresentationTransition] = useState<PresentationTransition>("fade");
  const [includeBoardExport, setIncludeBoardExport] = useState(false);
  const exportPreparation = useRef<{ base: ReturnType<typeof createHistory>; prepared: EditorState } | null>(null);
  const [exportSnapshot, setExportSnapshot] = useState<EditorState | null>(null);
  const [exportOpen, setExportOpen] = useState(false);
  const [exportError, setExportError] = useState("");
  const [exportMode, setExportMode] = useState<ExportMode>("editable");
  const [exportGroupId, setExportGroupId] = useState<string | null>(null);
  const [exportSelectionOnly, setExportSelectionOnly] = useState(false);
  const [exportOutput, setExportOutput] = useState<ExportOutput>("pdf");
  const [exportDocumentName, setExportDocumentName] = useState("Sin título");
  const [quickTool, setQuickTool] = useState<DashboardTool | null>(null);
  const [toolsOpen, setToolsOpen] = useState(false);
  const [recentDeletion, setRecentDeletion] = useState<RecentProject | "all" | null>(null);
  const [deletingRecent, setDeletingRecent] = useState(false);
  const [recentError, setRecentError] = useState("");
  const [exporting, setExporting] = useState(false);
  const [recognizingText, setRecognizingText] = useState(false);
  const [ocrProgress, setOcrProgress] = useState({ value: 0, label: "Preparando…", backup: false });
  const searchScanAttempt = useRef("");
  const [protectExport, setProtectExport] = useState(false);
  const [pdfPassword, setPdfPassword] = useState("");
  const [pdfPasswordConfirmation, setPdfPasswordConfirmation] = useState("");
  const [ownerPassword, setOwnerPassword] = useState("");
  const [allowPrint, setAllowPrint] = useState(true);
  const [allowCopy, setAllowCopy] = useState(false);
  const [allowModify, setAllowModify] = useState(false);
  const [signExport, setSignExport] = useState(false);
  const [certificate, setCertificate] = useState<Uint8Array | null>(null);
  const [certificateName, setCertificateName] = useState("");
  const [certificatePassword, setCertificatePassword] = useState("");
  const [signatureReason, setSignatureReason] = useState("");
  const [signatureLocation, setSignatureLocation] = useState("");
  const [progress, setProgress] = useState(0);
  const [importStatus, setImportStatus] = useState("");
  const [exportStatus, setExportStatus] = useState("");
  const [diagnostics, setDiagnostics] = useState<DiagnosticEntry[]>([]);
  const [performanceSnapshot, setPerformanceSnapshot] = useState("");
  const [diagnosticsOpen, setDiagnosticsOpen] = useState(false);
  const [outputDirectory, setOutputDirectory] = useState<OutputDirectoryHandle | null>(null);
  const [leftOpen, setLeftOpen] = useState(false);
  const [railTab, setRailTab] = useState("pages");
  const [searchFocusRequest, setSearchFocusRequest] = useState(0);
  const [rightOpen, setRightOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [focusedTextBlockId, setFocusedTextBlockId] = useState<string | null>(null);
  const [hydrated, setHydrated] = useState(false);
  const pdfInputRef = useRef<HTMLInputElement>(null);
  const projectInputRef = useRef<HTMLInputElement>(null);
  const toolBeforeSpace = useRef<EditorTool | null>(null);

  const epoch = useRef(0);
  const workspaceHasChanges = useRef(false);
  const importBusy = useRef(false);
  const projectController = useRef<AbortController | null>(null);
  const ocrController = useRef<AbortController | null>(null);
  const saveController = useRef<AbortController | null>(null);
  const taskController = useRef<AbortController | null>(null);
  const exportController = useRef<AbortController | null>(null);
  const [importing, setImporting] = useState(false);
  const [indexing, setIndexing] = useState(false);
  const [openingProject, setOpeningProject] = useState(false);
  const [pendingOpen, setPendingOpen] = useState<EditorProject | null>(null);
  const [savingProject, setSavingProject] = useState(false);
  const [projectError, setProjectError] = useState("");
  const [recovery, setRecovery] = useState<EditorProject | null>(null);
  const [recoveryReady, setRecoveryReady] = useState(false);
  const [saveStatus, setSaveStatus] = useState("Recuperación local pendiente");
  const [saveRetry, setSaveRetry] = useState(0);
  const [activePageId, setActivePageId] = useState<string | null>(null);
  const savedDocuments = useRef(documents);
  useEffect(() => {
    for (const [id, document] of savedDocuments.current) if (!documents.has(id)) {
      releasePageCache(document);
      void document.loadingTask.destroy().catch(() => undefined);
    }
    savedDocuments.current = documents;
  }, [documents]);
  useEffect(() => () => {
    captureController.current?.abort(); taskController.current?.abort(); ocrController.current?.abort(); exportController.current?.abort(); projectController.current?.abort(); saveController.current?.abort();
    for (const document of savedDocuments.current.values()) { releasePageCache(document); void document.loadingTask.destroy().catch(() => undefined); }
    void terminateOcrWorker().catch(() => undefined);
  }, []);
  useEffect(() => {
    const preferences = readPreferences();
    setShowStatusBar(preferences.showStatusBar); setRevealMargin(preferences.revealMargin); setStartInZen(preferences.startInZen);
    if (preferences.startInZen && window.clinDesktop?.setZen) void changeZen(true);
    setPresentationTransition(preferences.presentationTransition); setTheme(preferences.theme); setAccentColor(preferences.accentColor); setStartup(preferences.startup); setEnvironment(preferences.startup);
    setDiagnosticsEnabled(preferences.diagnostics); diagnosticsEnabledRef.current = preferences.diagnostics;
    setPerformanceEnabled(preferences.diagnostics);
    setInkColor(preferences.inkColor); setHighlightColor(preferences.highlightColor); setInkSize(preferences.inkSize);
    setPressureEnabled(preferences.pressureEnabled); setPressureSensitivity(preferences.pressureSensitivity); setStrokeSmoothing(preferences.strokeSmoothing);
    setPreferencesReady(true);
  }, [changeZen]);
  useEffect(() => {
    if (!preferencesReady) return;
    diagnosticsEnabledRef.current = diagnosticsEnabled;
    setPerformanceEnabled(diagnosticsEnabled);
    if (!diagnosticsEnabled) { setDiagnosticsOpen(false); setDiagnostics([]); setPerformanceSnapshot(""); }
    try { writePreferences({ showStatusBar, revealMargin, startInZen, version: 1, presentationTransition, accentColor, theme, startup, diagnostics: diagnosticsEnabled, inkColor, highlightColor, inkSize, pressureEnabled, pressureSensitivity, strokeSmoothing }); }
    catch { setStatus("No se pudieron conservar las preferencias en este dispositivo."); }
  }, [showStatusBar, revealMargin, startInZen, preferencesReady, presentationTransition, accentColor, theme, startup, diagnosticsEnabled, inkColor, highlightColor, inkSize, pressureEnabled, pressureSensitivity, strokeSmoothing]);
  const state = history.present;
  const documentState = useMemo(() => ({ ...state, selectedItems: [], selectedGroupIds: [], selectedAnnotationIds: [], selectedPageIds: [], selectedGroupId: null, selectedAnnotationId: null, tool: "select" as const }), [state.pages, state.groups, state.annotations, state.textBlocks]);
  const exportState = exportSnapshot ?? state;
  const exportPageIds = exportSelectionOnly ? exportState.selectedPageIds : undefined;
  const exportPages = useMemo(() => orderedPagesForExport(exportState, exportGroupId, exportPageIds), [exportState, exportGroupId, exportPageIds]);
  const hasCanvasContent = state.pages.length > 0 || state.annotations.some((annotation) => annotation.pageId === null);

  const commitState = useCallback((transform: (current: typeof state) => typeof state) => {
    workspaceHasChanges.current = true;
    setHistory((current) => commit(current, transform(current.present)));
  }, []);

  const reportError = useCallback((context: string, error: unknown) => {
    const message = readableError(error);
    const details = error instanceof Error ? error.stack || error.message : String(error);
    setStatus(message);
    if (diagnosticsEnabledRef.current) setDiagnostics((current) => [{ id: crypto.randomUUID(), time: new Date().toLocaleTimeString("es-ES"), context, message, details }, ...current].slice(0, 50));
  }, []);

  const replaceState = useCallback((transform: (current: typeof state) => typeof state) => {
    setHistory((current) => ({ ...current, present: transform(current.present) }));
  }, []);

  const fitPageSet = useCallback((pages: EditorPage[]) => {
    const fitted = cameraToFitPages(pages, document.querySelector<HTMLElement>(".canvas-root"));
    if (fitted) setCamera(fitted);
  }, []);

  const restoreProject = useCallback(async (project: EditorProject) => {
    const generation = ++epoch.current;
    captureController.current?.abort(); taskController.current?.abort(); ocrController.current?.abort(); exportController.current?.abort();
    setExportOpen(false); setExportSnapshot(null); setActivePageId(null); setCaptureMode(false); setCropPageId(null);
    saveController.current?.abort();
    setOpeningProject(true);
    setStatus("Abriendo proyecto…");
    const restored = new Map<string, PDFDocumentProxy>();
    try {
      for (const source of project.sources) {
        const document = await restorePdfSource(source);
        restored.set(source.id, document);
        if (generation !== epoch.current) throw new DOMException("Cancelado", "AbortError");
      }
    } catch (error) {
      for (const document of restored.values()) void document.loadingTask.destroy().catch(() => undefined);
      if (generation === epoch.current) setOpeningProject(false);
      throw error;
    }
    setRecovery(null);
    const restoredState = normalizeEditorState(project.state);
    workspaceHasChanges.current = restoredState.pages.length > 0 || restoredState.annotations.length > 0;
    setProjectId(project.id ?? crypto.randomUUID());
    setProjectName(project.name);
    setSources(project.sources);
    setDocuments(restored);
    setHistory(createHistory(restoredState));
    setManualCheckpoint(project.savedState ? normalizeEditorState(project.savedState) : restoredState);
    setOriginalState(project.originalState ? normalizeEditorState(project.originalState) : restoredState);
    setEnvironment(startup === "reader" ? "reader" : "canvas");
    setStatus("Proyecto abierto");
    setOpeningProject(false);
    window.setTimeout(() => fitPageSet(restoredState.pages), 0);
  }, [fitPageSet, startup]);

  useEffect(() => {
    let cancelled = false;
    setHydrated(true);
    void Promise.all([loadAutosave(), loadRecentProjects()]).then(([project, recent]) => {
      if (cancelled) return;
      setRecentProjects(recent);
      setRecovery(project);
    }).catch((error) => { if (!cancelled) reportError("Recuperación", error); })
      .finally(() => { if (!cancelled) setRecoveryReady(true); });
    return () => { cancelled = true; };
  }, [reportError]);

  const requestProjectOpen = useCallback(async (project: EditorProject) => {
    if (workspaceHasChanges.current) { setPendingOpen(project); return; }
    await restoreProject(project);
  }, [restoreProject]);

  const openRecent = useCallback(async (recent: RecentProject) => {
    const generation = epoch.current;
    try {
      const project = await loadRecentProject(recent);
      if (generation === epoch.current) await requestProjectOpen(project);
    } catch (error) { reportError("Abrir reciente", error); }
  }, [reportError, requestProjectOpen]);

  useEffect(() => {
    const root = document.documentElement;
    root.style.setProperty("--primary", accentColor);
    root.style.setProperty("--primary-foreground", accentForeground(accentColor));
    root.style.setProperty("--accent", `color-mix(in oklab, ${accentColor} 16%, var(--background))`);
    root.style.setProperty("--accent-foreground", "var(--foreground)");
    root.style.setProperty("--ring", `color-mix(in oklab, ${accentColor} 65%, var(--foreground))`);
  }, [accentColor]);

  useEffect(() => {
    const root = document.documentElement;
    const media = window.matchMedia("(prefers-color-scheme: dark)");
    const apply = () => root.classList.toggle("dark", theme === "dark" || (theme === "system" && media.matches));
    apply();
    media.addEventListener("change", apply);
    return () => media.removeEventListener("change", apply);
  }, [theme]);

  useEffect(() => {
    if (!hydrated || !recoveryReady || recovery || (!sources.length && !documentState.annotations.length)) return;
    let active = true;
    setSaveStatus("Cambios pendientes");
    const timeout = window.setTimeout(() => {
      const project: EditorProject = { id: projectId, version: 1, name: projectName, state: documentState, sources, savedState: manualCheckpoint ?? undefined, originalState: originalState ?? undefined, updatedAt: new Date().toISOString() };
      setSaveStatus("Guardando recuperación…");
      void saveAutosave(project).then(() => { if (active) setSaveStatus("Recuperación local actualizada"); })
        .catch(() => { if (active) setSaveStatus("Error de recuperación. Reintenta o guarda un archivo .clin."); });
    }, 900);
    return () => { active = false; window.clearTimeout(timeout); };
  }, [hydrated, recoveryReady, recovery, manualCheckpoint, originalState, projectId, projectName, sources, documentState, saveRetry]);

  const importFiles = useCallback(async (files: File[]) => {
    const supported = files.filter((file) => file.name.toLowerCase().endsWith(".pdf") || isSupportedImageFile(file));
    if (!supported.length) return;
    if (importBusy.current) { setImportStatus("Espera a que termine la importación actual o cancélala antes de añadir otro archivo."); return; }
    importBusy.current = true;
    setImporting(true);
    const generation = epoch.current;
    const controller = new AbortController();
    taskController.current = controller;
    const importStartedAt = performance.now();
    let firstPageRecorded = false;
    let indexFailures = 0;
    try {
      const existingBounds = boundsForPages(history.present.pages);
      let position = existingBounds ? { x: existingBounds.x + existingBounds.width + 140, y: existingBounds.y } : { x: 100, y: 100 };
      for (let fileIndex = 0; fileIndex < supported.length; fileIndex++) {
        controller.signal.throwIfAborted();
        const file = supported[fileIndex];
        setImportStatus(`Leyendo ${fileIndex + 1}/${supported.length}: ${file.name}`);
        let firstChunk = true;
        const receivePages = (chunk: ImportedPdf) => {
          controller.signal.throwIfAborted();
          if (generation !== epoch.current) throw new DOMException("Cancelado", "AbortError");
          if (firstChunk) {
            firstChunk = false;
            if (!firstPageRecorded) { recordDuration("import-first-page-ready", importStartedAt); firstPageRecorded = true; }
            setSources((current) => [...current, chunk.source]);
            setDocuments((current) => new Map(current).set(chunk.source.id, chunk.document));
            commitState((current) => appendImportedDocuments(current, [chunk], []));
            setOriginalState((current) => appendImportedDocuments(current ?? createEditorState(), [chunk], []));
            setEnvironment((current) => current === "dashboard" ? (startup === "reader" ? "reader" : "canvas") : current);
            if (fileIndex === 0) fitPageSet(chunk.pages);
          } else {
            const extend = (current: EditorState) => {
              const existing = current.pages.find((page) => page.sourceId === chunk.source.id);
              if (!existing) return current;
              const order = Math.max(-1, ...current.pages.map((page) => page.order)) + 1;
              return { ...current, pages: [...current.pages, ...chunk.pages.map((page, index) => ({ ...page, groupId: existing.groupId, order: order + index }))] };
            };
            setHistory((current) => ({ past: current.past.map(extend), present: extend(current.present), future: current.future.map(extend) }));
            setOriginalState((current) => current ? extend(current) : current);
          }
          setImportStatus(`Preparando páginas de ${file.name} · puedes empezar a trabajar`);
        };
        const item = isSupportedImageFile(file)
          ? await importImageFile(file, position)
          : await importPdfFile(file, position, { signal: controller.signal, onPages: receivePages });
        if (generation !== epoch.current || controller.signal.aborted) { if (firstChunk) void item.document.loadingTask.destroy(); controller.signal.throwIfAborted(); return; }
        if (firstChunk) receivePages(item);
        setSources((current) => current.map((source) => source.id === item.source.id ? item.source : source));
        const bounds = boundsForPages(item.pages);
        if (bounds) position = { x: position.x, y: position.y + bounds.height + 140 };
        setIndexing(true);
        let fileFailures = 0;
        // Bounded batches yield between pages and don't block displaying the document.
        for (let index = 0; index < item.pages.length; index += 2) {
          controller.signal.throwIfAborted();
          const batch = item.pages.slice(index, index + 2);
          const blocks = (await Promise.all(batch.map((page) => extractPdfTextBlocks(item.document, page).catch(() => { fileFailures++; indexFailures++; return []; })))).flat();
          if (generation !== epoch.current) return;
          controller.signal.throwIfAborted();
          const enrich = (current: EditorState) => {
            const present = new Set(current.pages.map((page) => page.id));
            const known = new Set(current.textBlocks.map((block) => block.id));
            return { ...current, textBlocks: [...current.textBlocks, ...blocks.filter((block) => present.has(block.pageId) && !known.has(block.id))] };
          };
          setHistory((current) => ({ past: current.past.map(enrich), present: enrich(current.present), future: current.future.map(enrich) }));
          setOriginalState((current) => current ? enrich(current) : current);
          setImportStatus(`Indexando texto ${Math.min(index + 2, item.pages.length)}/${item.pages.length} · búsqueda parcial`);
          await new Promise((resolve) => setTimeout(resolve, 0));
        }
        setSources((current) => current.map((source) => source.id === item.source.id ? { ...source, indexComplete: fileFailures === 0 } : source));
      }
      setStatus(indexFailures ? "Documentos añadidos; algunas páginas no pudieron indexarse. Puedes reintentar el índice." : "Documentos añadidos · índice de búsqueda completo");
    } catch (error) {
      if (generation === epoch.current) setStatus(error instanceof DOMException && error.name === "AbortError" ? "Importación cancelada; se conservan las páginas añadidas y el índice puede estar incompleto." : error instanceof Error ? error.message : "No se pudo importar el archivo");
    } finally {
      recordDuration("import-total", importStartedAt);
      importBusy.current = false;
      setImporting(false); setIndexing(false);
      if (taskController.current === controller) taskController.current = null;
    }
  }, [commitState, fitPageSet, history.present.pages, startup]);

  const completeTextIndex = async () => {
    if (importBusy.current) return;
    const generation = epoch.current;
    const controller = new AbortController(); taskController.current = controller;
    importBusy.current = true; setIndexing(true); setImporting(true);
    try {
      for (const source of sources.filter((item) => item.indexComplete === false)) {
        const document = documents.get(source.id);
        if (!document) continue;
        const pages = state.pages.filter((page) => page.sourceId === source.id);
        for (let index = 0; index < pages.length; index++) {
          controller.signal.throwIfAborted();
          const page = pages[index];
          const blocks = await extractPdfTextBlocks(document, page);
          if (generation !== epoch.current) return;
          controller.signal.throwIfAborted();
          const enrich = (current: EditorState) => setPageTextBlocks(current, page.id, "pdf", blocks);
          setHistory((current) => ({ past: current.past.map(enrich), present: enrich(current.present), future: current.future.map(enrich) }));
          setOriginalState((current) => current ? enrich(current) : current);
          setImportStatus(`Indexando ${index + 1}/${pages.length}`);
          await new Promise((resolve) => setTimeout(resolve, 0));
        }
        setSources((current) => current.map((item) => item.id === source.id ? { ...item, indexComplete: true } : item));
      }
      setImportStatus("Índice de búsqueda completo");
    } catch (error) {
      if (generation === epoch.current) setImportStatus(controller.signal.aborted ? "Indexación cancelada; búsqueda parcial" : "No se pudo completar el índice. Puedes volver a intentarlo.");
    } finally { importBusy.current = false; setIndexing(false); setImporting(false); if (taskController.current === controller) taskController.current = null; }
  };

  const arrangePagesGrid = useCallback(() => {
    const prepared = prepareSpatialDocument(state, undefined, true);
    commitState(() => prepared.state);
    fitPageSet(prepared.pages);
    setStatus("Cuadrícula y árbol organizados de izquierda a derecha y de arriba abajo");
  }, [state, commitState, fitPageSet]);

  const refreshRecent = useCallback(() => void loadRecentProjects().then(setRecentProjects).catch((error) => reportError("Recientes", error)), [reportError]);

  const saveProjectFile = useCallback(async (asCopy = false) => {
    if (saveController.current) return;
    setProjectError("");
    const generation = epoch.current;
    const project: EditorProject = { id: asCopy ? crypto.randomUUID() : projectId, version: 1, name: projectName, state, sources, savedState: state, originalState: originalState ?? state, updatedAt: new Date().toISOString() };
    const picker = (window as Window & { showSaveFilePicker?: (options: { suggestedName: string }) => Promise<{ createWritable: () => Promise<{ write: (data: Blob) => Promise<void>; close: () => Promise<void>; abort?: () => Promise<void> }> }> }).showSaveFilePicker;
    setSavingProject(true);
    const controller = new AbortController(); saveController.current = controller;
    try {
      const desktopSave = window.clinDesktop?.saveProjectFile;
      const handle = !desktopSave && picker ? await picker({ suggestedName: safeFilename(projectName, ".clin") }) : null;
      setStatus("Preparando proyecto editable…");
      const bytes = await encodeProjectAsync(project, controller.signal);
      if (generation !== epoch.current) return;
      if (desktopSave) {
        controller.signal.throwIfAborted();
        if (!await desktopSave(safeFilename(projectName, ".clin"), bytes)) {
          if (generation === epoch.current) setStatus("Guardado cancelado");
          return;
        }
        if (generation !== epoch.current) return;
        setManualCheckpoint(state);
        if (asCopy) setProjectId(project.id!);
        setStatus("Archivo de proyecto guardado");
      } else if (handle) {
        const writable = await handle.createWritable();
        const abortWrite = () => { void writable.abort?.().catch(() => undefined); };
        controller.signal.addEventListener("abort", abortWrite, { once: true });
        try {
          controller.signal.throwIfAborted();
          await writable.write(new Blob([Uint8Array.from(bytes).buffer]));
          controller.signal.throwIfAborted();
          await writable.close();
        } catch (error) { await writable.abort?.().catch(() => undefined); throw error; }
        finally { controller.signal.removeEventListener("abort", abortWrite); }
        if (generation !== epoch.current) return;
        setManualCheckpoint(state);
        if (asCopy) setProjectId(project.id!);
        setStatus("Archivo de proyecto guardado");
      } else {
        downloadBytes(bytes, safeFilename(projectName, ".clin"), "application/vnd.clin.project");
        setStatus("Descarga del proyecto iniciada; confirma su guardado en el diálogo de destino.");
      }
      await saveRecentProject(project);
      refreshRecent();
    } catch (error) {
      if (generation === epoch.current) {
        if (error instanceof DOMException && error.name === "AbortError") setStatus("Guardado cancelado");
        else { setProjectError(`No se pudo guardar el proyecto. ${readableError(error)}`); reportError("Guardar proyecto", error); }
      }
    } finally { setSavingProject(false); if (saveController.current === controller) saveController.current = null; }
  }, [originalState, projectId, projectName, refreshRecent, sources, state, savingProject, reportError]);

  const openProjectFile = useCallback(async (file: File) => {
    setProjectError("");
    if (file.size === 0) {
      setProjectError("El archivo .clin está vacío (0 bytes). Comprueba si el proyecto sigue disponible en Recientes o en la recuperación local.");
      return;
    }
    if (file.size > 600 * 1024 * 1024) return setStatus("El proyecto supera el límite de 600 MB");
    const generation = epoch.current;
    projectController.current?.abort();
    const controller = new AbortController(); projectController.current = controller;
    setOpeningProject(true); setStatus("Preparando proyecto editable…");
    try {
      const project = await decodeProjectAsync(new Uint8Array(await file.arrayBuffer()), controller.signal);
      if (generation !== epoch.current) return;
      await requestProjectOpen(project);
      await saveRecentProject(project);
      refreshRecent();
    } catch (error) {
      if (!controller.signal.aborted) {
        const message = `No se pudo abrir el proyecto. ${readableError(error)}`;
        setProjectError(message);
        setStatus(message);
      } else if (generation === epoch.current) setStatus("Apertura cancelada");
    } finally { if (projectController.current === controller) { projectController.current = null; setOpeningProject(false); } }
  }, [refreshRecent, requestProjectOpen]);

  useEffect(() => {
    if (!hydrated || !preferencesReady || !window.clinDesktop) return;
    return window.clinDesktop.onOpenFiles((entries) => {
      const files = entries.map((entry) => new File(
        [entry.bytes],
        entry.name,
        { type: entry.type },
      ));
      const project = files.find((file) => /\.(clin|limpio)$/i.test(file.name));
      if (project) {
        void openProjectFile(project);
        return;
      }
      void importFiles(files);
    });
  }, [hydrated, preferencesReady, importFiles, openProjectFile]);

  const createNewProject = useCallback(() => {
    workspaceHasChanges.current = false;
    epoch.current++; captureController.current?.abort(); setCaptureMode(false); setCropPageId(null); taskController.current?.abort(); ocrController.current?.abort(); exportController.current?.abort(); projectController.current?.abort(); saveController.current?.abort(); setRecovery(null); setPendingOpen(null); setOpeningProject(false); setExportOpen(false); setExportSnapshot(null); setActivePageId(null);
    setProjectId(crypto.randomUUID());
    setProjectName("Sin título");
    setSources([]);
    setDocuments(new Map());
    setHistory(createHistory(createEditorState()));
    setManualCheckpoint(null);
    setOriginalState(null);
    setEnvironment("canvas");
    setCamera({ x: 120, y: 80, zoom: 0.72 });
    setNewProjectOpen(false);
    setStatus("Proyecto nuevo");
    void clearAutosave().catch((error) => reportError("Recuperación", error));
  }, []);

  const clearWorkspace = useCallback(() => {
    workspaceHasChanges.current = false;
    epoch.current++; captureController.current?.abort(); setCaptureMode(false); setCropPageId(null); taskController.current?.abort(); ocrController.current?.abort(); exportController.current?.abort(); projectController.current?.abort(); saveController.current?.abort(); setRecovery(null); setPendingOpen(null); setOpeningProject(false); setExportOpen(false); setExportSnapshot(null); setActivePageId(null);
    setSources([]);
    setDocuments(new Map());
    setHistory(createHistory(createEditorState()));
    setCamera({ x: 120, y: 80, zoom: 0.72 });
    setWhiteboardMode(false);
    setManualCheckpoint(null);
    setOriginalState(null);
    setEnvironment("canvas");
    setCleanupAction(null);
    setStatus("Espacio vacío");
    void clearAutosave().catch((error) => reportError("Recuperación", error));
  }, []);

  const performCleanup = useCallback((action: CleanupAction) => {
    if (action === "reload" && manualCheckpoint) {
      setHistory(createHistory(manualCheckpoint));
      window.setTimeout(() => fitPageSet(manualCheckpoint.pages), 0);
      setStatus("Último guardado recuperado");
    } else if (action === "strokes") {
      commitState(clearStrokeAnnotations);
      setStatus("Trazos borrados");
    } else if (action === "annotations") {
      commitState(clearAnnotationObjects);
      setStatus("Anotaciones borradas");
    } else if (action === "restore" && originalState) {
      setHistory(createHistory(originalState));
      window.setTimeout(() => fitPageSet(originalState.pages), 0);
      setStatus("Documentos restaurados");
    } else if (action === "empty") {
      clearWorkspace();
    }
    setCleanupAction(null);
  }, [clearWorkspace, commitState, fitPageSet, manualCheckpoint, originalState]);

  const requestCleanup = useCallback((action: CleanupAction) => {
    if (!confirmationPreferences[action]) performCleanup(action);
    else {
      setRememberCleanupChoice(false);
      setCleanupAction(action);
    }
  }, [confirmationPreferences, performCleanup]);

  const confirmCleanup = useCallback(() => {
    if (!cleanupAction) return;
    if (rememberCleanupChoice) {
      const next = { ...confirmationPreferences, [cleanupAction]: false };
      setConfirmationPreferences(next);
      window.localStorage.setItem(confirmationStorageKey, JSON.stringify(next));
    }
    performCleanup(cleanupAction);
  }, [cleanupAction, confirmationPreferences, performCleanup, rememberCleanupChoice]);

  const resetCleanupConfirmations = useCallback(() => {
    const next: Record<CleanupAction, boolean> = { reload: true, strokes: true, annotations: true, restore: true, empty: true };
    setConfirmationPreferences(next);
    window.localStorage.setItem(confirmationStorageKey, JSON.stringify(next));
    setStatus("Confirmaciones restablecidas");
  }, []);

  const chooseExportDirectory = useCallback(async () => {
    try {
      const directory = await chooseOutputDirectory();
      setOutputDirectory(directory);
      setStatus(`Destino: ${directory.name}`);
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") return;
      reportError("Carpeta de exportación", error);
    }
  }, [reportError]);

  const saveExportBytes = useCallback(async (bytes: Uint8Array, filename: string, type: string) => {
    exportController.current?.signal.throwIfAborted();
    if (outputDirectory) { await writeBytesToDirectory(outputDirectory, bytes, filename, type, exportController.current?.signal); return "Archivo guardado"; }
    downloadBytes(bytes, filename, type);
    return "Descarga iniciada; confirma el destino para guardar el archivo";
  }, [outputDirectory]);


  const exportCanvasAsImage = useCallback(async () => {
    setStatus("Exportando lienzo…");
    try {
      const bytes = await exportCanvasImage(state, documents, "png");
      downloadBytes(bytes, safeFilename(`${projectName}-lienzo`, ".png"), "image/png");
      setStatus("Descarga del lienzo iniciada");
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "No se pudo exportar el lienzo");
    }
  }, [documents, projectName, state]);

  const captureRegion = useCallback(async (region: Bounds) => {
    setCaptureMode(false);
    captureController.current?.abort();
    const controller = new AbortController(); captureController.current = controller;
    const generation = epoch.current;
    setStatus("Preparando captura PNG…");
    try {
      const bytes = await exportCanvasImage(state, documents, "png", region, controller.signal);
      if (generation !== epoch.current || controller.signal.aborted) return;
      downloadBytes(bytes, safeFilename(`${projectName}-captura`, ".png"), "image/png");
      setStatus("Descarga de la captura iniciada");
    } catch (error) { if (generation === epoch.current && !controller.signal.aborted) reportError("Captura", error); }
    finally { if (captureController.current === controller) captureController.current = null; }
  }, [state, documents, projectName, reportError]);

  const changeEnvironment = (next: AppEnvironment) => {
    const page = state.pages.find((item) => item.id === activePageId) ?? state.pages.find((item) => state.selectedPageIds.includes(item.id));
    if (page) { setActivePageId(page.id); if (next === "canvas") fitPageSet([page]); }
    setEnvironment(next);
  };

  const prepareExportScope = useCallback((groupId: string | null, selection: boolean, begin = false) => {
    setExportError("");
    const previous = exportPreparation.current;
    const base = !begin && previous && history.present === previous.prepared ? previous.base : history;
    const ids = orderedPagesForExport(base.present, groupId, selection ? base.present.selectedPageIds : undefined).map((page) => page.id);
    const prepared = prepareSpatialDocument(base.present, ids);
    if (prepared.state !== base.present) workspaceHasChanges.current = true;
    const nextHistory = commit(base, prepared.state);
    setHistory(nextHistory);
    exportPreparation.current = { base, prepared: nextHistory.present };
    setExportSnapshot(nextHistory.present);
    setExportGroupId(groupId); setExportSelectionOnly(selection);
    setEnvironment("canvas"); fitPageSet(prepared.pages);
    setStatus(prepared.arranged ? "Páginas acomodadas en cuadrícula; árbol sincronizado para exportar" : "Distribución conservada; árbol sincronizado con el canvas");
    return prepared.state;
  }, [history, fitPageSet]);

  const openExport = useCallback((groupId: string | null = null) => {
    if (exporting) return;
    const group = groupId ? state.groups.find((item) => item.id === groupId) : null;
    const selection = !groupId && state.selectedPageIds.length > 0;
    prepareExportScope(groupId, selection, true);
    setExportOutput(group?.export.format === "images" ? group.export.imageFormat : "pdf");
    setExportDocumentName(group?.export.filename || (selection ? `${projectName}-selección` : projectName));
    setExportMode(group?.export.compression ?? "editable");
    setExportOpen(true);
  }, [projectName, state, prepareExportScope, exporting]);

  const printDocument = useCallback(() => { openExport(); setExportOutput("print"); }, [openExport]);
  const openQuickPdfExport = useCallback((mode: ExportMode, protect = false) => {
    openExport(); setExportMode(mode); if (protect) setProtectExport(true); setQuickTool(null);
  }, [openExport]);

  const recognizeSelectedPages = useCallback(async (requestedPages?: EditorPage[]) => {
    const pages = requestedPages ?? state.pages.filter((page) => state.selectedPageIds.includes(page.id));
    if (!pages.length || ocrController.current) return;
    const generation = epoch.current;
    const controller = new AbortController();
    ocrController.current = controller;
    setRecognizingText(true);
    setOcrProgress({ value: 0, label: "Guardando copia de seguridad…", backup: false });
    let completed = 0;
    try {
      // A separate recent project survives subsequent automatic recovery writes.
      await abortable(saveRecentProject({ id: crypto.randomUUID(), version: 1, name: `${projectName} · copia antes de OCR`, state, sources, savedState: state, originalState: originalState ?? state, updatedAt: new Date().toISOString() }), controller.signal);
      controller.signal.throwIfAborted();
      refreshRecent();
      setOcrProgress({ value: 0, label: "Preparando reconocimiento local…", backup: true });
      for (let index = 0; index < pages.length; index += 1) {
        controller.signal.throwIfAborted();
        const page = pages[index];
        const document = documents.get(page.sourceId);
        if (!document) throw new Error(`No se pudo abrir ${page.name}.`);
        setOcrProgress({ value: index / pages.length * 100, label: `Página ${index + 1} de ${pages.length}`, backup: true });
        const blocks = await recognizePageText(document, page, (value) => {
          if (generation === epoch.current && !controller.signal.aborted) setOcrProgress({ value: (index + Math.max(0, Math.min(1, value))) / pages.length * 100, label: `Página ${index + 1} de ${pages.length} · ${page.name}`, backup: true });
        }, controller.signal);
        controller.signal.throwIfAborted();
        if (generation !== epoch.current) return;
        commitState((current) => {
          const next = setPageTextBlocks(current, page.id, "ocr", blocks);
          return { ...next, pages: next.pages.map((item) => item.id === page.id ? { ...item, ocrIndexed: true } : item) };
        });
        completed++;
      }
      setStatus(`Texto reconocido en ${completed} páginas`);
    } catch (error) {
      if (generation === epoch.current) setStatus(controller.signal.aborted ? `Escaneo cancelado. ${completed} páginas procesadas; puedes seguir trabajando.` : `OCR detenido: ${error instanceof Error ? error.message : "No se pudo completar el escaneo"}`);
    } finally {
      void terminateOcrWorker().catch(() => undefined);
      if (ocrController.current === controller) {
        ocrController.current = null;
        setRecognizingText(false);
      }
    }
  }, [commitState, documents, state, sources, originalState, projectName, refreshRecent]);

  useEffect(() => {
    if (!searchQuery.trim() || importing || indexing || recognizingText) return;
    let cancelled = false;
    const generation = epoch.current;
    const legacyPages = state.pages.filter((page) => state.textBlocks.some((block) => block.pageId === page.id && block.source === "pdf" && !block.characterBoxes));
    void (async () => {
      for (const page of legacyPages) {
        if (cancelled) return;
        const document = documents.get(page.sourceId);
        if (!document) continue;
        const blocks = await extractPdfTextBlocks(document, page).catch(() => null);
        if (cancelled || generation !== epoch.current) return;
        if (blocks) replaceState((current) => setPageTextBlocks(current, page.id, "pdf", blocks));
      }
    })();
    return () => { cancelled = true; };
  }, [searchQuery, importing, indexing, recognizingText, state.pages, state.textBlocks, documents, replaceState]);

  useEffect(() => {
    if (!searchQuery.trim()) { searchScanAttempt.current = ""; return; }
    if (importing || indexing || recognizingText) return;
    const attempt = `${projectId}:${searchQuery.trim().toLocaleLowerCase("es")}`;
    if (searchScanAttempt.current === attempt) return;
    const timer = window.setTimeout(() => {
      searchScanAttempt.current = attempt;
      const missing = state.pages.filter((page) => !page.ocrIndexed && !state.textBlocks.some((block) => block.pageId === page.id && block.text.trim()));
      if (missing.length) void recognizeSelectedPages(missing);
    }, 900);
    return () => window.clearTimeout(timer);
  }, [searchQuery, projectId, importing, indexing, recognizingText, state.pages, state.textBlocks, recognizeSelectedPages]);

  const exportDocument = useCallback(async () => {
    if (!exportPages.length || exporting) return;
    try {
      assertExportSources(exportPages, sources.map((source) => source.id));
      assertExportSources(exportPages, documents.keys());
    } catch (error) { setExportError(error instanceof Error ? error.message : "No se pudo comprobar los originales."); reportError("Exportación", error); return; }
    const state = exportState;
    const generation = epoch.current;
    const controller = new AbortController();
    exportController.current = controller;
    const exportStartedAt = performance.now();
    let result = "Archivo generado";
    setExportOpen(false);
    setExporting(true);
    setProgress(0.04);
    setExportStatus("Exportando…");
    try {
      const pageIds = exportSelectionOnly ? state.selectedPageIds : undefined;
      const exportOptions = { includeBoard: includeBoardExport, pageIds, orderedIds: exportPages.map((page) => page.id), signal: controller.signal };
      if (exportOutput === "print") {
        setExportStatus("Preparando impresión…");
        await printEditorPages(state, documents, exportGroupId, exportOptions);
        result = "Documento preparado para el diálogo de impresión";
      } else if (exportOutput === "png" || exportOutput === "jpeg") {
        const format = exportOutput;
        const pages = exportPages;
        if (pages.length === 1) {
          const bytes = await exportPageImage(state, documents, pages[0].id, format, exportOptions);
          const extension = format === "jpeg" ? ".jpg" : ".png";
          result = await saveExportBytes(bytes, safeFilename(exportDocumentName, extension), format === "jpeg" ? "image/jpeg" : "image/png");
        } else {
          const bytes = await exportPageImages(state, documents, exportGroupId, format, setProgress, exportOptions);
          result = await saveExportBytes(bytes, safeFilename(exportDocumentName, ".zip"), "application/zip");
        }
      } else {
        if (protectExport && (!pdfPassword || pdfPassword !== pdfPasswordConfirmation)) {
          throw new Error(!pdfPassword ? "Introduce una contraseña para el PDF." : "Las contraseñas no coinciden.");
        }
        if (signExport && !certificate) throw new Error("Selecciona un certificado P12 o PFX.");
        const requiresSafeFlattening = exportPages.some((page) => page.crop) || state.annotations.some((annotation) => annotation.type === "replacement");
        const effectiveMode = exportMode === "editable" && requiresSafeFlattening ? "balanced" : exportMode;
        let bytes = new Uint8Array(effectiveMode === "editable"
          ? await outputWorker({ kind: "editable", state, sources: sources.filter((source) => exportPages.some((page) => page.sourceId === source.id)), options: { includeBoard: includeBoardExport, orderedIds: exportOptions.orderedIds } }, controller.signal)
          : await exportRasterPdf(state, documents, effectiveMode, setProgress, exportGroupId, exportOptions));
        controller.signal.throwIfAborted();
        if (protectExport) {
          setExportStatus("Protegiendo PDF…");
          bytes = new Uint8Array(await protectPdf(bytes, {
            userPassword: pdfPassword,
            ownerPassword: ownerPassword || undefined,
            allowPrint,
            allowCopy,
            allowModify,
          }, controller.signal));
        }
        controller.signal.throwIfAborted();
        if (signExport && certificate) {
          setExportStatus("Firmando PDF…");
          bytes = new Uint8Array(await signPdf(bytes, {
            certificate,
            certificatePassword,
            reason: signatureReason,
            location: signatureLocation,
            documentPassword: protectExport ? (ownerPassword || pdfPassword) : undefined,
          }, controller.signal));
        }
        result = await saveExportBytes(bytes, safeFilename(exportDocumentName, ".pdf"), "application/pdf");
      }
      if (result === "Archivo generado") controller.signal.throwIfAborted();
      if (generation === epoch.current) { setProgress(1); setExportStatus(result); setStatus(result); }
    } catch (error) {
      if (generation === epoch.current) {
        if (controller.signal.aborted) { setExportStatus("Exportación cancelada"); setStatus("Exportación cancelada"); }
        else reportError("Exportación", error);
      }
    } finally {
      recordDuration("export", exportStartedAt);
      setExporting(false);
      if (exportController.current === controller) exportController.current = null;
    }
  }, [exportState, exportPages, exporting, allowCopy, allowModify, allowPrint, certificate, certificatePassword, documents, exportDocumentName, exportGroupId, exportMode, exportOutput, exportSelectionOnly, includeBoardExport, ownerPassword, pdfPassword, pdfPasswordConfirmation, protectExport, reportError, saveExportBytes, signatureLocation, signatureReason, signExport, sources, state]);

  const commands: EditorCommand[] = [
    { id: "hide-interface", label: "Ocultar la interfaz", shortcut: "º", checked: interfaceHidden, unavailable: environment === "dashboard" ? "Abre Canvas o Lector" : undefined, run: () => setInterfaceHidden(value => !value) },
    { id: "zen", label: "Modo Zen", checked: zen, run: () => { void changeZen(!zen); } },
    { id: "collapse-groups", label: "Colapsar / desplegar grupos", shortcut: "Tab", unavailable: !collapseTargets(state).length ? "Selecciona un grupo o una de sus páginas" : undefined, run: () => { workspaceHasChanges.current = true; replaceState(toggleGroupCollapse); } },
    { id: "settings", label: "Configuración y preferencias", shortcut: "Ctrl+,", run: () => setGeneralSettingsOpen(true) },
    { id: "open", label: "Importar PDF o imagen", shortcut: "Ctrl+O", run: () => pdfInputRef.current?.click() },
    { id: "save", label: "Guardar proyecto", shortcut: "Ctrl+S", run: () => { void saveProjectFile(); } },
    { id: "export", label: "Exportar documento", shortcut: "Ctrl+E", unavailable: !state.pages.length ? "Añade páginas" : undefined, run: () => openExport() },
    { id: "print", label: "Imprimir", shortcut: "Ctrl+P", unavailable: !state.pages.length ? "Añade páginas" : undefined, run: printDocument },
    { id: "image", label: "Exportar páginas como imagen PNG", unavailable: !state.pages.length ? "Añade páginas" : undefined, run: () => { openExport(); setExportOutput("png"); } },
    { id: "crop", label: "Recortar página (reversible)", unavailable: state.selectedPageIds.length !== 1 ? "Selecciona una sola página" : undefined, run: () => setCropPageId(state.selectedPageIds[0]) },
    { id: "capture", label: "Capturar región del canvas como PNG", unavailable: !hasCanvasContent ? "Añade contenido" : undefined, run: () => { setEnvironment("canvas"); setCaptureMode(true); setStatus("Arrastra para marcar la región. Esc cancela."); } },
    { id: "group", label: "Agrupar selección", shortcut: "Ctrl+G", unavailable: !explicitSelection(state).length ? "Selecciona páginas, grupos o capas" : undefined, run: () => commitState((current) => groupSelectionInGrid(current, crypto.randomUUID())) },
    { id: "duplicate", label: "Duplicar selección", unavailable: !explicitSelection(state).length ? "Selecciona contenido" : undefined, run: () => commitState((current) => duplicateSelection(current)) },
    { id: "ungroup", label: "Desagrupar selección", shortcut: "Ctrl+Shift+G", unavailable: !explicitSelection(state).length ? "Selecciona contenido agrupado" : undefined, run: () => commitState(ungroupSelection) },
    { id: "grid", label: "Organizar documento en cuadrícula", unavailable: !state.pages.length ? "Añade páginas" : undefined, run: arrangePagesGrid },
    { id: "home", label: "Ir al inicio", run: () => setEnvironment("dashboard") },
  ];
  const commandsRef = useRef(commands); commandsRef.current = commands;
  const activeCropPage = cropPageId ? state.pages.find((page) => page.id === cropPageId) : undefined;

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (ocrController.current) return;
      const target = event.target as HTMLElement | null;
      const editingText = target?.closest("input, textarea, [contenteditable]:not([contenteditable=false])");
      const command = event.ctrlKey || event.metaKey;
      const key = event.key.toLowerCase();
      const runCommand = (id: string) => { event.preventDefault(); const action = commandsRef.current.find((item) => item.id === id); if (action && !action.unavailable) action.run(); };
      if (command && key === ",") { runCommand("settings"); return; }
      if (command && key === "k") { event.preventDefault(); setCommandsOpen((open) => !open); return; }
      if (target?.closest('[role="dialog"], [role="alertdialog"]')) return;
      if (presentationOpen) return;
      if (command && key === "f" && environment !== "dashboard") {
        event.preventDefault();
        if (environment === "canvas") { setLeftOpen(true); setRailTab("search"); setSearchFocusRequest((value) => value + 1); }
        return;
      }
      if (editingText) return;
      if (!command && !event.altKey && key === "º" && environment !== "dashboard") { runCommand("hide-interface"); return; }
      if (event.key === "Tab" && !event.shiftKey && !command && !event.altKey && environment === "canvas" && (!target?.closest('button, a, [role="menu"], [role="separator"]') || Boolean(target?.closest('[data-collapse-target]'))) && !commandsRef.current.find(c => c.id === "collapse-groups")?.unavailable) { runCommand("collapse-groups"); return; }
      if (command && key === "a" && environment !== "dashboard") {
        event.preventDefault();
        replaceState((current) => applySelection(current, [
          ...current.groups.map((item) => ({ kind: "group" as const, id: item.id })),
          ...current.pages.map((item) => ({ kind: "page" as const, id: item.id })),
          ...current.annotations.map((item) => ({ kind: "annotation" as const, id: item.id })),
        ]));
        return;
      }
      if (command && key === "g") { runCommand(event.shiftKey ? "ungroup" : "group"); return; }
      if (command && key === "p") { runCommand("print"); return; }
      if (command && event.shiftKey && key === "s") { event.preventDefault(); saveProjectFile(true); }
      else if (command && key === "s") { event.preventDefault(); saveProjectFile(); }
      else if (command && key === "z") { event.preventDefault(); setHistory((current) => event.shiftKey ? redo(current) : undo(current)); }
      else if (command && key === "o") { event.preventDefault(); pdfInputRef.current?.click(); }
      else if (command && key === "e") { event.preventDefault(); openExport(); }
      else if (command && key === "n") { event.preventDefault(); setNewProjectOpen(true); }
      else if (!editingText && event.code === "Space" && !toolBeforeSpace.current) {
        event.preventDefault();
        toolBeforeSpace.current = state.tool;
        replaceState((current) => setTool(current, "hand"));
      } else if (!editingText && !command && shortcutTools[key]) {
        event.preventDefault();
        replaceState((current) => setTool(current, shortcutTools[key]));
      } else if (!editingText && (event.key === "Delete" || event.key === "Backspace")) {
        event.preventDefault();
        commitState((current) => {
          const next = deleteAnnotations(deletePages(current, current.selectedPageIds), current.selectedAnnotationIds ?? (current.selectedAnnotationId ? [current.selectedAnnotationId] : []));
          return applySelection(next, []);
        });
      } else if (!editingText && event.key === "Escape") {
        setCaptureMode(false); captureController.current?.abort();
        replaceState((current) => selectGroup(selectPages(selectAnnotation(setTool(current, "select"), null), []), null));
      }
    };
    const handleKeyUp = (event: KeyboardEvent) => {
      if (event.code === "Space" && toolBeforeSpace.current) {
        const tool = toolBeforeSpace.current;
        toolBeforeSpace.current = null;
        replaceState((current) => setTool(current, tool));
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    window.addEventListener("keyup", handleKeyUp);
    return () => { window.removeEventListener("keydown", handleKeyDown); window.removeEventListener("keyup", handleKeyUp); };
  }, [environment, presentationOpen, commitState, openExport, replaceState, saveProjectFile, state.selectedAnnotationId, state.selectedGroupId, state.selectedPageIds, state.selectedAnnotationIds, state.tool]);

  const selectedPages = state.selectedPageIds;
  const exportExtension = exportOutput === "pdf" ? ".pdf" : exportOutput === "print" ? "" : exportPages.length === 1 ? (exportOutput === "jpeg" ? ".jpg" : ".png") : ".zip";
  const quickPageIds = state.selectedPageIds.length > 1 ? state.selectedPageIds : state.pages.map((page) => page.id);

  const focusTextBlock = (block: DocumentTextBlock) => {
    const page = state.pages.find((candidate) => candidate.id === block.pageId);
    if (!page) return;
    setFocusedTextBlockId(block.id);
    replaceState((current) => selectPages(current, [page.id]));
    setCamera(fitBounds({
      x: page.x + block.x,
      y: page.y + block.y,
      width: Math.max(block.width, 380),
      height: Math.max(block.height, 72),
    }, { width: window.innerWidth, height: window.innerHeight - 52 }, 180));
  };

  const rail = (
    <PageRail
      tab={railTab}
      onTabChange={setRailTab}
      searchFocusRequest={searchFocusRequest}
      searchQuery={searchQuery}
      onSearchChange={setSearchQuery}
      onSelectItem={(item, rows, anchor, modifiers) => replaceState((current) => selectTreeItem(current, item, rows, anchor, modifiers))}
      state={state}
      sources={sources}
      onSelectPages={(ids) => { if (ids.length) setActivePageId(ids[0]); replaceState((current) => selectPages(current, ids)); }}
      onSelectGroup={(id) => replaceState((current) => selectGroup(current, id))}
      onSelectAnnotation={(id) => replaceState((current) => selectAnnotation(current, id))}
      onReorder={(ids) => commitState((current) => reorderSpatialDocument(current, ids))}
      onFocusPage={(page) => { setActivePageId(page.id); fitPageSet([page]); }}
      onFocusTextBlock={focusTextBlock}
      onCreateGroup={(name) => commitState((current) => groupSelectionInGrid(current, crypto.randomUUID(), name))}
      onRenameGroup={(id, name) => commitState((current) => renameGroup(current, id, name))}
      onRenamePage={(id, name) => commitState((current) => updatePageName(current, id, name))}
      onMoveToGroup={(pageIds, groupId) => commitState((current) => movePagesToGroup(current, pageIds, groupId))}
      onToggleGroup={(id) => { workspaceHasChanges.current = true; replaceState(current => toggleGroupCollapse(current, [id])); }}
      onUngroup={() => commitState(ungroupSelection)}
      onDeleteGroup={(id) => commitState((current) => deleteGroup(current, id))}
      onCreateReplacement={(block) => {
        const page = state.pages.find((candidate) => candidate.id === block.pageId);
        if (page) fitPageSet([page]);
        commitState((current) => addAnnotation(current, createReplacement(block, block.text)));
      }}
    />
  );

  const inspector = (
    <Inspector
      state={state}
      onRotate={(delta) => commitState((current) => rotatePages(current, current.selectedPageIds, delta))}
      onDuplicate={() => commitState((current) => duplicateSelection(current))}
      onDeletePages={() => commitState((current) => deletePages(current, current.selectedPageIds))}
      onRenamePage={(id, name) => commitState((current) => updatePageName(current, id, name))}
      onAlignPages={(alignment) => commitState((current) => alignPages(current, current.selectedPageIds, alignment))}
      onArrangePages={(direction) => commitState((current) => {
        const arranged = arrangePagesInDirection(current, current.selectedPageIds, direction);
        return prepareSpatialDocument(arranged, current.selectedPageIds).state;
      })}
      onUpdateAnnotation={(id, patch) => commitState((current) => updateAnnotation(current, id, patch))}
      onDeleteAnnotation={(id) => commitState((current) => deleteAnnotations(current, [id]))}
      onRenameGroup={(id, name) => commitState((current) => renameGroup(current, id, name))}
      onSetGroupOrder={(id, mode) => commitState((current) => setGroupOrderMode(current, id, mode))}
      onUpdateGroupExport={(id, patch) => commitState((current) => updateGroupExport(current, id, patch))}
      onDeleteGroup={(id) => commitState((current) => deleteGroup(current, id))}
      onExportGroup={openExport}
      onRecognizePages={() => void recognizeSelectedPages()}
      recognizingText={recognizingText}
    />
  );

  if (!hydrated) {
    return <div className="grid h-dvh place-items-center bg-background" aria-label="Cargando editor">Preparando el espacio de trabajo…</div>;
  }

  return (
    <ViewChrome><TooltipProvider delay={450}>
      <CommandMenu open={commandsOpen} onOpenChange={setCommandsOpen} commands={commands} />
      {activeCropPage && <CropDialog key={activeCropPage.id} page={activeCropPage} document={documents.get(activeCropPage.sourceId)} onClose={() => setCropPageId(null)} onApply={(rect) => { commitState((current) => cropPage(current, activeCropPage.id, rect)); setCropPageId(null); setStatus(rect ? "Recorte aplicado; puedes deshacerlo" : "Página completa recuperada"); }} />}
      <div className="editor-shell relative flex h-dvh min-h-[520px] flex-col overflow-hidden bg-background text-foreground" onDragOver={(event) => event.preventDefault()} onDrop={(event) => { event.preventDefault(); if (recognizingText) return; const files = [...event.dataTransfer.files]; const project = files.find((file) => /\.(clin|limpio)$/i.test(file.name)); if (project) void openProjectFile(project); else void importFiles(files); }}>
        <input ref={pdfInputRef} data-testid="pdf-input" type="file" accept="application/pdf,image/png,image/jpeg,image/webp,.pdf,.png,.jpg,.jpeg,.webp" multiple hidden disabled={!hydrated} onChange={(event) => { void importFiles([...(event.target.files ?? [])]); event.target.value = ""; }} />
        {projectError && <div role="alert" className="absolute bottom-20 left-3 right-3 z-50 flex items-center justify-between gap-3 rounded-md border border-destructive bg-background p-3 text-sm text-destructive shadow-lg">
          <span>{projectError}</span><Button variant="ghost" size="sm" onClick={() => setProjectError("")}>Cerrar</Button>
        </div>}
        <input ref={projectInputRef} data-testid="project-input" type="file" accept=".clin,.limpio,application/vnd.clin.project,application/zip" hidden disabled={!hydrated} onChange={(event) => { if (event.target.files?.[0]) void openProjectFile(event.target.files[0]); event.target.value = ""; }} />
        <div hidden={!(showStatusBar && !chromeHidden) && !(importing || exporting || recognizingText || openingProject || savingProject || saveStatus.startsWith("Error") || /error|no se pudo/i.test(status))} className={`${showStatusBar && !chromeHidden ? "" : "absolute bottom-20 left-3 right-3 z-50 rounded-md shadow-lg"} editor-status order-last flex min-h-7 flex-wrap items-center gap-3 border-t border-border bg-panel px-4 py-1 text-[11px] text-muted-foreground`} role="status">
          <span>{saveStatus}</span>
          <span>{importing ? importStatus : exporting ? exportStatus : status}</span>
          {saveStatus.startsWith("Error") && <button type="button" className="underline" onClick={() => setSaveRetry((value) => value + 1)}>Reintentar recuperación</button>}
          {recognizingText && <button type="button" className="underline" onClick={() => { ocrController.current?.abort(); setStatus("Cancelando OCR…"); }}>Cancelar OCR</button>}
          {openingProject && <button type="button" className="underline" onClick={() => { epoch.current++; captureController.current?.abort(); setCaptureMode(false); setCropPageId(null); projectController.current?.abort(); setOpeningProject(false); setStatus("Apertura cancelada"); }}>Cancelar apertura</button>}
          {savingProject && <button type="button" className="underline" onClick={() => saveController.current?.abort()}>Cancelar preparación del proyecto</button>}
          {importing && <button type="button" className="underline" onClick={() => taskController.current?.abort()}>Cancelar importación</button>}
          {!importing && sources.some((source) => source.indexComplete === false) && <button type="button" className="underline" onClick={() => void completeTextIndex()}>Completar índice</button>}
          {(indexing || sources.some((source) => source.indexComplete === false)) && <span>Búsqueda parcial{indexing ? ": indexando páginas" : ": quedan páginas sin indexar"}</span>}
          {exporting && <><span>Exportando {Math.round(progress * 100)}%</span><button type="button" className="underline" onClick={() => { exportController.current?.abort(); setExportStatus("Cancelando exportación…"); }}>Cancelar exportación</button></>}
          <span className="ml-auto">{state.selectedPageIds.length} páginas seleccionadas · {whiteboardMode ? "Destino de trazos: pizarra" : "Destino de trazos: página"}</span>
        </div>
        {recovery && <div className="flex flex-wrap items-center gap-3 border-b border-border bg-muted px-3 py-2 text-xs">
          <span>Recuperación disponible: {recovery.name}. Continuar sustituye el espacio actual.</span>
          <Button size="sm" onClick={() => { void requestProjectOpen(recovery).catch((error) => reportError("Recuperación", error)); }}>Continuar proyecto recuperado</Button>
          <Button size="sm" variant="outline" onClick={() => { setRecovery(null); if (!hasCanvasContent) void clearAutosave().catch((error) => reportError("Recuperación", error)); }}>Conservar el espacio actual</Button>
        </div>}
        <ViewRegion key={String(chromeHidden)} edge="top" hidden={chromeHidden} margin={revealMargin} className="shrink-0"><header className="relative flex h-13 shrink-0 items-center gap-2  bg-background px-2">
          <ClinBrand />
          <DropdownMenu>
            <DropdownMenuTrigger render={<Button variant="ghost" size="sm" aria-label="Entorno" className="px-2 sm:px-3" />}>
              {environment === "canvas" ? <Layers3 /> : environment === "reader" ? <BookOpen /> : <LayoutGrid />}
              <span className="hidden sm:inline">{environment === "canvas" ? "Canvas" : environment === "reader" ? "Lector" : "Inicio"}</span>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start"><DropdownMenuGroup>
              <DropdownMenuItem onClick={() => changeEnvironment("canvas")}><Layers3 /> Canvas</DropdownMenuItem>
              <DropdownMenuItem onClick={() => changeEnvironment("reader")}><BookOpen /> Lector</DropdownMenuItem>
              <DropdownMenuItem onClick={() => setEnvironment("dashboard")}><LayoutGrid /> Inicio</DropdownMenuItem>
              <DropdownMenuItem onClick={() => setToolsOpen(true)}><SlidersHorizontal /> Herramientas</DropdownMenuItem>
            </DropdownMenuGroup></DropdownMenuContent>
          </DropdownMenu>

          {environment !== "dashboard" && <ToolButton label="Panel de páginas" active={leftOpen} onClick={() => setLeftOpen((value) => !value)}><PanelLeft /></ToolButton>}
          <DropdownMenu>
            <DropdownMenuTrigger render={<Button variant="ghost" size="icon-sm" aria-label="Archivo" />}><Menu /></DropdownMenuTrigger>
            <DropdownMenuContent className="min-w-64"><DropdownMenuGroup>
              <DropdownMenuItem onClick={() => setNewProjectOpen(true)}><FilePlus2 data-testid="new-project-icon" /> Nuevo<DropdownMenuShortcut>Ctrl N</DropdownMenuShortcut></DropdownMenuItem>
              <DropdownMenuItem onClick={() => pdfInputRef.current?.click()}><FileUp /> {state.pages.length ? "Añadir PDF o imágenes" : "Abrir PDF o imagen"}<DropdownMenuShortcut>Ctrl O</DropdownMenuShortcut></DropdownMenuItem>
              <DropdownMenuItem onClick={() => projectInputRef.current?.click()}><FolderOpen /> Abrir proyecto</DropdownMenuItem>
              {recentProjects.length > 0 && <><DropdownMenuSeparator /><DropdownMenuGroup><DropdownMenuLabel><History className="mr-1 inline size-3.5" /> Recientes</DropdownMenuLabel>{recentProjects.map((project) => <DropdownMenuItem key={project.id ?? project.updatedAt} onClick={() => void openRecent(project)}><span className="min-w-0 flex-1 truncate">{project.name}</span><DropdownMenuShortcut>{new Date(project.updatedAt).toLocaleDateString("es-ES")}</DropdownMenuShortcut></DropdownMenuItem>)}</DropdownMenuGroup></>}
              </DropdownMenuGroup><DropdownMenuSeparator /><DropdownMenuGroup>
              <DropdownMenuItem onClick={() => saveProjectFile()} disabled={savingProject}><Save /> Guardar proyecto editable<DropdownMenuShortcut>Ctrl S</DropdownMenuShortcut></DropdownMenuItem>
              <DropdownMenuItem onClick={() => saveProjectFile(true)} disabled={savingProject}><SaveAll /> Guardar como<DropdownMenuShortcut>Ctrl Shift S</DropdownMenuShortcut></DropdownMenuItem>
              <DropdownMenuItem onClick={() => openExport()} disabled={!state.pages.length}><Download /> Exportar resultado<DropdownMenuShortcut>Ctrl E</DropdownMenuShortcut></DropdownMenuItem>
              <DropdownMenuItem onClick={() => setCommandsOpen(true)}><SquareTerminal />Buscar comandos<DropdownMenuShortcut>Ctrl K</DropdownMenuShortcut></DropdownMenuItem>
              <DropdownMenuItem onClick={() => void exportCanvasAsImage()} disabled={!hasCanvasContent}><ImageDown /> Exportar lienzo PNG</DropdownMenuItem>
              </DropdownMenuGroup><DropdownMenuSeparator /><DropdownMenuGroup>
              <DropdownMenuItem onClick={() => fitPageSet(state.pages)} disabled={!state.pages.length}><ZoomIn /> Ajustar</DropdownMenuItem>
              <DropdownMenuItem onClick={() => requestCleanup("reload")} disabled={!manualCheckpoint}><RotateCcw /> Volver al último archivo guardado</DropdownMenuItem>
              <DropdownMenuItem onClick={() => requestCleanup("strokes")} disabled={!state.annotations.some((annotation) => annotation.type === "ink" || annotation.type === "highlight")}><PenLine /> Borrar trazos</DropdownMenuItem>
              <DropdownMenuItem onClick={() => requestCleanup("annotations")} disabled={!state.annotations.some((annotation) => annotation.type !== "replacement")}><Eraser /> Borrar anotaciones</DropdownMenuItem>
              <DropdownMenuItem onClick={() => requestCleanup("restore")} disabled={!originalState}><History /> Volver al estado original</DropdownMenuItem>
              <DropdownMenuItem variant="destructive" onClick={() => requestCleanup("empty")} disabled={!hasCanvasContent}><Trash2 /> Vaciar espacio</DropdownMenuItem>
            </DropdownMenuGroup></DropdownMenuContent>
          </DropdownMenu>
          <div className="flex min-w-0 items-center gap-2"><Separator orientation="horizontal" className="hidden h-5 sm:block" /><input value={projectName} onChange={(event) => setProjectName(event.target.value.slice(0, 80))} aria-label="Nombre del proyecto" className="h-8 w-28 min-w-0 rounded-sm bg-transparent px-2 text-xs outline-none hover:bg-muted focus:bg-muted sm:w-44" /></div>
          <Separator orientation="vertical" className="mx-1 h-5" />
          <div className="editor-header-center"><ToolButton label="Deshacer" disabled={!history.past.length} onClick={() => setHistory((current) => undo(current))}><Undo2 /></ToolButton>
          <ToolButton label="Rehacer" disabled={!history.future.length} onClick={() => setHistory((current) => redo(current))}><Redo2 /></ToolButton>
          {environment === "canvas" && <div className="hidden items-center gap-1 md:flex">
            <Separator orientation="vertical" className="mx-1 h-5" />
            <DropdownMenu>
              <DropdownMenuTrigger render={<Button variant="ghost" size="icon-sm" aria-label="Distribución" disabled={!state.pages.length} />}><LayoutGrid /></DropdownMenuTrigger>
              <DropdownMenuContent className="min-w-52"><DropdownMenuGroup><DropdownMenuItem onClick={arrangePagesGrid}><LayoutGrid /> Cuadrícula</DropdownMenuItem><DropdownMenuItem disabled={selectedPages.length < 2} onClick={() => commitState((current) => prepareSpatialDocument(arrangePagesInDirection(current, current.selectedPageIds, "horizontal"), current.selectedPageIds).state)}><Columns3 /> En fila</DropdownMenuItem><DropdownMenuItem disabled={selectedPages.length < 2} onClick={() => commitState((current) => prepareSpatialDocument(arrangePagesInDirection(current, current.selectedPageIds, "vertical"), current.selectedPageIds).state)}><Rows3 /> En columna</DropdownMenuItem></DropdownMenuGroup></DropdownMenuContent>
            </DropdownMenu>
            <DropdownMenu>
              <DropdownMenuTrigger render={<Button variant="ghost" size="icon-sm" aria-label="Ajustar" disabled={!state.pages.length} />}><ZoomIn /></DropdownMenuTrigger>
              <DropdownMenuContent className="min-w-56"><DropdownMenuGroup>
                <DropdownMenuItem disabled={!state.selectedPageIds.length} onClick={() => fitPageSet(state.pages.filter((page) => state.selectedPageIds.includes(page.id)))}><ZoomIn /> Enfocar selección</DropdownMenuItem>
                <DropdownMenuItem onClick={() => fitPageSet(state.pages)}><RotateCcw /> Restaurar vista del documento</DropdownMenuItem>
              </DropdownMenuGroup></DropdownMenuContent>
            </DropdownMenu>
            {selectedPages.length > 0 && <><ToolButton label="Rotar" onClick={() => commitState((current) => rotatePages(current, current.selectedPageIds, 90))}><RotateCw /></ToolButton><ToolButton label="Duplicar" onClick={() => commitState((current) => duplicateSelection(current))}><Copy /></ToolButton><ToolButton label="Eliminar" onClick={() => commitState((current) => deletePages(current, current.selectedPageIds))}><Trash2 /></ToolButton></>}
          </div>}
          </div><div className="ml-auto flex items-center gap-2">
            {diagnosticsEnabled && <ToolButton label={`Diagnóstico (${diagnostics.length})`} onClick={() => setDiagnosticsOpen(true)}><AlertTriangle /></ToolButton>}
            <ToolButton label="Ajustes generales" onClick={() => setGeneralSettingsOpen(true)}><Cog /></ToolButton>
            <ToolButton label="Imprimir" disabled={!state.pages.length} onClick={() => { void printDocument(); }}><Printer /></ToolButton>
            <ToolButton label="Presentar" disabled={!state.pages.length} onClick={() => setPresentationOpen(true)}><Presentation /></ToolButton>
            <Button size="sm" className="px-2 sm:px-3" aria-label="Exportar" disabled={!state.pages.length || exporting} onClick={() => openExport()}><Download data-icon="inline-start" /><span className="hidden sm:inline">Exportar</span></Button>
            {environment === "canvas" && <ToolButton label="Inspector" active={rightOpen} onClick={() => setRightOpen((value) => !value)}><PanelRight /></ToolButton>}
          </div>
        <ToolButton label="Buscar comandos" onClick={() => setCommandsOpen(true)}><SquareTerminal /></ToolButton></header></ViewRegion>
        <TouchChromeHandle visible={chromeHidden} />

        {environment === "dashboard" ? (
          <DashboardView
            recentProjects={recentProjects}
            onOpenPdf={() => pdfInputRef.current?.click()}
            onOpenProject={() => projectInputRef.current?.click()}
            onNewCanvas={createNewProject}
            onOpenRecent={(project) => void openRecent(project)}
            onOpenCanvas={() => changeEnvironment("canvas")}
            onOpenTool={setQuickTool}
            onRemoveRecent={(project) => { setRecentError(""); setRecentDeletion(project); }}
            onRecoverLast={() => { const project = recentProjects[0]; if (project) void openRecent(project); }}
            onClearRecent={() => { setRecentError(""); setRecentDeletion("all"); }}
          />
        ) : environment === "reader" ? (
          <ReaderView
            panelOpen={leftOpen} onPanelOpenChange={setLeftOpen} interfaceHidden={chromeHidden} revealMargin={revealMargin} panelWidth={readerWidth} onPanelWidthChange={setReaderWidth}
            searchQuery={searchQuery}
            onSearchChange={setSearchQuery}
            activePageId={activePageId}
            onActivePageChange={setActivePageId}
            state={state}
            documents={documents}
            onImport={() => pdfInputRef.current?.click()}
            onOpenCanvas={() => changeEnvironment("canvas")}
            onSelectAnnotation={(id) => replaceState((current) => selectAnnotation(current, id))}
            onCreateReplacement={(block) => commitState((current) => addAnnotation(current, createReplacement(block, block.text)))}
            onUpdateAnnotation={(id, patch) => commitState((current) => updateAnnotation(current, id, patch))}
          />
        ) : (
          <div className="relative flex min-h-0 flex-1">
            {<ViewRegion edge="left" hidden open={leftOpen} onOpenChange={setLeftOpen} margin={revealMargin} className="absolute inset-y-0 left-0 z-40 max-w-[42vw] border-r border-border bg-panel shadow-lg" style={{width:leftWidth}}><aside data-testid="pages-panel" className="h-full">{rail}</aside><PanelResize side="left" width={leftWidth} onChange={setLeftWidth} /></ViewRegion>}
            <main className="relative min-w-0 flex-1">
              <InfiniteCanvas
                onToggleGroup={(id) => { workspaceHasChanges.current = true; replaceState(current => toggleGroupCollapse(current, [id])); }}
                onSelectItems={(items) => replaceState((current) => applySelection(current, items))}
                captureMode={captureMode}
                onCapture={captureRegion}
                onCancelCapture={() => setCaptureMode(false)}
                state={state}
                documents={documents}
                camera={camera}
                onCameraChange={setCamera}
                onSelectPages={(ids) => { if (ids.length) setActivePageId(ids[0]); replaceState((current) => selectPages(current, ids)); }}
                onSelectGroup={(id) => replaceState((current) => selectGroup(current, id))}
                onSelectAnnotation={(id) => replaceState((current) => selectAnnotation(current, id))}
                onMovePages={(ids, x, y, annotationIds = []) => commitState((current) => moveMixedSelection(current, ids, annotationIds, x, y))}
                onAddAnnotation={(annotation) => commitState((current) => addAnnotation(current, annotation))}
                onDeleteAnnotation={(id) => commitState((current) => deleteAnnotations(current, [id]))}
                onMoveAnnotation={(id, deltaX, deltaY) => commitState((current) => moveAnnotation(current, id, deltaX, deltaY))}
                onImport={() => pdfInputRef.current?.click()}
                onDuplicatePages={() => commitState((current) => duplicateSelection(current))}
                onRotatePages={() => commitState((current) => rotatePages(current, current.selectedPageIds, 90))}
                onDeletePages={() => commitState((current) => deletePages(current, current.selectedPageIds))}
                onExportSelection={() => openExport()}
                onArrangeGrid={arrangePagesGrid}
                inkColor={inkColor}
                highlightColor={highlightColor}
                inkSize={inkSize}
                pressureEnabled={pressureEnabled}
                pressureSensitivity={pressureSensitivity}
                strokeSmoothing={strokeSmoothing}
                whiteboardMode={whiteboardMode}
                searchQuery={searchQuery}
                focusedTextBlockId={focusedTextBlockId}
              />
              <div data-testid="tool-dock" className="absolute bottom-3 left-1/2 z-30 flex w-fit max-w-[calc(100%-16px)] -translate-x-1/2 items-center justify-center gap-1 overflow-x-auto rounded-lg  bg-background/95 px-2 py-1.5 shadow-lg backdrop-blur-md sm:max-w-[70vw]">
                {toolItems.map(({ id, label, icon: Icon, shortcut }) => <ToolButton key={id} label={label} shortcut={shortcut} active={state.tool === id} onClick={() => replaceState((current) => setTool(current, id))}><Icon /></ToolButton>)}
                <Separator orientation="vertical" className="mx-1 h-5" />
                <ToolButton label="Pizarra" active={whiteboardMode} onClick={() => setWhiteboardMode((value) => !value)}><StickyNote /></ToolButton>
                {(state.tool === "ink" || state.tool === "highlight") && <ColorPicker
                  label={state.tool === "highlight" ? "Color del resaltador" : "Color de anotación"}
                  value={state.tool === "highlight" ? highlightColor : inkColor}
                  onChange={state.tool === "highlight" ? setHighlightColor : setInkColor}
                  side="top"
                />}
                {state.tool === "ink" && <ToolButton label="Configurar trazo" onClick={() => setPenSettingsOpen(true)}><SlidersHorizontal /></ToolButton>}
              </div>
            </main>
            {<ViewRegion edge="right" hidden open={rightOpen} onOpenChange={setRightOpen} margin={revealMargin} className="absolute inset-y-0 right-0 z-40 max-w-[42vw] border-l border-border bg-panel shadow-lg" style={{width:rightWidth}}><aside data-testid="inspector-panel" className="h-full overflow-y-auto">{inspector}</aside><PanelResize side="right" width={rightWidth} onChange={setRightWidth} /></ViewRegion>}
          </div>
        )}

        <AlertDialog open={recentDeletion !== null} onOpenChange={(open) => { if (!open && !deletingRecent) setRecentDeletion(null); }}>
          <AlertDialogContent><AlertDialogHeader>
            <AlertDialogTitle>{recentDeletion === "all" ? "Limpiar historial" : "Borrar copia reciente"}</AlertDialogTitle>
            <AlertDialogDescription>Se eliminará {recentDeletion === "all" ? "el historial y sus copias locales" : `la copia local de «${recentDeletion?.name ?? ""}»`}. Los archivos guardados y el proyecto abierto se conservan. Esta acción no se puede deshacer.</AlertDialogDescription>
          </AlertDialogHeader>
          {recentError && <p role="alert" className="text-sm text-destructive">{recentError}</p>}
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deletingRecent}>Cancelar</AlertDialogCancel>
            <AlertDialogAction variant="destructive" disabled={deletingRecent} onClick={async () => {
              if (!recentDeletion || deletingRecent) return;
              setDeletingRecent(true);
              setRecentError("");
              try {
                if (recentDeletion === "all") await clearRecentProjects(); else await removeRecentProject(recentDeletion);
                setRecentProjects(await loadRecentProjects()); setRecentDeletion(null); setStatus("Historial actualizado");
              } catch (error) { setRecentError("No se pudo completar el borrado. Puedes reintentarlo o cerrar este aviso."); reportError("No se pudo actualizar el historial", error); }
              finally { setDeletingRecent(false); }
            }}>{deletingRecent ? "Borrando…" : "Borrar"}</AlertDialogAction>
          </AlertDialogFooter></AlertDialogContent>
        </AlertDialog>
        <Dialog open={toolsOpen} onOpenChange={setToolsOpen}>
          <DialogContent><DialogHeader><DialogTitle>Herramientas</DialogTitle><DialogDescription>Trabaja sobre el documento abierto.</DialogDescription></DialogHeader>
            <ToolList disabled={!state.pages.length} onOpenTool={(tool) => { setToolsOpen(false); setQuickTool(tool); }} />
            {!state.pages.length && <Button onClick={() => { setToolsOpen(false); pdfInputRef.current?.click(); }}>Abrir PDF</Button>}
          </DialogContent>
        </Dialog>
        <Dialog open={quickTool !== null} onOpenChange={(open) => { if (!open) setQuickTool(null); }}>
          <DialogContent className={quickTool === "organize" ? "flex h-[min(82vh,760px)] !w-[calc(100vw-32px)] !max-w-[1080px] flex-col gap-0 overflow-hidden p-0" : "max-w-md"}>
            {quickTool === "organize" ? (
              <>
                <DialogHeader className="shrink-0 px-5 pb-3 pt-5"><DialogTitle>Organizar</DialogTitle><DialogDescription className="sr-only">Ordena páginas, edita sus nombres y crea capítulos.</DialogDescription></DialogHeader>
                <QuickOrganizer
                  state={state}
                  documents={documents}
                  onSelectPages={(ids) => { if (ids.length) setActivePageId(ids[0]); replaceState((current) => selectPages(current, ids)); }}
                  onReorder={(ids) => commitState((current) => reorderSpatialDocument(current, ids))}
                  onRenamePage={(id, name) => commitState((current) => updatePageName(current, id, name))}
                  onArrangeGrid={arrangePagesGrid}
                  onArrangeDirection={(direction) => commitState((current) => prepareSpatialDocument(arrangePagesInDirection(current, quickPageIds, direction), quickPageIds).state)}
                  onCreateChapter={(name, parentId, pageIds) => commitState((current) => createGroup(current, pageIds, { id: crypto.randomUUID(), name, parentId }))}
                  onRenameChapter={(id, name) => commitState((current) => renameGroup(current, id, name))}
                  onMovePagesToChapter={(pageIds, groupId) => commitState((current) => movePagesToGroup(current, pageIds, groupId))}
                />
              </>
            ) : (
              <>
            <DialogHeader><DialogTitle>{quickTool ? quickToolLabels[quickTool] : "Herramienta"}</DialogTitle><DialogDescription className="sr-only">Acción rápida sobre el documento activo.</DialogDescription></DialogHeader>
            {quickTool === "compress" && <div className="grid grid-cols-2 gap-2"><Button variant="outline" onClick={() => openQuickPdfExport("balanced")}><Archive data-icon="inline-start" /> Equilibrada</Button><Button variant="outline" onClick={() => openQuickPdfExport("compact")}><Archive data-icon="inline-start" /> Compacta</Button></div>}
            {quickTool === "split" && <div className="divide-y divide-border border-y border-border">{state.groups.map((group) => <button key={group.id} type="button" className="flex w-full items-center gap-2 py-3 text-left text-sm hover:text-primary" onClick={() => { setQuickTool(null); openExport(group.id); }}><Layers3 className="size-4" /><span className="min-w-0 flex-1 truncate">{group.name}</span><span className="font-mono text-[10px] text-muted-foreground">{orderedPagesForExport(state, group.id).length} pág.</span></button>)}{!state.groups.length && <p className="py-6 text-center text-xs text-muted-foreground">No hay grupos preparados.</p>}</div>}
            {quickTool === "protect" && <Button onClick={() => openQuickPdfExport("editable", true)}><ShieldCheck data-icon="inline-start" /> Configurar protección y firma</Button>}
            <DialogFooter><Button variant="ghost" onClick={() => setQuickTool(null)}>Cerrar</Button></DialogFooter>
              </>
            )}
          </DialogContent>
        </Dialog>

        <Dialog open={exportOpen} onOpenChange={setExportOpen}>
          <DialogContent className="themed-scrollbar max-h-[88vh] overflow-y-auto">
            <DialogHeader><DialogTitle>Exportar</DialogTitle><DialogDescription className="sr-only">Configura el contenido y el formato de salida.</DialogDescription></DialogHeader>
            <FieldGroup className="flex flex-col gap-4">
              <p className="text-xs text-muted-foreground">Revisión fijada al abrir este panel. El orden mostrado será el orden del archivo.</p>
              <Accordion defaultValue={["preview"]}><AccordionItem value="preview">
                <AccordionTrigger>Vista previa · {exportPages.length} páginas · {includeBoardExport ? "con pizarra" : "sin pizarra"}</AccordionTrigger>
                <AccordionContent>
                <ol className="mt-3 grid max-h-64 grid-cols-3 gap-3 overflow-auto">
                  {exportPages.map((page, index) => <li key={page.id} className="min-w-0 text-xs">
                    <div className="relative h-36 bg-muted"><VisiblePage><ExportPreviewPage state={exportState} page={page} documents={documents} includeBoard={includeBoardExport} /></VisiblePage></div>
                    <span className="mt-1 block truncate" title={page.name}>{index + 1}. {page.name}</span>
                    <span className="text-muted-foreground">{page.rotation}° · {exportState.annotations.filter((item) => item.pageId === page.id).length} anotaciones</span>
                  </li>)}
                </ol>
                </AccordionContent></AccordionItem></Accordion>
              {(exportMode !== "editable" || exportOutput === "png" || exportOutput === "jpeg") && <p className="text-xs text-muted-foreground">La salida se convierte en imágenes. La compresión puede reducir el detalle; el texto buscable se conserva cuando la página y la rotación lo permiten.</p>}
              {exportError && <p role="alert" className="rounded-md border border-destructive/40 p-3 text-sm text-destructive">{exportError}</p>}
              {diagnosticsEnabled && diagnostics[0]?.context === "Exportación" && (
                <div role="alert" className="flex items-start gap-3 rounded-md border border-destructive/40 bg-destructive/8 p-3 text-sm">
                  <AlertTriangle className="mt-0.5 size-4 shrink-0 text-destructive" />
                  <span className="min-w-0 flex-1">{diagnostics[0].message}</span>
                  <Button type="button" variant="outline" size="sm" onClick={() => setDiagnosticsOpen(true)}>Abrir diagnóstico</Button>
                </div>
              )}
              {exportOutput !== "print" && (
                <div className="flex items-center justify-between gap-4 rounded-md border border-border p-3">
                  <div className="min-w-0"><Label>Carpeta de destino</Label><p className="mt-1 truncate text-xs text-muted-foreground">{outputDirectory?.name ?? "Elegir destino al guardar"}</p></div>
                  <Button type="button" variant="outline" size="sm" onClick={() => { void chooseExportDirectory(); }}><FolderOpen data-icon="inline-start" /> Elegir carpeta</Button>
                </div>
              )}
              <Field className="flex flex-col gap-2"><FieldLabel>Contenido</FieldLabel><Select items={[{ value: "all", label: "Documento completo" }, { value: "selection", label: `Páginas seleccionadas (${exportState.selectedPageIds.length})` }, ...exportState.groups.map((group) => ({ value: group.id, label: group.name }))]} value={exportSelectionOnly ? "selection" : exportGroupId ?? "all"} onValueChange={(value) => { const selection = value === "selection"; const id = value === "all" || selection ? null : value; const group = exportState.groups.find((item) => item.id === id); prepareExportScope(id, selection); setExportMode(group?.export.compression ?? "editable"); setExportDocumentName(group?.export.filename || (selection ? `${projectName}-selección` : projectName)); if (group) setExportOutput(group.export.format === "images" ? group.export.imageFormat : "pdf"); }}><SelectTrigger aria-label="Contenido" className="w-full"><SelectValue>{(value) => value === "selection" ? `Páginas seleccionadas (${exportState.selectedPageIds.length})` : value === "all" ? "Documento completo" : exportState.groups.find((group) => group.id === value)?.name ?? String(value)}</SelectValue></SelectTrigger><SelectContent><SelectGroup>{exportState.selectedPageIds.length > 0 && <SelectItem value="selection">Páginas seleccionadas ({exportState.selectedPageIds.length})</SelectItem>}<SelectItem value="all">Documento completo</SelectItem>{exportState.groups.map((group) => <SelectItem key={group.id} value={group.id}>{group.name}</SelectItem>)}</SelectGroup></SelectContent></Select></Field>
              <Field className="flex flex-col gap-2"><FieldLabel>Formato</FieldLabel><Select items={[{ value: "pdf", label: "PDF" }, { value: "png", label: "PNG" }, { value: "jpeg", label: "JPG" }, { value: "print", label: "Imprimir" }]} value={exportOutput} onValueChange={(value) => setExportOutput(value as ExportOutput)}><SelectTrigger aria-label="Formato" className="w-full"><SelectValue>{(value) => ({ pdf: "PDF", png: "PNG", jpeg: "JPG", print: "Imprimir" })[String(value)] ?? String(value)}</SelectValue></SelectTrigger><SelectContent><SelectGroup><SelectItem value="pdf">PDF</SelectItem><SelectItem value="png">PNG</SelectItem><SelectItem value="jpeg">JPG</SelectItem><SelectItem value="print">Imprimir</SelectItem></SelectGroup></SelectContent></Select></Field>
              {exportOutput !== "print" && <Field className="flex flex-col gap-2"><FieldLabel htmlFor="export-document-name">Nombre del documento</FieldLabel><div className="flex items-center rounded-md border border-input bg-input/20 focus-within:border-ring focus-within:ring-3 focus-within:ring-ring/30"><Input id="export-document-name" aria-label="Nombre del documento" value={exportDocumentName} onChange={(event) => setExportDocumentName(event.target.value.slice(0, 120))} className="border-0 bg-transparent shadow-none focus-visible:ring-0" /><span className="shrink-0 pr-3 text-xs text-muted-foreground">{exportExtension}</span></div></Field>}
              {exportOutput === "pdf" && <Field className="flex flex-col gap-2"><FieldLabel>Compresión</FieldLabel><Select items={[{ value: "editable", label: "Editable" }, { value: "balanced", label: "Equilibrada" }, { value: "compact", label: "Compacta" }]} value={exportMode} onValueChange={(value) => setExportMode(value as ExportMode)}><SelectTrigger className="w-full"><SelectValue>{(value) => ({ editable: "Editable", balanced: "Equilibrada", compact: "Compacta" })[String(value)] ?? String(value)}</SelectValue></SelectTrigger><SelectContent><SelectGroup><SelectItem value="editable">Editable</SelectItem><SelectItem value="balanced">Equilibrada</SelectItem><SelectItem value="compact">Compacta</SelectItem></SelectGroup></SelectContent></Select></Field>}
              {exportOutput === "pdf" && exportPages.some((page) => page.crop) && <p className="rounded-md border p-3 text-xs text-muted-foreground">El PDF de salida se convertirá en imágenes para respetar los recortes. Los originales siguen disponibles en el proyecto.</p>}
              {exportOutput === "pdf" && exportState.annotations.some((annotation) => annotation.type === "replacement") && (
                <p className="rounded-md border border-border bg-muted px-3 py-2 text-xs text-muted-foreground">Las sustituciones se aplanarán para eliminar el contenido visual anterior.</p>
              )}
              <div className="flex items-center justify-between gap-4 border-y border-border py-3"><div><Label htmlFor="include-board-export">Incluir pizarra sobre páginas</Label><p className="mt-1 text-xs text-muted-foreground">Imprime sólo los trazos de pizarra que cruzan cada hoja.</p></div><Switch id="include-board-export" aria-label="Incluir pizarra sobre páginas" checked={includeBoardExport} onCheckedChange={setIncludeBoardExport} /></div>
              {exportOutput === "pdf" && <>
                <Separator />
                <div className="flex items-center justify-between"><div><Label htmlFor="protect-pdf">Protección</Label><p className="mt-1 text-xs text-muted-foreground">Contraseña AES-256.</p></div><Switch id="protect-pdf" checked={protectExport} onCheckedChange={setProtectExport} /></div>
                {protectExport && <div className="flex flex-col gap-3 rounded-md border border-border p-3">
                  <div className="grid grid-cols-2 gap-2"><Input type="password" aria-label="Contraseña del PDF" placeholder="Contraseña" value={pdfPassword} onChange={(event) => setPdfPassword(event.target.value)} /><Input type="password" aria-label="Confirmar contraseña del PDF" placeholder="Confirmar" value={pdfPasswordConfirmation} onChange={(event) => setPdfPasswordConfirmation(event.target.value)} /></div>
                  <Input type="password" aria-label="Contraseña de propietario" placeholder="Propietario (opcional)" value={ownerPassword} onChange={(event) => setOwnerPassword(event.target.value)} />
                  <div className="grid grid-cols-3 gap-2 text-xs"><label className="flex items-center gap-2"><Switch checked={allowPrint} onCheckedChange={setAllowPrint} /> Imprimir</label><label className="flex items-center gap-2"><Switch checked={allowCopy} onCheckedChange={setAllowCopy} /> Copiar</label><label className="flex items-center gap-2"><Switch checked={allowModify} onCheckedChange={setAllowModify} /> Editar</label></div>
                </div>}
                <Separator />
                <div className="flex items-center justify-between"><div><Label htmlFor="sign-pdf">Firma digital</Label><p className="mt-1 text-xs text-muted-foreground">Certificado P12 o PFX local.</p></div><Switch id="sign-pdf" checked={signExport} onCheckedChange={setSignExport} /></div>
                {signExport && <div className="flex flex-col gap-3 rounded-md border border-border p-3">
                  <label className="flex h-9 cursor-pointer items-center gap-2 rounded-md border border-input px-3 text-xs hover:bg-muted"><ShieldCheck className="size-4" /><span className="min-w-0 flex-1 truncate">{certificateName || "Seleccionar certificado"}</span><input type="file" accept=".p12,.pfx,application/x-pkcs12" hidden onChange={(event) => { const file = event.target.files?.[0]; if (!file) return; setCertificateName(file.name); void file.arrayBuffer().then((bytes) => setCertificate(new Uint8Array(bytes))); }} /></label>
                  <div className="flex flex-col gap-2"><Input type="password" aria-label="Contraseña del certificado" placeholder="Contraseña del archivo P12/PFX" value={certificatePassword} onChange={(event) => setCertificatePassword(event.target.value)} /><p className="text-[11px] leading-relaxed text-muted-foreground">Es la contraseña definida al crear o exportar el certificado. No puedes inventarla: permite abrir la clave privada y no protege el PDF.</p></div>
                  <div className="grid grid-cols-2 gap-2"><Input aria-label="Motivo de la firma" placeholder="Motivo" value={signatureReason} onChange={(event) => setSignatureReason(event.target.value)} /><Input aria-label="Lugar de la firma" placeholder="Lugar" value={signatureLocation} onChange={(event) => setSignatureLocation(event.target.value)} /></div>
                </div>}
              </>}
              {exporting && <Progress value={progress * 100} />}
            </FieldGroup>
            <DialogFooter><Button variant="outline" onClick={() => setExportOpen(false)} disabled={exporting}>Cancelar</Button><Button onClick={() => void exportDocument()} disabled={exporting || exportPages.length === 0}>{exporting ? <Archive className="animate-pulse" /> : exportOutput === "print" ? <Printer /> : <Download />} {exportOutput === "print" ? "Imprimir" : "Exportar"}</Button></DialogFooter>
          </DialogContent>
        </Dialog>

        <AlertDialog open={Boolean(pendingOpen)} onOpenChange={(open) => { if (!open) setPendingOpen(null); }}>
          <AlertDialogContent>
            <AlertDialogHeader><AlertDialogTitle>Abrir otro proyecto</AlertDialogTitle><AlertDialogDescription>El espacio actual se sustituirá por {pendingOpen?.name}. Guarda un archivo editable si quieres conservar el trabajo actual.</AlertDialogDescription></AlertDialogHeader>
            <AlertDialogFooter>
              <Button variant="outline" onClick={() => setPendingOpen(null)}>Seguir aquí</Button>
              <Button variant="outline" disabled={savingProject} onClick={() => void saveProjectFile()}>Guardar proyecto actual</Button>
              <Button onClick={() => { const project = pendingOpen; setPendingOpen(null); if (project) void restoreProject(project).catch((error) => reportError("Abrir proyecto", error)); }}>Sustituir espacio y abrir</Button>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
        <Dialog open={recognizingText} onOpenChange={() => undefined}>
          <DialogContent showCloseButton={false}>
            <DialogHeader><DialogTitle>Reconociendo texto</DialogTitle><DialogDescription>Preparando las páginas para buscar palabras. El escaneo se realiza en tu equipo.</DialogDescription></DialogHeader>
            <div className="flex flex-col gap-3">
              <div className="flex justify-between gap-4 text-sm"><span className="truncate">{ocrProgress.label}</span><span className="tabular-nums">{Math.round(ocrProgress.value)}%</span></div>
              <Progress value={ocrProgress.value} aria-label="Progreso del reconocimiento de texto" />
              <p className="text-xs text-muted-foreground">{ocrProgress.backup ? "Copia de seguridad disponible en Inicio → Recientes. Puedes cancelar y conservar las páginas ya procesadas." : "El escaneo comenzará cuando la copia de seguridad esté guardada."}</p>
            </div>
            <DialogFooter><Button variant="outline" onClick={() => ocrController.current?.abort()}>Cancelar escaneo</Button></DialogFooter>
          </DialogContent>
        </Dialog>
        <GeneralSettings showStatusBar={showStatusBar} onStatusBarChange={setShowStatusBar} revealMargin={revealMargin} onRevealMarginChange={setRevealMargin} zen={zen} onZenChange={value => { void changeZen(value); }} startInZen={startInZen} onStartInZenChange={setStartInZen} interfaceHidden={interfaceHidden} onInterfaceHiddenChange={setInterfaceHidden} accentColor={accentColor} onAccentChange={setAccentColor} open={generalSettingsOpen} onOpenChange={setGeneralSettingsOpen} theme={theme} onThemeChange={setTheme} startup={startup} onStartupChange={setStartup} diagnostics={diagnosticsEnabled} onDiagnosticsChange={setDiagnosticsEnabled} hasHiddenConfirmations={Object.values(confirmationPreferences).some((enabled) => !enabled)} onRestoreConfirmations={resetCleanupConfirmations}
          confirmationOptions={(Object.keys(cleanupCopy) as CleanupAction[]).map((action) => ({
            id: action, ...cleanupCopy[action], checked: confirmationPreferences[action],
            onCheckedChange: (checked: boolean) => {
              const next = { ...confirmationPreferences, [action]: checked };
              setConfirmationPreferences(next);
              window.localStorage.setItem(confirmationStorageKey, JSON.stringify(next));
            },
          }))}
        />

        <Dialog open={diagnosticsEnabled && diagnosticsOpen} onOpenChange={setDiagnosticsOpen}>
          <DialogContent className="max-w-2xl">
            <DialogHeader><DialogTitle>Diagnóstico</DialogTitle><DialogDescription>Registra los errores y tiempos de esta sesión para ayudar a identificar fallos o lentitud en Clin. No ejecuta pruebas ni envía información automáticamente.</DialogDescription></DialogHeader>
            <p className="text-sm text-muted-foreground">Después de reproducir el problema, pulsa «Copiar informe» y pega el contenido en un correo a <a href="mailto:support@maydei.es?subject=Diagn%C3%B3stico%20de%20Clin" className="rounded bg-primary px-1 text-primary-foreground underline underline-offset-4">support@maydei.es</a>. Describe los pasos que seguiste, qué esperabas y qué ocurrió. El informe incluye los errores y las mediciones actuales.</p>
            <Button variant="outline" onClick={() => setPerformanceSnapshot(JSON.stringify({ rendering: renderingSnapshot(), operations: performanceEntries() }, null, 2))}>Mostrar mediciones de esta sesión</Button>
            {performanceSnapshot && <pre className="max-h-48 overflow-auto rounded-md bg-muted p-2 text-[10px]">{performanceSnapshot}</pre>}
            <div className="themed-scrollbar max-h-[55vh] flex flex-col gap-3 overflow-y-auto pr-1">
              {diagnostics.map((entry) => (
                <section key={entry.id} className="rounded-md border border-border p-3">
                  <div className="flex items-center gap-2 text-xs"><AlertTriangle className="size-4 text-destructive" /><strong>{entry.context}</strong><time className="ml-auto font-mono text-muted-foreground">{entry.time}</time></div>
                  <p className="mt-2 text-sm">{entry.message}</p>
                  <details className="mt-2"><summary className="cursor-pointer text-xs text-muted-foreground">Detalle técnico</summary><pre className="mt-2 overflow-x-auto whitespace-pre-wrap rounded-md bg-muted p-2 font-mono text-[10px] text-muted-foreground">{entry.details}</pre></details>
                </section>
              ))}
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => {
                const report = JSON.stringify({ application: "Clin", version: "0.1.0", errors: diagnostics, rendering: renderingSnapshot(), operations: performanceEntries() }, null, 2);
                void navigator.clipboard.writeText(report).then(() => setStatus("Informe de diagnóstico copiado"), (error) => reportError("Copiar diagnóstico", error));
              }}><ClipboardCopy data-icon="inline-start" /> Copiar informe</Button>
              <Button variant="outline" onClick={() => setDiagnostics([])}>Limpiar</Button>
              <Button onClick={() => setDiagnosticsOpen(false)}>Cerrar</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        <Dialog open={penSettingsOpen && state.tool === "ink"} onOpenChange={setPenSettingsOpen}>
          <DialogContent>
            <DialogHeader><DialogTitle>Opciones de lápiz</DialogTitle><DialogDescription>Trazo, presión y suavizado.</DialogDescription></DialogHeader>
            <div className="flex flex-col gap-5">
              <Field orientation="horizontal" className="flex items-center justify-between"><FieldLabel htmlFor="pressure">Presión del lápiz</FieldLabel><Switch id="pressure" checked={pressureEnabled} onCheckedChange={setPressureEnabled} /></Field>
              <div className="flex flex-col gap-3"><div className="flex justify-between"><Label>Grosor</Label><span className="font-mono text-[11px] text-muted-foreground">{inkSize}px</span></div><Slider aria-label="Grosor del lápiz" min={1} max={32} value={inkSize} onValueChange={(value) => setInkSize(Number(value))} /></div>
              <div className="flex flex-col gap-3"><div className="flex justify-between"><Label>Sensibilidad</Label><span className="font-mono text-[11px] text-muted-foreground">{pressureSensitivity.toFixed(1)}×</span></div><Slider aria-label="Sensibilidad del lápiz" min={0.25} max={2} step={0.05} value={pressureSensitivity} onValueChange={(value) => setPressureSensitivity(Number(value))} /></div>
              <div className="flex flex-col gap-3"><div className="flex justify-between"><Label>Suavizado</Label><span className="font-mono text-[11px] text-muted-foreground">{Math.round(strokeSmoothing * 100)}%</span></div><Slider aria-label="Suavizado del lápiz" min={0.2} max={1} step={0.05} value={strokeSmoothing} onValueChange={(value) => setStrokeSmoothing(Number(value))} /></div>
            </div>
            <DialogFooter><Button onClick={() => setPenSettingsOpen(false)}>Cerrar</Button></DialogFooter>
          </DialogContent>
        </Dialog>

        <Dialog open={newProjectOpen} onOpenChange={setNewProjectOpen}>
          <DialogContent><DialogHeader><DialogTitle>Nuevo proyecto</DialogTitle><DialogDescription>Se cerrará el proyecto actual. Guarda una copia antes si la necesitas.</DialogDescription></DialogHeader><DialogFooter><Button variant="outline" onClick={() => setNewProjectOpen(false)}>Cancelar</Button><Button onClick={createNewProject}>Crear proyecto</Button></DialogFooter></DialogContent>
        </Dialog>

        <AlertDialog open={cleanupAction !== null} onOpenChange={(open) => { if (!open) setCleanupAction(null); }}>
          <AlertDialogContent initialFocus={cleanupCancelRef}>
            <AlertDialogHeader><AlertDialogTitle>{cleanupAction ? cleanupCopy[cleanupAction].label : "Confirmar"}</AlertDialogTitle><AlertDialogDescription>{cleanupAction ? cleanupCopy[cleanupAction].description : ""}</AlertDialogDescription></AlertDialogHeader>
            <Field orientation="horizontal"><Checkbox id="remember-cleanup" checked={rememberCleanupChoice} onCheckedChange={setRememberCleanupChoice} /><FieldLabel htmlFor="remember-cleanup">No volver a preguntar por esta acción</FieldLabel></Field>
            <AlertDialogFooter><AlertDialogCancel ref={cleanupCancelRef}>Cancelar</AlertDialogCancel><AlertDialogAction variant="destructive" onClick={confirmCleanup}>{cleanupAction ? cleanupCopy[cleanupAction].label : "Confirmar"}</AlertDialogAction></AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>

        <PresentationView
          open={presentationOpen}
          pages={orderedPagesForExport(state)}
          documents={documents}
          annotations={state.annotations}
          transition={presentationTransition}
          onTransitionChange={setPresentationTransition}
          onClose={() => setPresentationOpen(false)}
        />
      </div>
    </TooltipProvider></ViewChrome>
  );
}


