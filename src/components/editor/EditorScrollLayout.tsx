import { useEffect, useRef, useState, ReactNode, Children, isValidElement } from "react";
import { Check, Lock as LockIcon } from "lucide-react";
import type { LucideIcon } from "lucide-react";

export type EditorSection = {
  id: string;
  label: string;
  num?: string | number;
  icon: LucideIcon;
  complete?: boolean;
  locked?: boolean;
};

interface Props {
  sections: EditorSection[];
  children: ReactNode;
  /** Optional right column (e.g. live preview). Hidden on <xl screens. */
  rightPane?: ReactNode;
  /** Sticky header content (title + Save button + status). Always visible. */
  header?: ReactNode;
}

/**
 * Single-section editor layout: only the active section is shown in the main
 * pane (tab-style), so the workspace stays focused. Sidebar (desktop) and chip
 * strip (mobile) act as the section switcher.
 */
export function EditorScrollLayout({ sections, children, rightPane, header }: Props) {
  const [active, setActive] = useState<string>(sections[0]?.id ?? "");
  const chipRefs = useRef<Record<string, HTMLButtonElement | null>>({});
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!sections.find((s) => s.id === active)) {
      setActive(sections[0]?.id ?? "");
    }
  }, [sections, active]);

  useEffect(() => {
    const el = chipRefs.current[active];
    if (el) {
      try { el.scrollIntoView({ behavior: "smooth", block: "nearest", inline: "center" }); } catch {}
    }
    if (panelRef.current) {
      panelRef.current.scrollTo?.({ top: 0, behavior: "auto" });
    }
  }, [active]);

  const childrenArray = Children.toArray(children);
  const activeChild = childrenArray.find(
    (c) => isValidElement(c) && (c.props as any)?.id === active,
  );

  return (
    <div className="flex gap-6 min-h-[calc(100vh-8rem)]">
      <aside className="hidden lg:flex flex-col gap-1 w-52 shrink-0 sticky top-20 self-start max-h-[calc(100vh-6rem)] overflow-y-auto pr-1">
        {sections.map((s, i) => {
          const isActive = active === s.id;
          return (
            <button
              key={s.id}
              type="button"
              onClick={() => setActive(s.id)}
              className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-left transition-all border-l-[3px] ${
                isActive
                  ? "bg-primary/10 border-primary text-foreground"
                  : "border-transparent text-muted-foreground hover:text-foreground hover:bg-muted"
              }`}
            >
              <s.icon size={15} className={isActive ? "text-primary" : ""} />
              <div className="min-w-0 flex-1">
                <p className="text-[10px] font-semibold tracking-[0.05em] text-muted-foreground/50">
                  {s.num ?? i + 1}
                </p>
                <p className="text-[13px] font-semibold leading-tight flex items-center gap-1.5">
                  {s.label}
                  {s.locked && <LockIcon size={10} className="text-amber-500 shrink-0" />}
                </p>
              </div>
              {s.complete && <Check size={14} className="ml-auto text-emerald-500" />}
            </button>
          );
        })}
      </aside>

      <div className="flex-1 flex gap-6 min-w-0">
        <div className="flex-1 max-w-2xl min-w-0">
          <div className="sticky top-0 z-30 mb-3 bg-background/95 backdrop-blur">
            {header}
            <div className="lg:hidden px-3 sm:px-4 py-2 border-b border-border">
              <div className="flex gap-1.5 overflow-x-auto no-scrollbar scroll-smooth">
                {sections.map((s, i) => {
                  const isActive = active === s.id;
                  return (
                    <button
                      key={s.id}
                      ref={(el) => { chipRefs.current[s.id] = el; }}
                      type="button"
                      onClick={() => setActive(s.id)}
                      className={`shrink-0 inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-full text-[11px] font-semibold transition-all ${
                        isActive
                          ? "bg-primary text-primary-foreground"
                          : "bg-muted/60 text-muted-foreground"
                      }`}
                    >
                      <s.icon size={12} />
                      <span>{s.num ?? i + 1} {s.label}</span>
                      {s.locked && <LockIcon size={10} className="text-amber-500" />}
                      {s.complete && !isActive && <Check size={10} className="text-emerald-500" />}
                    </button>
                  );
                })}
              </div>
            </div>
          </div>

          <div ref={panelRef} className="px-3 sm:px-4 md:px-8 space-y-6">
            {activeChild ?? childrenArray[0]}
          </div>
        </div>

        {rightPane && (
          <div className="hidden xl:block w-[300px] shrink-0 sticky top-20 self-start h-[calc(100vh-10rem)]">
            {rightPane}
          </div>
        )}
      </div>
    </div>
  );
}

/** Wraps a section block with a stable id used by the layout's section switcher. */
export function EditorSectionBlock({
  id,
  children,
  className = "",
}: {
  id: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section id={id} className={`glass-card p-4 sm:p-6 space-y-4 ${className}`}>
      {children}
    </section>
  );
}
