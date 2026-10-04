"use client";

import { Check, Cog, Info, ShieldCheck } from "lucide-react";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Field, FieldContent, FieldDescription, FieldGroup, FieldLabel, FieldTitle } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { DEFAULT_ACCENT, accentForeground } from "@/lib/editor/accent";
import { ClinName, MaydeiMark } from "./clin-brand";
import type { Preferences } from "@/lib/editor/preferences";

const themes = [{ value: "system", label: "Sistema" }, { value: "light", label: "Claro" }, { value: "dark", label: "Oscuro" }];
const environments = [{ value: "dashboard", label: "Inicio" }, { value: "canvas", label: "Canvas" }, { value: "reader", label: "Lector" }];
const accents = [{ label: "Amarillo Clin", value: DEFAULT_ACCENT }, { label: "Azul", value: "#2563eb" }, { label: "Verde", value: "#16845b" }, { label: "Violeta", value: "#7c3aed" }, { label: "Rosa", value: "#db2777" }];

type Props = {
  showStatusBar: boolean;
  onStatusBarChange: (value: boolean) => void;
  revealMargin: number;
  onRevealMarginChange: (value: number) => void;
  zen: boolean;
  onZenChange: (value: boolean) => void;
  startInZen: boolean;
  onStartInZenChange: (value: boolean) => void;
  interfaceHidden: boolean;
  onInterfaceHiddenChange: (value: boolean) => void;
  accentColor: string;
  onAccentChange: (color: string) => void;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  theme: Preferences["theme"];
  onThemeChange: (theme: Preferences["theme"]) => void;
  startup: Preferences["startup"];
  onStartupChange: (startup: Preferences["startup"]) => void;
  diagnostics: boolean;
  onDiagnosticsChange: (enabled: boolean) => void;
  hasHiddenConfirmations: boolean;
  confirmationOptions: { id: string; label: string; description: string; checked: boolean; onCheckedChange: (checked: boolean) => void }[];
  onRestoreConfirmations: () => void;
};

