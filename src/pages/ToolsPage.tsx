import { useState } from "react";
import { useDocumentTitle } from "@/hooks/useDocumentTitle";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { useNavigate } from "@tanstack/react-router";
import { Layout, Radio, ChevronRight } from "lucide-react";

export default function ToolsPage() {
  useDocumentTitle("Tools");
  const navigate = useNavigate();

  const tools = [
    {
      title: "Landing Pages",
      description: "Create registration pages for your sessions & events",
      icon: Layout,
      path: "/landing-pages",
      color: "text-blue-500",
      bgColor: "bg-blue-500/10",
    },
    {
      title: "Live Sessions",
      description: "Run live video funnels and track real-time engagement",
      icon: Radio,
      path: "/live",
      color: "text-red-500",
      bgColor: "bg-red-500/10",
    },
  ];

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-heading font-bold">Tools</h1>
          <p className="text-muted-foreground text-sm mt-1">
            Extra features to boost your video funnels
          </p>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          {tools.map((tool) => (
            <button
              key={tool.path}
              onClick={() => navigate({ to: tool.path as any })}
              className="flex items-center gap-4 p-4 rounded-xl border border-border bg-card hover:bg-muted/40 transition-all text-left group"
            >
              <div className={`w-12 h-12 rounded-lg ${tool.bgColor} flex items-center justify-center shrink-0`}>
                <tool.icon size={24} className={tool.color} />
              </div>
              <div className="flex-1 min-w-0">
                <h3 className="font-semibold text-foreground group-hover:text-primary transition-colors">
                  {tool.title}
                </h3>
                <p className="text-xs text-muted-foreground line-clamp-2 mt-0.5">
                  {tool.description}
                </p>
              </div>
              <ChevronRight size={18} className="text-muted-foreground group-hover:text-primary transition-colors" />
            </button>
          ))}
        </div>
      </div>
    </DashboardLayout>
  );
}
