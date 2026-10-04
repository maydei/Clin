"use client";
import { Field, FieldLabel } from "@/components/ui/field";

import { useState } from "react";
import { Pipette } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Popover, PopoverContent, PopoverDescription, PopoverTitle, PopoverTrigger } from "@/components/ui/popover";
import { Slider } from "@/components/ui/slider";
import { cn } from "@/lib/utils";

type ColorPickerProps = {
  label: string;
  value: string;
  onChange: (color: string) => void;
  className?: string;
  side?: "top" | "bottom" | "left" | "right" | "inline-start" | "inline-end";
};

const palette = ["#18181b", "#ffffff", "#fdc700", "#ef4444", "#f97316", "#22c55e", "#06b6d4", "#3b82f6", "#8b5cf6", "#ec4899"];
const validHex = /^#[0-9a-f]{6}$/i;

function hexToRgb(hex: string) {
  const normalized = validHex.test(hex) ? hex : "#000000";
  return {
    r: Number.parseInt(normalized.slice(1, 3), 16),
    g: Number.parseInt(normalized.slice(3, 5), 16),
    b: Number.parseInt(normalized.slice(5, 7), 16),
  };
}

function rgbToHex(r: number, g: number, b: number) {
  return `#${[r, g, b].map((channel) => Math.round(channel).toString(16).padStart(2, "0")).join("")}`;
}

function parseCssColor(value: string) {
  if (!value || value === "none" || value === "transparent") return null;
  const canvas = document.createElement("canvas");
  canvas.width = 1;
  canvas.height = 1;
  const context = canvas.getContext("2d", { willReadFrequently: true });
  if (!context) return null;
  const sentinel = "#010203";
  context.fillStyle = sentinel;
  context.fillStyle = value;
  if (context.fillStyle === sentinel && value.toLowerCase() !== sentinel) return null;
  context.clearRect(0, 0, 1, 1);
  context.fillRect(0, 0, 1, 1);
  const pixel = context.getImageData(0, 0, 1, 1).data;
  return pixel[3] > 0 ? rgbToHex(pixel[0], pixel[1], pixel[2]) : null;
}

function sampleApplicationColor(clientX: number, clientY: number) {
  for (const element of document.elementsFromPoint(clientX, clientY)) {
    if (element instanceof HTMLCanvasElement) {
      const rect = element.getBoundingClientRect();
      const context = element.getContext("2d", { willReadFrequently: true });
      if (context && rect.width && rect.height) {
        const x = Math.max(0, Math.min(element.width - 1, Math.floor((clientX - rect.left) * element.width / rect.width)));
        const y = Math.max(0, Math.min(element.height - 1, Math.floor((clientY - rect.top) * element.height / rect.height)));
        const pixel = context.getImageData(x, y, 1, 1).data;
        if (pixel[3] > 0) return rgbToHex(pixel[0], pixel[1], pixel[2]);
      }
    }
    const style = getComputedStyle(element);
    const color = parseCssColor(style.backgroundColor) ?? parseCssColor(style.fill) ?? parseCssColor(style.color);
    if (color) return color;
  }
  return null;
}