export function GeneralSettings(props: Props) {
  return <Dialog open={props.open} onOpenChange={props.onOpenChange}>
    <DialogContent className="flex max-h-[85dvh] flex-col gap-0 overflow-hidden p-0 sm:max-w-[660px]">
      <DialogHeader className="shrink-0 px-6 pb-5 pt-6">
        <DialogTitle>Ajustes</DialogTitle>
        <DialogDescription>Personaliza tu espacio de trabajo.</DialogDescription>
      </DialogHeader>
      <Tabs defaultValue="general" className="min-h-0 flex-1 gap-0 overflow-auto">
        <TabsList variant="line" className="mx-6 mb-1 w-auto justify-start" aria-label="Categorías de ajustes">
          <TabsTrigger value="general"><Cog /> General</TabsTrigger>
          <TabsTrigger value="view">Vista</TabsTrigger>
          <TabsTrigger value="security"><ShieldCheck /> Seguridad</TabsTrigger>
          <TabsTrigger value="about"><Info /> Acerca de</TabsTrigger>
        </TabsList>
        <Separator />
        <TabsContent value="general" className="px-6 py-6">
          <FieldGroup>
            <Field orientation="responsive">
              <FieldContent><FieldLabel htmlFor="settings-theme">Apariencia</FieldLabel><FieldDescription id="theme-help">Elige cómo se ve Clin.</FieldDescription></FieldContent>
              <Select items={themes} value={props.theme} onValueChange={(value) => { if (value) props.onThemeChange(value as Props["theme"]); }}>
                <SelectTrigger id="settings-theme" aria-describedby="theme-help" className="w-full sm:w-40"><SelectValue /></SelectTrigger>
                <SelectContent><SelectGroup>{themes.map((item) => <SelectItem key={item.value} value={item.value}>{item.label}</SelectItem>)}</SelectGroup></SelectContent>
              </Select>
            </Field>
            <Separator />
            <Field>
              <FieldContent><FieldTitle id="accent-label">Color de acento</FieldTitle><FieldDescription id="accent-help">Amarillo Clin o un color propio.</FieldDescription></FieldContent>
              <div className="flex flex-wrap items-center gap-3">
                <ToggleGroup value={accents.some((item) => item.value === props.accentColor) ? [props.accentColor] : []} onValueChange={(values) => { if (values[0]) props.onAccentChange(values[0]); }} aria-labelledby="accent-label" aria-describedby="accent-help" variant="outline" size="sm" spacing={2}>
                  {accents.map(({ label, value }) => <ToggleGroupItem key={value} value={value} aria-label={label}>
                    <span className="flex size-5 items-center justify-center rounded-full" style={{ backgroundColor: value, color: accentForeground(value) }}>{props.accentColor === value && <Check />}</span>
                  </ToggleGroupItem>)}
                </ToggleGroup>
                <Input type="color" aria-label="Color de acento personalizado" value={props.accentColor} onChange={(event) => props.onAccentChange(event.target.value)} className="h-8 w-10 p-1" />
              </div>
            </Field>
            <Separator />
            <Field orientation="responsive">
              <FieldContent><FieldLabel htmlFor="settings-startup">Al iniciar Clin</FieldLabel><FieldDescription id="startup-help">Pantalla que se abre al iniciar el programa.</FieldDescription></FieldContent>
              <Select items={environments} value={props.startup} onValueChange={(value) => { if (value) props.onStartupChange(value as Props["startup"]); }}>
                <SelectTrigger id="settings-startup" aria-describedby="startup-help" className="w-full sm:w-40"><SelectValue /></SelectTrigger>
                <SelectContent><SelectGroup>{environments.map((item) => <SelectItem key={item.value} value={item.value}>{item.label}</SelectItem>)}</SelectGroup></SelectContent>
              </Select>
            </Field>
            <Accordion>
              <AccordionItem value="advanced"><AccordionTrigger>Avanzado</AccordionTrigger><AccordionContent>
                <Field orientation="horizontal"><FieldContent><FieldLabel htmlFor="diagnostics-enabled">Herramientas de diagnóstico</FieldLabel><FieldDescription id="diagnostics-help">Registra errores y tiempos de esta sesión.</FieldDescription></FieldContent><Switch id="diagnostics-enabled" aria-describedby="diagnostics-help" checked={props.diagnostics} onCheckedChange={props.onDiagnosticsChange} /></Field>
              </AccordionContent></AccordionItem>
            </Accordion>
          </FieldGroup>
        </TabsContent>
        <TabsContent value="view" className="px-6 py-6">
          <FieldGroup>
            <Field orientation="horizontal"><FieldContent><FieldLabel htmlFor="view-hidden">Ocultar la interfaz</FieldLabel><FieldDescription>Acerca el puntero a los bordes para recuperar los controles. Atajo: º.</FieldDescription></FieldContent><Switch id="view-hidden" checked={props.interfaceHidden} onCheckedChange={props.onInterfaceHiddenChange} /></Field>
            <Field><FieldLabel htmlFor="view-margin">Margen activo: {props.revealMargin} px</FieldLabel><input id="view-margin" type="range" min="8" max="96" step="1" value={props.revealMargin} onChange={e => props.onRevealMarginChange(Number(e.target.value))} className="w-full accent-primary" /><FieldDescription>Distancia desde el borde que revela las barras y los paneles.</FieldDescription></Field>
            <Separator />
            <Field orientation="horizontal"><FieldContent><FieldLabel htmlFor="view-zen">Modo Zen</FieldLabel><FieldDescription>Trabaja a pantalla completa.</FieldDescription></FieldContent><Switch id="view-zen" checked={props.zen} onCheckedChange={props.onZenChange} /></Field>
            <Field orientation="horizontal" className="ml-5 border-l border-border pl-4"><FieldContent><FieldLabel htmlFor="view-start-zen">Iniciar en modo Zen</FieldLabel><FieldDescription>Se aplica la próxima vez que abras Clin.</FieldDescription></FieldContent><Switch id="view-start-zen" checked={props.startInZen} onCheckedChange={props.onStartInZenChange} /></Field>
            <Separator />
            <Field orientation="horizontal"><FieldContent><FieldLabel htmlFor="view-status">Barra de estado</FieldLabel><FieldDescription>Información del documento en la parte inferior.</FieldDescription></FieldContent><Switch id="view-status" checked={props.showStatusBar} onCheckedChange={props.onStatusBarChange} /></Field>
            <FieldDescription>Arrastra el borde interior de los paneles para cambiar su ancho. Al reiniciar recuperan su tamaño original.</FieldDescription>
          </FieldGroup>
        </TabsContent>
        <TabsContent value="security" className="flex flex-col gap-6 px-6 py-6">
          <FieldGroup>
            <Field><FieldTitle>Protección del trabajo</FieldTitle><FieldDescription>Elige cuándo pedir confirmación. Si desactivas un aviso, la acción se realizará directamente.</FieldDescription></Field>
            {props.confirmationOptions.map((option) => <Field key={option.id} orientation="horizontal">
              <FieldContent><FieldLabel htmlFor={`confirm-${option.id}`}>Confirmar antes de {option.label.toLocaleLowerCase("es")}</FieldLabel><FieldDescription id={`confirm-${option.id}-help`}>{option.description}</FieldDescription></FieldContent>
              <Switch id={`confirm-${option.id}`} aria-describedby={`confirm-${option.id}-help`} checked={option.checked} onCheckedChange={option.onCheckedChange} />
            </Field>)}
            <Button className="w-fit" variant="outline" disabled={!props.hasHiddenConfirmations} onClick={props.onRestoreConfirmations}>Restablecer avisos de confirmación</Button>
            <FieldDescription role="status">{props.hasHiddenConfirmations ? "Algunos avisos están desactivados." : "Todos los avisos de confirmación están activos."}</FieldDescription>
            <Separator /><Field><FieldTitle>Guardado y privacidad</FieldTitle><FieldDescription>La recuperación automática guarda el trabajo en este equipo. Antes de reconocer texto, se crea una copia en Recientes. Guarda también un archivo .clin para conservar tu proyecto fuera del navegador.</FieldDescription></Field>
          </FieldGroup>
        </TabsContent>
        <TabsContent value="about" className="flex flex-col gap-4 px-6 py-6">
          <ClinName /><a href="https://maydei.gumroad.com/l/clin" target="_blank" rel="noopener noreferrer" className="w-fit rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground">Descargar para Windows en Gumroad</a><p className="text-sm text-muted-foreground">PDF Studio · Web · Versión 0.2.2</p><div className="flex items-center gap-2 text-sm text-muted-foreground"><MaydeiMark /><span>Desarrollado por Maydei © 2026</span></div><a href="mailto:support@maydei.es" className="w-fit rounded-md bg-primary px-2 py-1 text-sm text-primary-foreground underline underline-offset-4">support@maydei.es</a>
        </TabsContent>
      </Tabs>
      <Separator />
      <DialogFooter className="shrink-0 flex-row items-center justify-between px-6 py-4"><span className="mr-auto text-xs text-muted-foreground">Los cambios se guardan automáticamente.</span><Button variant="outline" onClick={() => props.onOpenChange(false)}>Listo</Button></DialogFooter>
    </DialogContent>
  </Dialog>;
}

