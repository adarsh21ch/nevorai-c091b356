import { Button } from "@/components/ui/button";
import { Download } from "lucide-react";

function toCsv(rows: Record<string, any>[]): string {
  if (!rows.length) return "";
  const keys = Array.from(rows.reduce((set, r) => { Object.keys(r).forEach((k) => set.add(k)); return set; }, new Set<string>()));
  const esc = (v: any) => {
    if (v == null) return "";
    const s = String(v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return [keys.join(","), ...rows.map((r) => keys.map((k) => esc(r[k])).join(","))].join("\n");
}

export function ExportCsvButton({
  rows,
  filename,
  disabled,
}: {
  rows: Record<string, any>[];
  filename: string;
  disabled?: boolean;
}) {
  const handle = () => {
    const csv = toCsv(rows);
    if (!csv) return;
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 0);
  };
  return (
    <Button variant="outline" size="sm" onClick={handle} disabled={disabled || !rows.length} className="gap-1.5">
      <Download size={12} /> Export CSV
    </Button>
  );
}
