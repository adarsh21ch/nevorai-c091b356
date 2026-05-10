/**
 * Input sanitization utilities (XSS prevention).
 */
import DOMPurify from "dompurify";

export const sanitizeText = (input: unknown): string => {
  if (input == null) return "";
  const str = String(input);
  const clean = DOMPurify.sanitize(str, { ALLOWED_TAGS: [], ALLOWED_ATTR: [] });
  return clean
    .replace(/javascript:/gi, "")
    .replace(/data:text\/html/gi, "")
    .replace(/on\w+\s*=/gi, "")
    .trim();
};

export const sanitizeRichText = (input: unknown): string => {
  if (input == null) return "";
  return DOMPurify.sanitize(String(input), {
    ALLOWED_TAGS: ["b", "i", "em", "strong", "p", "br", "a", "ul", "ol", "li"],
    ALLOWED_ATTR: ["href", "target", "rel"],
    ALLOW_DATA_ATTR: false,
  });
};

export const sanitizeFilename = (name: string): string => {
  if (!name) return "file";
  let clean = name.replace(/[^a-zA-Z0-9._-]/g, "_");
  clean = clean.replace(/\.{2,}/g, ".");
  clean = clean.replace(/^\.+/, "");
  if (clean.length > 100) {
    const lastDot = clean.lastIndexOf(".");
    if (lastDot > 0 && lastDot > clean.length - 10) {
      const ext = clean.slice(lastDot);
      clean = clean.slice(0, 100 - ext.length) + ext;
    } else {
      clean = clean.slice(0, 100);
    }
  }
  return clean || "file";
};

export const hasDoubleExtension = (name: string): boolean => {
  const parts = name.toLowerCase().split(".");
  if (parts.length < 3) return false;
  const dangerous = ["exe", "sh", "bat", "cmd", "js", "html", "php", "scr", "com", "vbs"];
  return dangerous.includes(parts[parts.length - 1]);
};

export const isValidEmail = (e: string): boolean =>
  /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(e ?? "").trim());

export const isValidPhone = (p: string): boolean => {
  const cleaned = String(p ?? "").replace(/[\s\-()]/g, "");
  return /^\+?\d{10,15}$/.test(cleaned);
};

export const normalizePhone = (p: string): string =>
  String(p ?? "").replace(/[\s\-()]/g, "").trim();

export const sanitizeFields = <T extends Record<string, unknown>>(
  obj: T,
  fields: (keyof T)[],
): T => {
  const out = { ...obj };
  for (const f of fields) {
    if (out[f] != null) {
      // @ts-ignore
      out[f] = sanitizeText(out[f]);
    }
  }
  return out;
};
