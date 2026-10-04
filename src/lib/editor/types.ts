export type Point = { x: number; y: number };

export type Camera = {
  x: number;
  y: number;
  zoom: number;
};

export type EditorTool =
  | "select"
  | "hand"
  | "document"
  | "edit-text"
  | "ink"
  | "highlight"
  | "text"
  | "rectangle"
  | "eraser";

export type EditorPage = {
  ocrIndexed?: boolean;
  crop?: import("./crop").CropRect | null;
  sourceWidth?: number;
  sourceHeight?: number;
  id: string;
  name: string;
  groupId: string | null;
  sourceId: string;
  sourcePageIndex: number;
  order: number;
  x: number;
  y: number;
  width: number;
  height: number;
  rotation: number;
};

export type StrokePoint = [x: number, y: number, pressure: number];

type AnnotationBase = {
  groupId?: string | null;
  id: string;
  pageId: string | null;
  color: string;
  opacity: number;
};

export type StrokeAnnotation = AnnotationBase & {
  type: "ink" | "highlight";
  size: number;
  points: StrokePoint[];
  pressureEnabled?: boolean;
  smoothing?: number;
};

export type TextAnnotation = AnnotationBase & {
  type: "text";
  x: number;
  y: number;
  width: number;
  height: number;
  text: string;
  fontSize?: number;
};

export type ReplacementAnnotation = AnnotationBase & {
  type: "replacement";
  sourceTextBlockId: string;
  x: number;
  y: number;
  width: number;
  height: number;
  text: string;
  fontSize: number;
  backgroundColor: string;
};

export type RectangleAnnotation = AnnotationBase & {
  type: "rectangle";
  x: number;
  y: number;
  width: number;
  height: number;
  size?: number;
  fillColor?: string;
  fillOpacity?: number;
};

export type Annotation = StrokeAnnotation | TextAnnotation | RectangleAnnotation | ReplacementAnnotation;

export type TextCharacterBox = { x: number; y: number; width: number; height: number };

export type DocumentTextBlock = {
  characterBoxes?: TextCharacterBox[];
  id: string;
  pageId: string;
  text: string;
  x: number;
  y: number;
  width: number;
  height: number;
  fontSize: number;
  confidence: number;
  source: "pdf" | "ocr";
};

export type GroupOrderMode = "manual" | "vertical" | "horizontal";
export type ExportCompression = "editable" | "balanced" | "compact";
export type GroupExportFormat = "pdf" | "images";

export type GroupExportPreferences = {
  filename: string;
  format: GroupExportFormat;
  compression: ExportCompression;
  imageFormat: "jpeg" | "png";
};

export type CanvasGroup = {
  collapsed?: boolean;
  id: string;
  name: string;
  parentId: string | null;
  order: number;
  orderMode: GroupOrderMode;
  exportOrder?: string[];
  export: GroupExportPreferences;
};

export type EditorState = {
  selectedItems?: import("./selection").SelectionItem[];
  selectedGroupIds?: string[];
  selectedAnnotationIds?: string[];
  pages: EditorPage[];
  groups: CanvasGroup[];
  annotations: Annotation[];
  textBlocks: DocumentTextBlock[];
  selectedPageIds: string[];
  selectedGroupId: string | null;
  selectedAnnotationId: string | null;
  tool: EditorTool;
};

export type DocumentOutlineItem = {
  id: string;
  title: string;
  pageIndex: number | null;
  children: DocumentOutlineItem[];
};

export type DocumentSource = {
  id: string;
  name: string;
  bytes: Uint8Array;
  pageCount: number;
  indexComplete?: boolean;
  outline?: DocumentOutlineItem[];
};

export type EditorProject = {
  id?: string;
  version: 1;
  name: string;
  state: EditorState;
  savedState?: EditorState;
  originalState?: EditorState;
  sources: DocumentSource[];
  updatedAt: string;
};
