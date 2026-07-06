// Phase 4 — Workspace switcher dropdown.
// Renders nothing if the user has only one workspace (the common case).
import { Check, ChevronsUpDown, Building2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useActiveWorkspace } from "@/hooks/useActiveWorkspace";
import { cn } from "@/lib/utils";

export function WorkspaceSwitcher({ collapsed = false }: { collapsed?: boolean }) {
  const { activeWorkspace, workspaces, setActive, hasMultiple, isLoading } = useActiveWorkspace();

  if (isLoading || !activeWorkspace) return null;
  // Single workspace: still show a compact pill so users know which one they're in.
  const canSwitch = hasMultiple;

  const trigger = (
    <Button
      variant="ghost"
      className={cn(
        "w-full justify-between gap-2 border border-border/60 bg-card/60 hover:bg-muted",
        collapsed ? "px-2" : "px-3",
      )}
    >
      <span className="flex min-w-0 items-center gap-2">
        <Building2 size={16} className="shrink-0 text-muted-foreground" />
        {!collapsed && (
          <span className="truncate text-sm font-medium">{activeWorkspace.name}</span>
        )}
      </span>
      {!collapsed && canSwitch && (
        <ChevronsUpDown size={14} className="shrink-0 text-muted-foreground" />
      )}
    </Button>
  );

  if (!canSwitch) return <div className="px-2 pb-2">{trigger}</div>;

  return (
    <div className="px-2 pb-2">
      <DropdownMenu>
        <DropdownMenuTrigger asChild>{trigger}</DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="w-64">
          <DropdownMenuLabel>Your workspaces</DropdownMenuLabel>
          <DropdownMenuSeparator />
          {workspaces.map((w) => {
            const isActive = w.workspace_id === activeWorkspace.workspace_id;
            return (
              <DropdownMenuItem
                key={w.workspace_id}
                onSelect={() => setActive(w.workspace_id)}
                className="flex items-center justify-between gap-2"
              >
                <span className="flex min-w-0 flex-col">
                  <span className="truncate text-sm">{w.name}</span>
                  <span className="truncate text-[11px] text-muted-foreground">
                    {w.role} · {w.plan}
                  </span>
                </span>
                {isActive && <Check size={14} className="shrink-0" />}
              </DropdownMenuItem>
            );
          })}
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}
