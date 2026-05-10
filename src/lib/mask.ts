const safe = (v: unknown): string => (v == null ? "" : String(v));

export const maskTail = (value: unknown, visible = 4): string => {
  const s = safe(value);
  if (s.length <= visible) return s;
  return "X".repeat(s.length - visible) + s.slice(-visible);
};

export const maskPan = (pan: unknown): string => {
  const s = safe(pan).toUpperCase();
  if (s.length !== 10) return maskTail(s, 4);
  return "XXXXX" + s.slice(5, 9) + "X";
};

export const maskAadhaar = (a: unknown): string => {
  const s = safe(a).replace(/\s+/g, "");
  if (s.length !== 12) return maskTail(s, 4);
  return `XXXX XXXX ${s.slice(-4)}`;
};

export const maskBankAccount = (acc: unknown): string => maskTail(acc, 4);

export const maskIfsc = (ifsc: unknown): string => {
  const s = safe(ifsc).toUpperCase();
  if (s.length < 6) return s;
  return s.slice(0, 4) + "X".repeat(Math.max(0, s.length - 4));
};

export const maskPhone = (phone: unknown): string => {
  const s = safe(phone).replace(/\s+/g, "");
  if (s.length < 6) return s;
  return s.slice(0, 3) + "X".repeat(s.length - 6) + s.slice(-3);
};

export const maskEmail = (email: unknown): string => {
  const s = safe(email);
  const [local, domain] = s.split("@");
  if (!domain) return s;
  if (local.length <= 2) return `${local[0] || ""}***@${domain}`;
  return `${local.slice(0, 2)}***@${domain}`;
};
