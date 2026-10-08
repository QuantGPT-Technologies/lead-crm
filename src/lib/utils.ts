import { env } from "@/lib/env";

export const cn = (...parts: (string | false | null | undefined)[]) => parts.filter(Boolean).join(" ");

/** Keeps digits only and drops a leading country code / zero so 10-digit Indian numbers compare equal. */
export function normalizeMobile(raw: unknown): string {
  let d = String(raw ?? "").replace(/\D/g, "");
  if (d.length > 10 && d.startsWith("91")) d = d.slice(2);
  if (d.length === 11 && d.startsWith("0")) d = d.slice(1);
  return d;
}

export const isValidMobile = (m: string) => /^\d{7,15}$/.test(m);
export const isValidEmail = (e: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e);

export function maskMobile(m: string | null | undefined) {
  if (!m) return "";
  return m.length < 6 ? "*".repeat(m.length) : `**${m.slice(2, 4)}**${m.slice(6, 8)}**`;
}

export function maskEmail(e: string | null | undefined) {
  if (!e) return "";
  const [user, domain = ""] = e.split("@");
  // hide every other pair of characters: aasiya91@gmail.com -> **si**91@**ai**co**
  const mask = (s: string) => (s.match(/.{1,2}/g) ?? []).map((p, i) => (i % 2 ? p : "**")).join("");
  return `${mask(user)}@${mask(domain)}`;
}

const fmt = (opts: Intl.DateTimeFormatOptions) =>
  new Intl.DateTimeFormat("en-IN", { timeZone: env.timezone, ...opts });

export function fmtDate(v: string | Date | null | undefined) {
  if (!v) return "";
  return fmt({ day: "2-digit", month: "short", year: "numeric" }).format(new Date(v));
}

export function fmtDateTime(v: string | Date | null | undefined) {
  if (!v) return "";
  return fmt({ day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit", hour12: true }).format(
    new Date(v),
  );
}

export const fmtMoney = (n: number | string | null | undefined) =>
  new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 }).format(Number(n ?? 0));

function tzOffsetMs(d: Date) {
  const local = new Date(d.toLocaleString("en-US", { timeZone: env.timezone }));
  const utc = new Date(d.toLocaleString("en-US", { timeZone: "UTC" }));
  return local.getTime() - utc.getTime();
}

/** yyyy-mm-dd of `d` in the app timezone. */
export function tzDateString(d = new Date()) {
  return new Intl.DateTimeFormat("en-CA", { timeZone: env.timezone }).format(d);
}

/** UTC instant of 00:00 in the app timezone for a yyyy-mm-dd string. */
export function startOfDay(dateStr: string) {
  const guess = new Date(`${dateStr}T00:00:00Z`);
  return new Date(guess.getTime() - tzOffsetMs(guess));
}

export function addDays(d: Date, days: number) {
  return new Date(d.getTime() + days * 86_400_000);
}

export function todayBounds() {
  const start = startOfDay(tzDateString());
  return { start, end: addDays(start, 1) };
}

/** Parses ?from=yyyy-mm-dd&to=yyyy-mm-dd (inclusive) with a default window of `days`. */
export function dateRange(from: string | undefined, to: string | undefined, days = 30) {
  const ok = (s?: string) => !!s && /^\d{4}-\d{2}-\d{2}$/.test(s);
  const toStr = ok(to) ? to! : tzDateString();
  const fromStr = ok(from) ? from! : tzDateString(addDays(startOfDay(toStr), -(days - 1)));
  return { fromStr, toStr, from: startOfDay(fromStr), to: addDays(startOfDay(toStr), 1) };
}

/** Makes free text safe to embed in a PostgREST `or(...)` filter. */
export const cleanSearch = (q: string) => q.replace(/[,()%*\\"']/g, " ").trim().slice(0, 80);

export function renderTemplate(body: string, vars: Record<string, string | null | undefined>) {
  return body.replace(/\{\{\s*(\w+)\s*\}\}/g, (_, k: string) => vars[k] ?? "");
}

export function toCsv(rows: Record<string, unknown>[]) {
  if (!rows.length) return "";
  const cols = Object.keys(rows[0]);
  const cell = (v: unknown) => {
    let s = v == null ? "" : String(v);
    if (/^[=+\-@]/.test(s)) s = "'" + s; // stop spreadsheet formula injection
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return [cols.join(","), ...rows.map((r) => cols.map((c) => cell(r[c])).join(","))].join("\n");
}

export const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) || undefined;
export type SearchParams = Promise<Record<string, string | string[] | undefined>>;
