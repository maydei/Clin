"use client";
import { SelectGroup } from "@/components/ui/select";
import { Field, FieldLabel, FieldGroup } from "@/components/ui/field";

import {
  AlignCenterHorizontal,
  AlignCenterVertical,
  AlignEndHorizontal,
  AlignEndVertical,
  AlignHorizontalSpaceBetween,
  AlignStartHorizontal,
  AlignStartVertical,
  AlignVerticalSpaceBetween,
  Columns3,
  Copy,
  Download,
  LoaderCircle,
  RotateCcw,
  RotateCw,
  Rows3,
  ScanText,
  Trash2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Slider } from "@/components/ui/slider";
import { Textarea } from "@/components/ui/textarea";
import { Separator } from "@/components/ui/separator";
import { ToolButton } from "./tool-button";
import { ColorPicker } from "./color-picker";
import type {
  Annotation,
  ExportCompression,
  GroupExportFormat,
  GroupExportPreferences,
  GroupOrderMode,
  EditorState,
} from "@/lib/editor/types";
import type { PageAlignment } from "@/lib/editor/model";

type InspectorProps = {
  state: EditorState;
  onRotate: (delta: number) => void;
  onDuplicate: () => void;
  onDeletePages: () => void;
  onRenamePage: (pageId: string, name: string) => void;
  onAlignPages: (alignment: PageAlignment) => void;
  onArrangePages: (direction: "horizontal" | "vertical") => void;
  onUpdateAnnotation: (annotationId: string, patch: Partial<Annotation>) => void;
  onDeleteAnnotation: (annotationId: string) => void;
  onRenameGroup: (groupId: string, name: string) => void;
  onSetGroupOrder: (groupId: string, mode: GroupOrderMode) => void;
  onUpdateGroupExport: (groupId: string, patch: Partial<GroupExportPreferences>) => void;
  onDeleteGroup: (groupId: string) => void;
  onExportGroup: (groupId: string) => void;
  onRecognizePages: () => void;
  recognizingText: boolean;
};

function ColorControl({ id, label, value, onChange }: { id: string; label: string; value: string; onChange: (value: string) => void }) {
  return (
    <Field orientation="horizontal" id={id} className="flex items-center justify-between gap-3">
      <FieldLabel>{label}</FieldLabel>
      <ColorPicker label={label} value={value} onChange={onChange} side="left" className="border border-border" />
    </Field>
  );
}

