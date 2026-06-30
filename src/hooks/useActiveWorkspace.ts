// Phase 4 — Active workspace selection.
// Persists the user's currently-selected workspace in localStorage and
// exposes a switcher API. Defaults to the first workspace returned by
// useWorkspaces() (which is sorted owner > admin > member, then alpha).
import { useCallback, useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useWorkspaces, type WorkspaceMembership } from "@/hooks/useWorkspaces";
import { useAuth } from "@/hooks/useAuth";

const STORAGE_KEY = "nflow.active_workspace_id";

function readStored(): string | null {
  if (typeof window === "undefined") return null;
  try { return window.localStorage.getItem(STORAGE_KEY); } catch { return null; }
}
function writeStored(id: string | null) {
  if (typeof window === "undefined") return;
  try {
    if (id) window.localStorage.setItem(STORAGE_KEY, id);
    else window.localStorage.removeItem(STORAGE_KEY);
  } catch { /* ignore */ }
}

export function useActiveWorkspace() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const { data: workspaces = [], isLoading } = useWorkspaces();
  const [activeId, setActiveId] = useState<string | null>(() => readStored());

  // Reset on sign-out
  useEffect(() => {
    if (!user?.id) {
      setActiveId(null);
      writeStored(null);
    }
  }, [user?.id]);

  // Fall back to the first workspace if stored value isn't a current membership.
  useEffect(() => {
    if (!workspaces.length) return;
    const valid = activeId && workspaces.some((w) => w.workspace_id === activeId);
    if (!valid) {
      const fallback = workspaces[0].workspace_id;
      setActiveId(fallback);
      writeStored(fallback);
    }
  }, [activeId, workspaces]);

  const setActive = useCallback((wsId: string) => {
    if (!workspaces.some((w) => w.workspace_id === wsId)) return;
    setActiveId(wsId);
    writeStored(wsId);
    // Refetch anything that depends on workspace scope.
    qc.invalidateQueries();
  }, [workspaces, qc]);

  const active: WorkspaceMembership | null =
    workspaces.find((w) => w.workspace_id === activeId) ?? workspaces[0] ?? null;

  return {
    activeWorkspaceId: active?.workspace_id ?? null,
    activeWorkspace: active,
    workspaces,
    setActive,
    isLoading,
    hasMultiple: workspaces.length > 1,
  };
}
