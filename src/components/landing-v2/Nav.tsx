import { useEffect, useState } from "react";
import { Link } from "@/lib/router-compat";
import { Menu, X } from "lucide-react";
import { LogoMark } from "./Logo";
import { cn } from "@/lib/utils";

const links = [
  { label: "Pricing", href: "#pricing" },
  { label: "Features", href: "#features" },
  { label: "FAQ", href: "#faq" },
];

export const Nav = () => {
  const [scrolled, setScrolled] = useState(false);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 40);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <header
      className={cn(
        "sticky top-0 z-50 h-16 w-full transition-colors",
        "backdrop-blur-md bg-white/80",
        scrolled ? "border-b border-[var(--nv2-border)]" : "border-b border-transparent",
      )}
    >
      <div className="mx-auto flex h-full max-w-6xl items-center justify-between px-6 md:px-8">
        <Link to="/" aria-label="Nevorai home">
          <LogoMark size={28} />
        </Link>

        <nav className="hidden md:flex items-center gap-8">
          {links.map((l) => (
            <a
              key={l.href}
              href={l.href}
              className="text-sm text-[#0A0A0A]/70 hover:text-[#0A0A0A] transition-colors"
            >
              {l.label}
            </a>
          ))}
        </nav>

        <div className="hidden md:flex items-center gap-2">
          <Link
            to="/auth"
            className="rounded-full border border-[var(--nv2-border)] px-5 py-2 text-sm font-medium text-[#0A0A0A] hover:bg-[var(--nv2-bg-2)] transition-colors min-h-11 inline-flex items-center"
          >
            Login
          </Link>
          <Link
            to="/auth?tab=signup"
            className="rounded-full bg-[var(--nv2-accent)] px-5 py-2 text-sm font-medium text-white hover:bg-orange-600 transition-colors min-h-11 inline-flex items-center"
          >
            Start free →
          </Link>
        </div>

        <button
          type="button"
          className="md:hidden inline-flex items-center justify-center h-11 w-11 -mr-2 text-[#0A0A0A]"
          onClick={() => setOpen((v) => !v)}
          aria-label="Toggle menu"
        >
          {open ? <X className="h-5 w-5" strokeWidth={1.5} /> : <Menu className="h-5 w-5" strokeWidth={1.5} />}
        </button>
      </div>

      {open && (
        <div className="md:hidden border-t border-[var(--nv2-border)] bg-white">
          <div className="mx-auto max-w-6xl px-6 py-4 flex flex-col gap-1">
            {links.map((l) => (
              <a
                key={l.href}
                href={l.href}
                onClick={() => setOpen(false)}
                className="py-3 text-base text-[#0A0A0A]"
              >
                {l.label}
              </a>
            ))}
            <Link
              to="/auth"
              onClick={() => setOpen(false)}
              className="mt-2 rounded-full border border-[var(--nv2-border)] px-5 py-3 text-center text-sm font-medium"
            >
              Login
            </Link>
            <Link
              to="/auth?tab=signup"
              onClick={() => setOpen(false)}
              className="mt-2 rounded-full bg-[var(--nv2-accent)] px-5 py-3 text-center text-sm font-medium text-white"
            >
              Start free →
            </Link>
          </div>
        </div>
      )}
    </header>
  );
};
