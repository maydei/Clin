"use client";

import { Clock3, FileArchive, FilePlus2, FolderOpen, ShieldCheck, SplitSquareHorizontal, Workflow, Trash2, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { RecentProject } from "@/lib/editor/autosave";

type DashboardViewProps = {
  recentProjects: RecentProject[];
  onOpenPdf: () => void;
  onOpenProject: () => void;
  onNewCanvas: () => void;
  onOpenRecent: (project: RecentProject) => void;
  onOpenCanvas: () => void;
  onOpenTool: (tool: DashboardTool) => void;
  onRemoveRecent: (project: RecentProject) => void;
  onRecoverLast: () => void;
  onClearRecent: () => void;
};

export type DashboardTool = "organize" | "compress" | "split" | "protect";

const tools = [
  { id: "organize" as const, label: "Organizar", description: "Ordenar, agrupar y combinar páginas.", icon: Workflow },
  { id: "compress" as const, label: "Comprimir", description: "Crear una copia visual más ligera.", icon: FileArchive },
  { id: "split" as const, label: "Separar", description: "Preparar grupos y entregables independientes.", icon: SplitSquareHorizontal },
  { id: "protect" as const, label: "Firmar", description: "Firma digital, contraseña y permisos.", icon: ShieldCheck },
];

export function ToolList({ onOpenTool, disabled = false }: { onOpenTool: (tool: DashboardTool) => void; disabled?: boolean }) {
  return <div className="flex flex-col gap-2">{tools.map(({ id, label, description, icon: Icon }) => (
    <Button key={id} variant="ghost" disabled={disabled} className="h-auto justify-start gap-3 whitespace-normal px-3 py-3 text-left" onClick={() => onOpenTool(id)}>
      <Icon data-icon="inline-start" /><span className="min-w-0"><span className="block">{label}</span><span className="block text-xs text-muted-foreground">{description}</span></span>
    </Button>
  ))}</div>;
}

export function DashboardView({ recentProjects, onOpenPdf, onOpenProject, onNewCanvas, onOpenRecent, onOpenCanvas, onOpenTool, onRemoveRecent, onRecoverLast, onClearRecent }: DashboardViewProps) {
  return (
    <main data-testid="dashboard-view" className="min-h-0 flex-1 overflow-y-auto bg-background">
      <div className="mx-auto grid w-full max-w-6xl gap-8 px-5 py-7 lg:grid-cols-[minmax(0,1.6fr)_minmax(280px,0.8fr)]">
        <section>
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <div><h1 className="text-lg font-semibold">Recientes</h1><p className="mt-1 text-xs text-muted-foreground">Continúa un proyecto o abre un documento.</p></div>
            <div className="flex flex-wrap gap-2"><Button variant="outline" size="sm" onClick={onRecoverLast} disabled={!recentProjects.length}><RotateCcw data-icon="inline-start" /> Recuperar último</Button><Button variant="outline" size="sm" onClick={onClearRecent} disabled={!recentProjects.length}>Limpiar todo</Button><Button variant="outline" size="sm" onClick={onOpenCanvas}>Canvas</Button></div>
          </div>
          <div className="grid gap-2 sm:grid-cols-2">
            {recentProjects.map((project) => (
              <div key={project.id ?? project.updatedAt} className="group flex min-h-24 items-start gap-3 rounded-md border border-border bg-panel p-3 transition-colors hover:border-foreground/30 hover:bg-muted"><button type="button" className="flex min-w-0 flex-1 items-start gap-3 text-left" onClick={() => onOpenRecent(project)}>
                <span className="grid size-10 shrink-0 place-items-center rounded-md bg-foreground text-background"><Clock3 className="size-4" /></span>
                <span className="min-w-0 flex-1"><strong className="block truncate text-sm font-medium">{project.name}</strong><span className="mt-1 block text-xs text-muted-foreground">{project.pageCount} páginas · {new Date(project.updatedAt).toLocaleDateString("es-ES")}</span></span>
              </button><Button variant="ghost" size="icon-sm" aria-label={`Borrar ${project.name}`} onClick={() => onRemoveRecent(project)}><Trash2 /></Button></div>
            ))}
            {!recentProjects.length && <div className="col-span-full border-y border-border py-10 text-center text-xs text-muted-foreground">No hay proyectos recientes.</div>}
          </div>
          <div className="mt-6 flex flex-wrap gap-2">
            <Button onClick={onOpenPdf}><FilePlus2 data-icon="inline-start" /> Abrir PDF</Button>
            <Button variant="outline" onClick={onOpenProject}><FolderOpen data-icon="inline-start" /> Abrir proyecto</Button>
            <Button variant="outline" onClick={onNewCanvas}>Nuevo espacio</Button>
          </div>
        </section>

        <section>
          <h2 className="text-sm font-semibold">Herramientas</h2>
          <div className="mt-4"><ToolList onOpenTool={onOpenTool} /></div>
        </section>
      </div>
    </main>
  );
}