export function ColorPicker({ label, value, onChange, className, side = "bottom" }: ColorPickerProps) {
  const normalizedValue = validHex.test(value) ? value.toLowerCase() : "#000000";
  const [draftState, setDraftState] = useState({ source: normalizedValue, value: normalizedValue });
  const [open, setOpen] = useState(false);
  const [message, setMessage] = useState("");
  const [fallbackPicking, setFallbackPicking] = useState(false);
  const rgb = hexToRgb(normalizedValue);
  const draft = draftState.source === normalizedValue ? draftState.value : normalizedValue;

  const emitColor = (next: string) => {
    const normalized = next.toLowerCase();
    setDraftState({ source: normalized, value: normalized });
    onChange(normalized);
  };

  const changeHex = (next: string) => {
    setDraftState({ source: normalizedValue, value: next });
    if (validHex.test(next)) emitColor(next);
  };

  const changeChannel = (channel: "r" | "g" | "b", next: number) => {
    emitColor(rgbToHex(channel === "r" ? next : rgb.r, channel === "g" ? next : rgb.g, channel === "b" ? next : rgb.b));
  };

  const pickColor = async () => {
    const EyeDropperApi = (window as Window & { EyeDropper?: new () => { open: () => Promise<{ sRGBHex: string }> } }).EyeDropper;
    if (EyeDropperApi) {
      try {
        const result = await new EyeDropperApi().open();
        emitColor(result.sRGBHex);
        setMessage("");
      } catch {
        setMessage("Selección cancelada");
      }
      return;
    }

    setMessage("Haz clic sobre un color del documento");
    setOpen(false);
    setFallbackPicking(true);
    document.documentElement.dataset.pickingColor = "true";
    window.setTimeout(() => {
      const finish = () => {
        setFallbackPicking(false);
        document.documentElement.removeAttribute("data-picking-color");
        window.removeEventListener("pointerdown", handlePick, true);
        window.removeEventListener("keydown", handleCancel, true);
      };
      const handlePick = (event: PointerEvent) => {
        event.preventDefault();
        event.stopPropagation();
        const color = sampleApplicationColor(event.clientX, event.clientY);
        if (color) emitColor(color);
        finish();
      };
      const handleCancel = (event: KeyboardEvent) => { if (event.key === "Escape") finish(); };
      window.addEventListener("pointerdown", handlePick, true);
      window.addEventListener("keydown", handleCancel, true);
    });
  };

  return (
    <>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger
          render={<Button type="button" variant="ghost" size="icon-sm" aria-label={label} data-color={normalizedValue} className={className} />}
        >
          <span className="size-4 rounded-full border border-foreground/20 shadow-inner" style={{ backgroundColor: normalizedValue }} />
        </PopoverTrigger>
        <PopoverContent side={side} align="center" className={cn("flex flex-col gap-3", side === "top" && "mb-1")}>
          <div>
            <PopoverTitle>{label}</PopoverTitle>
            <PopoverDescription className="sr-only">Selecciona un color por valor, canales RGB, paleta o cuentagotas.</PopoverDescription>
          </div>
          <div className="flex items-center gap-2">
            <span className="size-9 shrink-0 rounded-md border border-border shadow-inner" style={{ backgroundColor: normalizedValue }} />
            <Input aria-label="Color hexadecimal" value={draft} maxLength={7} onChange={(event) => changeHex(event.target.value)} className="font-mono uppercase" />
            <Button type="button" variant="outline" size="icon" aria-label="Cuentagotas" onClick={() => void pickColor()}><Pipette data-icon="inline-start" /></Button>
          </div>
          <div className="grid grid-cols-5 gap-1.5" aria-label="Paleta de colores">
            {palette.map((color) => (
              <button key={color} type="button" aria-label={`Usar color ${color}`} className="aspect-square rounded-sm border border-foreground/15 outline-none focus-visible:ring-2 focus-visible:ring-ring" style={{ backgroundColor: color }} onClick={() => emitColor(color)} />
            ))}
          </div>
          {(["r", "g", "b"] as const).map((channel) => (
            <Field orientation="horizontal" key={channel} className="grid grid-cols-[14px_1fr_32px] items-center gap-2">
              <FieldLabel className="font-mono text-[10px] uppercase">{channel}</FieldLabel>
              <Slider aria-label={`Canal ${channel === "r" ? "rojo" : channel === "g" ? "verde" : "azul"}`} min={0} max={255} step={1} value={rgb[channel]} onValueChange={(next) => changeChannel(channel, Number(next))} />
              <span className="text-right font-mono text-[10px] text-muted-foreground">{rgb[channel]}</span>
            </Field>
          ))}
          {message && <p aria-live="polite" className="text-[11px] text-muted-foreground">{message}</p>}
        </PopoverContent>
      </Popover>
      {fallbackPicking && <div className="pointer-events-none fixed left-1/2 top-16 z-50 -translate-x-1/2 rounded-md border border-border bg-popover px-3 py-2 text-xs text-popover-foreground shadow-md">Selecciona un color · Esc para cancelar</div>}
    </>
  );
}
