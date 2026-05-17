import { useState } from "react";
import { ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";

const faqs = [
  {
    q: "How is Nevorai different from YouTube or Vimeo?",
    a: "Nevorai plays only the video you share — no recommendations, no ads, no algorithm sending viewers to competitors. Every viewer stays inside your funnel and becomes a trackable lead.",
  },
  {
    q: "Can my viewers skip ahead in the video?",
    a: "No. Locked playback prevents skipping ahead so prospects watch your pitch exactly the way you intended. You can still allow rewinding if you want.",
  },
  {
    q: "Do I need a Pro plan to capture leads?",
    a: "No. Lead capture is included on every paid plan and even on the Free tier. You can trigger a form mid-video on any plan.",
  },
  {
    q: "Does it work on WhatsApp?",
    a: "Yes. Every Nevorai link generates a rich WhatsApp preview with your thumbnail and title. Share with one tap on India's #1 channel.",
  },
  {
    q: "Can I cancel anytime?",
    a: "Yes. Cancel in one click from your billing page. You keep access until the end of your current billing period — no questions, no retention calls.",
  },
  {
    q: "Do you support live webinars?",
    a: "Yes. Pro plans include Live Sessions — stream webinars with the same lead-capture engine that powers your recorded funnels.",
  },
];

export const FAQ = () => {
  const [open, setOpen] = useState<number>(0);
  return (
    <section id="faq" className="py-24 md:py-32 bg-white">
      <div className="mx-auto max-w-3xl px-6 md:px-8">
        <div className="text-center mb-12">
          <h2 className="text-4xl md:text-5xl font-semibold tracking-tight text-[#0A0A0A]">
            Common questions.
          </h2>
          <p className="mt-4 text-lg text-[var(--nv2-muted)]">
            Can't find what you're looking for? Email{" "}
            <a className="text-[var(--nv2-link)] underline-offset-4 hover:underline" href="mailto:teamnevorai@gmail.com">
              teamnevorai@gmail.com
            </a>
          </p>
        </div>

        <div className="border-t border-[var(--nv2-border)]">
          {faqs.map((f, i) => {
            const isOpen = open === i;
            return (
              <div key={f.q} className="border-b border-[var(--nv2-border)]">
                <button
                  type="button"
                  onClick={() => setOpen(isOpen ? -1 : i)}
                  className="w-full py-6 flex items-center justify-between gap-6 text-left min-h-11"
                  aria-expanded={isOpen}
                >
                  <span className="text-base font-medium text-[#0A0A0A]">{f.q}</span>
                  <ChevronDown
                    strokeWidth={1.5}
                    className={cn(
                      "h-5 w-5 shrink-0 text-[var(--nv2-muted)] transition-transform duration-200",
                      isOpen && "rotate-180",
                    )}
                  />
                </button>
                <div
                  className={cn(
                    "grid transition-all duration-300 ease-out",
                    isOpen ? "grid-rows-[1fr] opacity-100 pb-6" : "grid-rows-[0fr] opacity-0",
                  )}
                >
                  <div className="overflow-hidden">
                    <p className="text-sm text-[var(--nv2-muted)] leading-relaxed pr-8">{f.a}</p>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
};
