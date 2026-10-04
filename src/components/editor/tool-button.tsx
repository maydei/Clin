"use client";

import type { ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

type ToolButtonProps = {
  label: string;
  children: ReactNode;
  active?: boolean;
  disabled?: boolean;
  className?: string;
  shortcut?: string;
  onClick?: () => void;
};

export function ToolButton({ label, children, active, disabled, className, shortcut, onClick }: ToolButtonProps) {
  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <Button
            type="button"
            size="icon-sm"
            variant={active ? "secondary" : "ghost"}
            disabled={disabled}
            aria-label={label}
            aria-keyshortcuts={shortcut}
            aria-pressed={active === undefined ? undefined : active}
            className={cn(active && "bg-accent text-accent-foreground hover:bg-primary/20", className)}
            onClick={onClick}
          />
        }
      >
        {children}
      </TooltipTrigger>
      <TooltipContent>{label}{shortcut && <kbd data-slot="kbd" className="ml-1 border-l border-background/25 px-1.5 py-0.5 font-mono text-[10px]">{shortcut}</kbd>}</TooltipContent>
    </Tooltip>
  );
}
