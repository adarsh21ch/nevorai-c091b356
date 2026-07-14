import { useEffect, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { useDocumentTitle } from "@/hooks/useDocumentTitle";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Sparkles, Send, Loader2, Upload, Layers, Users, CreditCard, BarChart3, HelpCircle } from "lucide-react";
import { cn } from "@/lib/utils";

type ChatMsg = { role: "user" | "assistant"; content: string };

const QUICK_PROMPTS: { icon: React.ComponentType<{ size?: number; className?: string }>; label: string; prompt: string }[] = [
  { icon: Upload, label: "How do I upload a video?", prompt: "How do I upload a video? Give me the exact steps." },
  { icon: Layers, label: "How do I create a funnel?", prompt: "How do I create a funnel and share it with my prospects?" },
  { icon: Users, label: "How do I add my team?", prompt: "How do I invite my team / downline and share leads with them?" },
  { icon: CreditCard, label: "How do I upgrade / pay?", prompt: "How do I upgrade my plan and add a payment method?" },
  { icon: BarChart3, label: "How are my numbers today?", prompt: "Give me a summary of my views, leads, and conversion rate today and this week." },
  { icon: HelpCircle, label: "Where do I see my leads?", prompt: "Where do I see and export the leads I have captured?" },
];

const NevAIPage = () => {
  useDocumentTitle("Nev AI");
  const [messages, setMessages] = useState<ChatMsg[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [usage, setUsage] = useState<{ used: number; limit: number } | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, loading]);

  const sendMessage = async (text: string) => {
    const trimmed = text.trim();
    if (!trimmed || loading) return;
    const nextHistory = [...messages, { role: "user" as const, content: trimmed }];
    setMessages(nextHistory);
    setInput("");
    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke("nev-ai-query", {
        body: { message: trimmed, history: messages },
      });

      // Supabase wraps non-2xx in `error`, but the function still returns a body
      // with `reply` for 403/429. Try to read it.
      let reply: string | undefined;
      let usagePayload: { used: number; limit: number } | null = null;

      if (data && typeof data === "object") {
        reply = (data as any).reply;
        usagePayload = (data as any).usage ?? null;
      }
      if (!reply && error) {
        const ctx: any = (error as any).context;
        try {
          const body = ctx?.body
            ? typeof ctx.body === "string"
              ? JSON.parse(ctx.body)
              : ctx.body
            : null;
          if (body?.reply) reply = body.reply;
          if (body?.usage) usagePayload = body.usage;
        } catch {
          // ignore parse errors
        }
        // try response.json() if body wasn't preparsed
        if (!reply && ctx?.response && typeof ctx.response.json === "function") {
          try {
            const body = await ctx.response.json();
            if (body?.reply) reply = body.reply;
            if (body?.usage) usagePayload = body.usage;
          } catch {
            // ignore
          }
        }
      }

      if (!reply) reply = "Something went wrong, please try again.";
      setMessages((prev) => [...prev, { role: "assistant", content: reply! }]);
      if (usagePayload) setUsage(usagePayload);
    } catch {
      setMessages((prev) => [
        ...prev,
        { role: "assistant", content: "Something went wrong, please try again." },
      ]);
    } finally {
      setLoading(false);
    }
  };

  const handleKey = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendMessage(input);
    }
  };

  return (
    <DashboardLayout>
      <div className="flex h-[calc(100vh-7rem)] flex-col gap-4">
        <div>
          <div className="flex items-center gap-2">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary/10">
              <Sparkles size={18} className="text-primary" />
            </div>
            <div>
              <h1 className="text-xl font-heading font-bold sm:text-2xl">Nev AI</h1>
              <p className="text-xs text-muted-foreground sm:text-sm">
                Your helping hand — ask anything about the app or your numbers.
              </p>
            </div>
          </div>
          <div className="page-header-accent" />
        </div>

        <div className="premium-card flex min-h-0 flex-1 flex-col overflow-hidden p-0">
          {/* Messages */}
          <div ref={scrollRef} className="flex-1 overflow-y-auto px-4 py-5 sm:px-6">
            {messages.length === 0 ? (
              <div className="mx-auto max-w-2xl">
                <div className="flex items-start gap-3">
                  <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary/10">
                    <Sparkles size={16} className="text-primary" />
                  </div>
                  <div className="rounded-2xl rounded-tl-sm bg-muted px-4 py-3 text-sm">
                    Hi! I'm <span className="font-semibold">Nev AI</span> — your Nevorai helper. Ask me <span className="font-medium">how to use anything</span> in the app (upload video, create funnel, add team, payments, tracking…) or about <span className="font-medium">your numbers</span> (views, leads, conversions). I'm here so you never have to text support.
                  </div>
                </div>
                <div className="mt-5 grid grid-cols-1 gap-2 sm:grid-cols-2">
                  {QUICK_PROMPTS.map((q) => {
                    const Icon = q.icon;
                    return (
                      <button
                        key={q.label}
                        onClick={() => sendMessage(q.prompt)}
                        disabled={loading}
                        className="group flex items-start gap-2.5 rounded-xl border border-border bg-card p-3 text-left text-sm transition-all hover:border-primary/50 hover:bg-primary/5 hover:shadow-sm disabled:opacity-50"
                      >
                        <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary group-hover:bg-primary/20">
                          <Icon size={14} />
                        </div>
                        <div className="min-w-0">
                          <div className="font-medium leading-tight">{q.label}</div>
                          <div className="mt-0.5 line-clamp-2 text-[11px] text-muted-foreground">{q.prompt}</div>
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>
            ) : (
              <div className="mx-auto flex max-w-2xl flex-col gap-4">
                {messages.map((m, i) => (
                  <MessageBubble key={i} role={m.role} content={m.content} />
                ))}
                {loading && (
                  <div className="flex items-start gap-3">
                    <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary/10">
                      <Sparkles size={16} className="text-primary" />
                    </div>
                    <div className="flex items-center gap-1 rounded-2xl rounded-tl-sm bg-muted px-4 py-3">
                      <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-muted-foreground/60 [animation-delay:-0.3s]" />
                      <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-muted-foreground/60 [animation-delay:-0.15s]" />
                      <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-muted-foreground/60" />
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Composer */}
          <div className="border-t border-border bg-background/40 px-4 py-3 sm:px-6">
            <div className="mx-auto flex max-w-2xl items-end gap-2">
              <Textarea
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={handleKey}
                placeholder="Ask Nev AI…"
                rows={1}
                disabled={loading}
                className="max-h-32 min-h-[44px] resize-none"
              />
              <Button
                onClick={() => sendMessage(input)}
                disabled={loading || !input.trim()}
                size="icon"
                className="h-11 w-11 shrink-0"
              >
                {loading ? <Loader2 size={16} className="animate-spin" /> : <Send size={16} />}
              </Button>
            </div>
            <div className="mx-auto mt-2 flex max-w-2xl items-center justify-between text-[11px] text-muted-foreground">
              <span>Enter to send · Shift+Enter for newline</span>
              {usage && (
                <span>
                  {usage.used}/{usage.limit} questions today
                </span>
              )}
            </div>
          </div>
        </div>
      </div>
    </DashboardLayout>
  );
};

function MessageBubble({ role, content }: { role: "user" | "assistant"; content: string }) {
  const isUser = role === "user";
  return (
    <div className={cn("flex items-start gap-3", isUser && "flex-row-reverse")}>
      {!isUser && (
        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary/10">
          <Sparkles size={16} className="text-primary" />
        </div>
      )}
      <div
        className={cn(
          "max-w-[85%] rounded-2xl px-4 py-3 text-sm",
          isUser
            ? "rounded-tr-sm bg-primary text-primary-foreground whitespace-pre-wrap"
            : "rounded-tl-sm bg-muted text-foreground",
        )}
      >
        {isUser ? (
          content
        ) : (
          <div className="prose prose-sm max-w-none dark:prose-invert prose-p:my-2 prose-headings:mt-3 prose-headings:mb-1.5 prose-ul:my-2 prose-ol:my-2 prose-li:my-0.5 prose-code:px-1 prose-code:py-0.5 prose-code:bg-background/60 prose-code:rounded prose-code:text-[12px] prose-code:before:content-none prose-code:after:content-none prose-strong:text-foreground">
            <ReactMarkdown remarkPlugins={[remarkGfm]}>{content}</ReactMarkdown>
          </div>
        )}
      </div>
    </div>
  );
}

export default NevAIPage;
