import { useDocumentTitle } from "@/hooks/useDocumentTitle";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Sparkles, Calendar } from "lucide-react";

const UPDATES = [
  {
    id: 1,
    title: "Nevorai Academy & Updates Section",
    date: "Aug 5, 2026",
    category: "Feature",
    description: "We've added a dedicated Academy section for tutorials and a What's New section to keep you updated on the latest features and fixes.",
  },
  {
    id: 2,
    title: "Consolidated UI & Navigation",
    date: "Aug 4, 2026",
    category: "UI/UX",
    description: "Simplified the sidebar and mobile navigation for a cleaner experience. Access Funnels, Landing Pages, and Videos directly.",
  }
];

export default function UpdatesPage() {
  useDocumentTitle("What's New · Nevorai");

  return (
    <div className="space-y-6">
      <div className="rounded-2xl border border-border bg-gradient-to-br from-primary/10 via-card to-card p-4 sm:p-6">
        <h1 className="flex items-center gap-2 text-xl font-bold tracking-tight sm:text-3xl">
          <Sparkles className="text-primary" /> What's New
        </h1>
        <p className="mt-1 text-xs text-muted-foreground sm:text-sm">
          Stay updated with the latest features, improvements, and bug fixes in Nevorai.
        </p>
      </div>

      <div className="grid gap-4">
        {UPDATES.map((update) => (
          <Card key={update.id} className="overflow-hidden border-border transition-all hover:border-primary/50">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <div className="space-y-1">
                <CardTitle className="text-lg font-bold">{update.title}</CardTitle>
                <div className="flex items-center gap-3 text-xs text-muted-foreground">
                  <span className="flex items-center gap-1">
                    <Calendar size={12} /> {update.date}
                  </span>
                  <Badge variant="secondary" className="text-[10px] uppercase tracking-wider">
                    {update.category}
                  </Badge>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <p className="text-sm leading-relaxed text-muted-foreground">
                {update.description}
              </p>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
