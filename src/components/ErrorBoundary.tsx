import { Component, ReactNode } from "react";
import { Button } from "@/components/ui/button";

interface Props { children: ReactNode; resetKey?: string; }
interface State { hasError: boolean; error: Error | null; info: string | null; }

/**
 * Top-level boundary. Surfaces the real error message (and stack in dev)
 * so issues triggered after migrations / deploys are diagnosable in-place
 * instead of presenting a generic "Something went wrong" wall.
 */
export class ErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false, error: null, info: null };

  componentDidUpdate(prevProps: Props) {
    if (this.state.hasError && prevProps.resetKey !== this.props.resetKey) {
      this.setState({ hasError: false, error: null, info: null });
    }
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error, info: null };
  }

  componentDidCatch(error: Error, info: { componentStack: string }) {
    console.error("[ErrorBoundary]", error, info?.componentStack);
    this.setState({ error, info: info?.componentStack ?? null });
  }

  render() {
    if (this.state.hasError) {
      const isDev = typeof import.meta !== "undefined" && (import.meta as any).env?.DEV;
      const msg = this.state.error?.message || String(this.state.error || "Unknown error");
      const stack = this.state.error?.stack;
      return (
        <div className="min-h-screen flex items-center justify-center p-8">
          <div className="glass-card p-8 max-w-2xl w-full text-left">
            <h2 className="text-lg font-heading font-bold mb-2 text-center">Something went wrong</h2>
            <p className="text-sm text-muted-foreground mb-4 text-center">
              An unexpected error occurred. Please try again — if the problem persists, share the details below with support.
            </p>

            <div className="rounded-md border border-border bg-muted/40 p-3 mb-4 max-h-64 overflow-auto">
              <p className="text-xs font-mono break-words whitespace-pre-wrap text-destructive">
                {msg}
              </p>
              {isDev && stack && (
                <pre className="mt-2 text-[10px] font-mono text-muted-foreground whitespace-pre-wrap break-words">
                  {stack}
                </pre>
              )}
              {isDev && this.state.info && (
                <pre className="mt-2 text-[10px] font-mono text-muted-foreground whitespace-pre-wrap break-words">
                  {this.state.info}
                </pre>
              )}
            </div>

            <div className="flex gap-2 justify-center">
              <Button variant="outline" onClick={() => { navigator.clipboard?.writeText(`${msg}\n\n${stack || ""}\n\n${this.state.info || ""}`); }}>
                Copy details
              </Button>
              <Button onClick={() => { this.setState({ hasError: false, error: null, info: null }); window.location.reload(); }}>
                Reload Page
              </Button>
            </div>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}
