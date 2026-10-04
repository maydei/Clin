"use client";

import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList, CommandShortcut } from "@/components/ui/command";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";

export type EditorCommand = { id: string; label: string; shortcut?: string; checked?: boolean; unavailable?: string; run: () => void };
const normalize = (text: string) => text.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();

export function CommandMenu({ open, onOpenChange, commands }: { open: boolean; onOpenChange: (value: boolean) => void; commands: EditorCommand[] }) {
  return <Dialog open={open} onOpenChange={onOpenChange}>
    <DialogContent className="gap-0 overflow-hidden p-0" showCloseButton={false}>
      <DialogHeader className="sr-only"><DialogTitle>Buscar un comando</DialogTitle><DialogDescription>Acciones disponibles para el documento y la selección actuales.</DialogDescription></DialogHeader>
      <Command filter={(value, search, keywords) => normalize([value, ...(keywords ?? [])].join(" ")).includes(normalize(search)) ? 1 : 0}>
        <CommandInput aria-label="Buscar comandos" placeholder="Buscar un comando…" />
        <CommandList aria-label="Comandos">
          <CommandEmpty>No hay comandos con ese nombre.</CommandEmpty>
          <CommandGroup heading="Acciones" className="[&_[cmdk-group-items]]:flex [&_[cmdk-group-items]]:flex-col [&_[cmdk-group-items]]:gap-1">
            {commands.map((command) => <CommandItem className="min-h-11 gap-4 py-2.5" key={command.id} value={command.id} keywords={[command.label]} disabled={Boolean(command.unavailable)} onSelect={() => { onOpenChange(false); command.run(); }}>
              <span>{command.label}{command.unavailable && <span className="block text-xs text-muted-foreground">{command.unavailable}</span>}</span>
              {command.checked !== undefined && <span role="switch" aria-label={command.label} aria-checked={command.checked} className={`ml-auto inline-flex h-5 w-9 shrink-0 items-center rounded-full p-0.5 ${command.checked ? "bg-primary" : "bg-muted-foreground/30"}`}><span className={`size-4 rounded-full bg-background transition-transform ${command.checked ? "translate-x-4" : ""}`} /></span>}
              {command.shortcut && <CommandShortcut>{command.shortcut}</CommandShortcut>}
            </CommandItem>)}
          </CommandGroup>
        </CommandList>
      </Command>
    </DialogContent>
  </Dialog>;
}