export function Inspector({
  state,
  onRotate,
  onDuplicate,
  onDeletePages,
  onRenamePage,
  onAlignPages,
  onArrangePages,
  onUpdateAnnotation,
  onDeleteAnnotation,
  onRenameGroup,
  onUpdateGroupExport,
  onDeleteGroup,
  onExportGroup,
  onRecognizePages,
  recognizingText,
}: InspectorProps) {
  const annotation = state.annotations.find((item) => item.id === state.selectedAnnotationId);
  const group = state.groups.find((item) => item.id === state.selectedGroupId);
  const selectedPages = state.pages.filter((page) => state.selectedPageIds.includes(page.id));

  if (annotation) {
    const colorLabel = annotation.type === "text" || annotation.type === "replacement" ? "Color del texto" : "Trazo";
    return (
      <div className="flex flex-col gap-5 p-4">
        <div><h2 className="text-sm font-medium">Anotación</h2><p className="mt-1 text-xs text-muted-foreground capitalize">{annotation.type}</p></div>
        {(annotation.type === "text" || annotation.type === "replacement") && (
          <Field className="flex flex-col gap-2">
            <FieldLabel htmlFor="annotation-text">Texto</FieldLabel>
            <Textarea id="annotation-text" value={annotation.text} onChange={(event) => onUpdateAnnotation(annotation.id, { text: event.target.value } as Partial<Annotation>)} className="min-h-24 resize-none" />
          </Field>
        )}
        <ColorControl id="annotation-color" label={colorLabel} value={annotation.color} onChange={(color) => onUpdateAnnotation(annotation.id, { color } as Partial<Annotation>)} />
        {annotation.type === "rectangle" && (
          <ColorControl id="annotation-fill" label="Relleno" value={annotation.fillColor ?? annotation.color} onChange={(fillColor) => onUpdateAnnotation(annotation.id, { fillColor } as Partial<Annotation>)} />
        )}
        {annotation.type === "replacement" && (
          <>
            <ColorControl id="replacement-background" label="Fondo" value={annotation.backgroundColor} onChange={(backgroundColor) => onUpdateAnnotation(annotation.id, { backgroundColor } as Partial<Annotation>)} />
            <div className="flex flex-col gap-3">
              <div className="flex items-center justify-between"><Label>Tamaño</Label><span className="font-mono text-[11px] text-muted-foreground">{Math.round(annotation.fontSize)} px</span></div>
              <Slider aria-label="Tamaño del texto" min={6} max={72} value={annotation.fontSize} onValueChange={(value) => onUpdateAnnotation(annotation.id, { fontSize: Number(value) } as Partial<Annotation>)} />
            </div>
          </>
        )}
        <div className="flex flex-col gap-3">
          <div className="flex items-center justify-between"><Label>Opacidad</Label><span className="font-mono text-[11px] text-muted-foreground">{Math.round(annotation.opacity * 100)}%</span></div>
          <Slider aria-label="Opacidad" min={0.1} max={1} step={0.05} value={annotation.opacity} onValueChange={(value) => onUpdateAnnotation(annotation.id, { opacity: Number(value) } as Partial<Annotation>)} />
        </div>
        {(annotation.type === "ink" || annotation.type === "highlight" || annotation.type === "rectangle") && (
          <div className="flex flex-col gap-3">
            <div className="flex items-center justify-between"><Label>Grosor</Label><span className="font-mono text-[11px] text-muted-foreground">{Math.round(annotation.size ?? 2)} px</span></div>
            <Slider aria-label="Grosor" min={1} max={32} value={annotation.size ?? 2} onValueChange={(value) => onUpdateAnnotation(annotation.id, { size: Number(value) } as Partial<Annotation>)} />
          </div>
        )}
        <Separator />
        <Button variant="destructive" className="w-full" onClick={() => onDeleteAnnotation(annotation.id)}><Trash2 data-icon="inline-start" /> Eliminar</Button>
      </div>
    );
  }

  if (group) {
    const pageCount = selectedPages.length;
    return (
      <FieldGroup className="flex flex-col gap-5 p-4">
        <div><h2 className="text-sm font-medium">Grupo</h2><p className="mt-1 text-xs text-muted-foreground">{pageCount} páginas</p></div>
        <Field className="flex flex-col gap-2"><FieldLabel htmlFor="group-name">Nombre</FieldLabel><Input id="group-name" value={group.name} onChange={(event) => onRenameGroup(group.id, event.target.value)} /></Field>
        <p className="text-xs text-muted-foreground">La salida sigue el canvas: de izquierda a derecha y de arriba abajo. El árbol se sincroniza al organizar o exportar.</p>
        <div className="grid grid-cols-2 gap-2">
          <Button variant="outline" onClick={() => onArrangePages("horizontal")}><Columns3 data-icon="inline-start" /> En fila</Button>
          <Button variant="outline" onClick={() => onArrangePages("vertical")}><Rows3 data-icon="inline-start" /> En columna</Button>
        </div>
        <Separator />
        <Field className="flex flex-col gap-2"><FieldLabel htmlFor="group-export-name">Archivo</FieldLabel><Input id="group-export-name" value={group.export.filename} onChange={(event) => onUpdateGroupExport(group.id, { filename: event.target.value })} /></Field>
        <Field className="flex flex-col gap-2">
          <FieldLabel>Formato</FieldLabel>
          <Select items={[{ value: "pdf", label: "PDF" }, { value: "images", label: "Imágenes ZIP" }]} value={group.export.format} onValueChange={(value) => onUpdateGroupExport(group.id, { format: value as GroupExportFormat })}>
            <SelectTrigger className="w-full" aria-label="Formato de exportación"><SelectValue>{(value) => value === "images" ? "Imágenes ZIP" : "PDF"}</SelectValue></SelectTrigger><SelectContent><SelectGroup><SelectItem value="pdf">PDF</SelectItem><SelectItem value="images">Imágenes ZIP</SelectItem></SelectGroup></SelectContent>
          </Select>
        </Field>
        {group.export.format === "pdf" && (
          <Field className="flex flex-col gap-2">
            <FieldLabel>Compresión</FieldLabel>
            <Select items={[{ value: "editable", label: "Editable" }, { value: "balanced", label: "Equilibrada" }, { value: "compact", label: "Compacta" }]} value={group.export.compression} onValueChange={(value) => onUpdateGroupExport(group.id, { compression: value as ExportCompression })}>
              <SelectTrigger className="w-full" aria-label="Compresión del grupo"><SelectValue>{(value) => ({ editable: "Editable", balanced: "Equilibrada", compact: "Compacta" })[String(value)] ?? String(value)}</SelectValue></SelectTrigger><SelectContent><SelectGroup><SelectItem value="editable">Editable</SelectItem><SelectItem value="balanced">Equilibrada</SelectItem><SelectItem value="compact">Compacta</SelectItem></SelectGroup></SelectContent>
            </Select>
          </Field>
        )}
        <Button className="w-full" onClick={() => onExportGroup(group.id)}><Download data-icon="inline-start" /> Exportar grupo</Button>
        <Button variant="destructive" className="w-full" onClick={() => onDeleteGroup(group.id)}><Trash2 data-icon="inline-start" /> Desagrupar conservando páginas</Button>
      </FieldGroup>
    );
  }

  if (selectedPages.length) {
    const first = selectedPages[0];
    return (
      <div className="flex flex-col gap-5 p-4">
        <div><h2 className="text-sm font-medium">{selectedPages.length === 1 ? first.name : `${selectedPages.length} páginas`}</h2><p className="mt-1 text-xs text-muted-foreground">{Math.round(first.width)} × {Math.round(first.height)} pt</p></div>
        {selectedPages.length === 1 && <Field className="flex flex-col gap-2"><FieldLabel htmlFor="page-name">Nombre</FieldLabel><Input id="page-name" value={first.name} onChange={(event) => onRenamePage(first.id, event.target.value)} /></Field>}
        <Button variant="outline" className="w-full" disabled={recognizingText} onClick={onRecognizePages}>
          {recognizingText ? <LoaderCircle className="animate-spin" /> : <ScanText />}
          {recognizingText ? "Reconociendo…" : "Reconocer texto (OCR)"}
        </Button>
        <div className="grid grid-cols-2 gap-2"><Button variant="outline" onClick={() => onRotate(-90)}><RotateCcw data-icon="inline-start" /> Izquierda</Button><Button variant="outline" onClick={() => onRotate(90)}><RotateCw data-icon="inline-start" /> Derecha</Button><Button variant="outline" onClick={onDuplicate}><Copy data-icon="inline-start" /> Duplicar</Button><Button variant="destructive" onClick={onDeletePages}><Trash2 data-icon="inline-start" /> Eliminar</Button></div>
        {selectedPages.length > 1 && (
          <>
            <Separator />
            <div><Label>Alinear</Label><div className="mt-2 flex flex-wrap gap-1">
              <ToolButton label="Alinear izquierda" onClick={() => onAlignPages("left")}><AlignStartVertical /></ToolButton>
              <ToolButton label="Centrar horizontal" onClick={() => onAlignPages("center-x")}><AlignCenterVertical /></ToolButton>
              <ToolButton label="Alinear derecha" onClick={() => onAlignPages("right")}><AlignEndVertical /></ToolButton>
              <ToolButton label="Alinear arriba" onClick={() => onAlignPages("top")}><AlignStartHorizontal /></ToolButton>
              <ToolButton label="Centrar vertical" onClick={() => onAlignPages("center-y")}><AlignCenterHorizontal /></ToolButton>
              <ToolButton label="Alinear abajo" onClick={() => onAlignPages("bottom")}><AlignEndHorizontal /></ToolButton>
              <ToolButton label="Distribuir horizontal" onClick={() => onAlignPages("distribute-x")}><AlignHorizontalSpaceBetween /></ToolButton>
              <ToolButton label="Distribuir vertical" onClick={() => onAlignPages("distribute-y")}><AlignVerticalSpaceBetween /></ToolButton>
            </div></div>
          </>
        )}
        <Separator />
        <dl className="grid grid-cols-2 gap-x-3 gap-y-2 text-xs"><dt className="text-muted-foreground">Orden</dt><dd className="text-right font-mono">{first.order + 1}</dd><dt className="text-muted-foreground">Rotación</dt><dd className="text-right font-mono">{first.rotation}°</dd><dt className="text-muted-foreground">Posición X</dt><dd className="text-right font-mono">{Math.round(first.x)}</dd><dt className="text-muted-foreground">Posición Y</dt><dd className="text-right font-mono">{Math.round(first.y)}</dd></dl>
      </div>
    );
  }

  return <div className="flex flex-col gap-4 p-4"><div><h2 className="text-sm font-medium">Documento</h2><p className="mt-1 text-xs text-muted-foreground">{state.pages.length} páginas · {state.groups.length} grupos · {state.annotations.length} anotaciones</p></div></div>;
}
