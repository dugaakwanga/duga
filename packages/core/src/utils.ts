// Uses the Web Crypto API (globalThis.crypto) so this module stays
// client-safe while still producing cryptographically random strings.
function randomHex(bytes: number): string {
  const arr = new Uint8Array(bytes);
  globalThis.crypto.getRandomValues(arr);
  return Array.from(arr, (b) => b.toString(16).padStart(2, "0")).join("");
}

export function cuid(): string {
  const base = Date.now().toString(36);
  const rand = randomHex(8);
  return `${base}${rand}`;
}

export function generateReference(prefix: string): string {
  return `${prefix}_${Date.now()}_${randomHex(4).toUpperCase()}`;
}

export function generateInvoiceNumber(schoolTag: string, seq: number): string {
  return `INV-${schoolTag}-${String(seq).padStart(6, "0")}`;
}

export function generateReceiptNumber(seq: number): string {
  return `RCPT-${String(seq).padStart(6, "0")}`;
}

export function todayISO(): string {
  return new Date().toISOString().slice(0, 10);
}

export function nextDayOfWeek(day: number, hour: number, minute: number): Date {
  const now = new Date();
  const target = new Date(now);
  const diff = (day - now.getDay() + 7) % 7;
  target.setDate(now.getDate() + (diff === 0 ? 7 : diff));
  target.setHours(hour, minute, 0, 0);
  return target;
}

export function slugify(input: string): string {
  return input
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\s-]/g, "")
    .replace(/[\s_]+/g, "-")
    .replace(/-+/g, "-");
}

export function formatNaira(amount: number | string): string {
  const n = typeof amount === "string" ? parseFloat(amount) : amount;
  return new Intl.NumberFormat("en-NG", {
    style: "currency",
    currency: "NGN",
    minimumFractionDigits: 0,
  }).format(n);
}

export function truncate(str: string, len = 120): string {
  return str.length > len ? str.slice(0, len) + "…" : str;
}
