import { renderTemplate } from "./variables";

interface Props {
  body: string;
  className?: string;
}

export function TemplatePreview({ body, className }: Props) {
  const rendered = renderTemplate(body || "Your message preview will appear here…");
  return (
    <div className={`rounded-lg bg-[#0b141a] p-4 ${className || ""}`}>
      <div className="text-[10px] uppercase tracking-wider text-emerald-300/70 mb-2">WhatsApp preview</div>
      <div className="flex justify-end">
        <div className="relative max-w-[85%] bg-[#005c4b] text-white rounded-lg rounded-tr-sm px-3 py-2 text-sm whitespace-pre-wrap break-words shadow">
          {rendered}
          <div className="text-[10px] text-white/60 text-right mt-1">12:34 ✓✓</div>
        </div>
      </div>
    </div>
  );
}
