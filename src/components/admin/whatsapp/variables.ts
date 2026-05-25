// Variable substitution helper for WhatsApp templates
export const TEMPLATE_VARIABLES = [
  { key: "name", sample: "Rahul" },
  { key: "plan", sample: "Pro" },
  { key: "expiry", sample: "30 Jun 2026" },
  { key: "link", sample: "nevorai.com" },
  { key: "days_left", sample: "3" },
] as const;

export function renderTemplate(body: string, vars?: Record<string, string>): string {
  const merged: Record<string, string> = Object.fromEntries(
    TEMPLATE_VARIABLES.map((v) => [v.key, v.sample]),
  );
  if (vars) Object.assign(merged, vars);
  return body.replace(/\{\{\s*(\w+)\s*\}\}/g, (_, k) => merged[k] ?? `{{${k}}}`);
}
