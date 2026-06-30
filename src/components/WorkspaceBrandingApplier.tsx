// Phase 5 — Apply active workspace branding to the running app.
// Mounts inside DashboardLayout (signed-in surfaces only) and updates:
//   - <html> CSS vars: --brand-primary, --brand-secondary, --brand-theme
//   - <meta theme-color>
//   - document.title (prefixes the workspace's app_name when set)
//   - <link rel="icon"> favicon swap (and restores on unmount)
//
// Public marketing/funnel pages keep the host-resolved branding from
// __root.tsx — this component never runs there.
import { useEffect } from "react";
import { useActiveWorkspace } from "@/hooks/useActiveWorkspace";
import { useWorkspaceBranding } from "@/hooks/useWorkspaceBranding";

function setMeta(name: string, content: string) {
  if (typeof document === "undefined") return;
  let el = document.querySelector<HTMLMetaElement>(`meta[name="${name}"]`);
  if (!el) {
    el = document.createElement("meta");
    el.setAttribute("name", name);
    document.head.appendChild(el);
  }
  el.setAttribute("content", content);
}

function setFavicon(href: string) {
  if (typeof document === "undefined") return;
  document.querySelectorAll<HTMLLinkElement>('link[rel~="icon"]').forEach((l) => l.remove());
  const link = document.createElement("link");
  link.rel = "icon";
  link.href = href;
  document.head.appendChild(link);
}

export function WorkspaceBrandingApplier() {
  const { activeWorkspaceId, activeWorkspace } = useActiveWorkspace();
  const { data: branding } = useWorkspaceBranding(activeWorkspaceId);

  useEffect(() => {
    if (typeof document === "undefined") return;
    const root = document.documentElement;

    const prevPrimary = root.style.getPropertyValue("--brand-primary");
    const prevSecondary = root.style.getPropertyValue("--brand-secondary");
    const prevTheme = root.style.getPropertyValue("--brand-theme");
    const prevTitle = document.title;

    if (branding?.primary_color) root.style.setProperty("--brand-primary", branding.primary_color);
    if (branding?.secondary_color) root.style.setProperty("--brand-secondary", branding.secondary_color);
    if (branding?.theme_color) {
      root.style.setProperty("--brand-theme", branding.theme_color);
      setMeta("theme-color", branding.theme_color);
    }

    const appName = branding?.app_name?.trim() || activeWorkspace?.name?.trim();
    if (appName) {
      // Keep existing page title as the suffix.
      const base = prevTitle.includes("·") ? prevTitle.split("·").slice(1).join("·").trim() : prevTitle;
      document.title = base ? `${appName} · ${base}` : appName;
    }

    if (branding?.favicon_url) setFavicon(branding.favicon_url);

    return () => {
      if (prevPrimary) root.style.setProperty("--brand-primary", prevPrimary);
      else root.style.removeProperty("--brand-primary");
      if (prevSecondary) root.style.setProperty("--brand-secondary", prevSecondary);
      else root.style.removeProperty("--brand-secondary");
      if (prevTheme) root.style.setProperty("--brand-theme", prevTheme);
      else root.style.removeProperty("--brand-theme");
      document.title = prevTitle;
    };
  }, [branding, activeWorkspace?.name]);

  return null;
}
