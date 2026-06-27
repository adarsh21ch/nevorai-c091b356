import { useState } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { CheckCircle2, AlertCircle, HelpCircle, ExternalLink, Activity } from "lucide-react";

type Scope = "account" | "funnel" | "landing";

interface Props {
  value: string;
  onChange: (next: string) => void;
  scope: Scope;
  /** For funnel/landing: the account-level fallback if this field is empty. */
  accountPixelId?: string | null;
  className?: string;
}

const sanitize = (raw: string) => raw.replace(/\D/g, "").slice(0, 20);

function validate(v: string): "empty" | "valid" | "too_short" | "too_long" {
  if (!v) return "empty";
  if (v.length < 15) return "too_short";
  if (v.length > 16) return "too_long";
  return "valid";
}

export function MetaPixelIdField({ value, onChange, scope, accountPixelId, className }: Props) {
  const [showHelp, setShowHelp] = useState(false);
  const status = validate(value);

  const scopeLabel =
    scope === "account" ? "your account" : scope === "funnel" ? "this funnel" : "this landing page";

  const effectiveSource: "this" | "account" | "platform" =
    status === "valid"
      ? "this"
      : accountPixelId && validate(accountPixelId) === "valid"
        ? "account"
        : "platform";

  return (
    <div className={className}>
      <div className="flex items-center justify-between gap-2 mb-1.5">
        <Label className="text-sm font-medium flex items-center gap-1.5">
          <Activity size={14} className="text-primary" />
          Meta Pixel ID
          <span className="text-muted-foreground font-normal text-xs">(optional)</span>
        </Label>
        <button
          type="button"
          onClick={() => setShowHelp((s) => !s)}
          className="text-[11px] text-primary hover:underline inline-flex items-center gap-1"
        >
          <HelpCircle size={12} /> Where do I find this?
        </button>
      </div>

      <div className="relative">
        <Input
          value={value}
          onChange={(e) => onChange(sanitize(e.target.value))}
          onPaste={(e) => {
            e.preventDefault();
            const text = e.clipboardData.getData("text");
            onChange(sanitize(text));
          }}
          placeholder="e.g. 1234567890123456"
          inputMode="numeric"
          autoComplete="off"
          className="bg-muted border-border pr-9 font-mono tracking-wide"
          aria-invalid={status === "too_short" || status === "too_long"}
        />
        {status === "valid" && (
          <CheckCircle2
            size={16}
            className="absolute right-2.5 top-1/2 -translate-y-1/2 text-green-500"
          />
        )}
        {(status === "too_short" || status === "too_long") && (
          <AlertCircle
            size={16}
            className="absolute right-2.5 top-1/2 -translate-y-1/2 text-amber-500"
          />
        )}
      </div>

      {/* Inline status line */}
      <div className="mt-1.5 text-[11px] leading-relaxed">
        {status === "valid" && (
          <span className="text-green-600 dark:text-green-400">
            ✓ Looks good — events from {scopeLabel} will fire to pixel{" "}
            <span className="font-mono">{value}</span>.
          </span>
        )}
        {status === "too_short" && (
          <span className="text-amber-600 dark:text-amber-400">
            Meta Pixel IDs are 15–16 digits. You've entered {value.length}.
          </span>
        )}
        {status === "too_long" && (
          <span className="text-amber-600 dark:text-amber-400">
            Too long — Meta Pixel IDs are 15–16 digits.
          </span>
        )}
        {status === "empty" && scope === "account" && (
          <span className="text-muted-foreground">
            Leave empty to use the platform default pixel for all your funnels & landing pages.
          </span>
        )}
        {status === "empty" && scope !== "account" && (
          <span className="text-muted-foreground">
            {effectiveSource === "account" ? (
              <>
                Empty — will use your account default pixel{" "}
                <span className="font-mono">{accountPixelId}</span>.
              </>
            ) : (
              <>Empty — will use the platform default pixel.</>
            )}
          </span>
        )}
      </div>

      {/* Description */}
      <p className="text-[11px] text-muted-foreground mt-1.5">
        {scope === "account"
          ? "Applies to all your funnels & landing pages by default. You can override per funnel or landing page."
          : `PageView and Lead events on ${scopeLabel} will fire to this pixel${
              scope === "funnel" ? "" : ""
            } — overrides your account default.`}
      </p>

      {/* Help disclosure */}
      {showHelp && (
        <div className="mt-2 p-3 rounded-lg border border-border bg-muted/40 text-[11px] space-y-2">
          <p className="font-semibold text-foreground text-xs">How to get your Meta Pixel ID</p>
          <ol className="list-decimal pl-4 space-y-1 text-muted-foreground">
            <li>
              Open <span className="font-medium text-foreground">Meta Events Manager</span> at{" "}
              <a
                href="https://business.facebook.com/events_manager2/list/pixel"
                target="_blank"
                rel="noopener noreferrer"
                className="text-primary hover:underline inline-flex items-center gap-0.5"
              >
                business.facebook.com <ExternalLink size={10} />
              </a>
            </li>
            <li>Select your Pixel (or create one — "Data sources → Connect → Web").</li>
            <li>
              Copy the <span className="font-medium text-foreground">15–16 digit ID</span> shown
              under the pixel name and paste it above.
            </li>
          </ol>
          <div className="flex flex-wrap gap-2 pt-1">
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="h-7 text-[11px]"
              asChild
            >
              <a
                href="https://business.facebook.com/events_manager2/list/pixel"
                target="_blank"
                rel="noopener noreferrer"
              >
                <ExternalLink size={11} className="mr-1" /> Open Events Manager
              </a>
            </Button>
            {status === "valid" && (
              <Button
                type="button"
                size="sm"
                variant="outline"
                className="h-7 text-[11px]"
                asChild
              >
                <a
                  href={`https://business.facebook.com/events_manager2/list/pixel/${value}/test_events`}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  <Activity size={11} className="mr-1" /> Test events for this pixel
                </a>
              </Button>
            )}
          </div>
          <p className="text-muted-foreground pt-1">
            Tip: keep the browser <span className="font-medium">Meta Pixel Helper</span> extension
            open on your published page to confirm events fire in real time.
          </p>
        </div>
      )}
    </div>
  );
}
