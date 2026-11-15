import Papa from "papaparse";
import { isValidEmail, isValidMobile, normalizeMobile } from "@/lib/utils";

/** Pure helpers shared by the partner upload preview (browser) and the server-side check. */

export type PasteField = "student_name" | "mobile" | "email" | "city" | "state" | "course" | "remarks" | "ignore";

export const PASTE_FIELDS: { value: PasteField; label: string }[] = [
  { value: "student_name", label: "Contact name" },
  { value: "mobile", label: "Mobile" },
  { value: "email", label: "Email" },
  { value: "city", label: "City" },
  { value: "state", label: "State" },
  { value: "course", label: "Course" },
  { value: "remarks", label: "Remarks" },
  { value: "ignore", label: "Skip column" },
];

export interface PartnerLeadInput {
  student_name: string;
  mobile: string;
  email: string;
  city: string;
  state: string;
  course: string;
  remarks: string;
}

export const MAX_PARTNER_ROWS = 500;

const ALIASES: Record<Exclude<PasteField, "ignore">, string[]> = {
  student_name: ["name", "student name", "student", "full name", "contact name", "contact", "lead name", "candidate name", "candidate", "applicant"],
  mobile: ["mobile", "mobile number", "mobile no", "phone", "phone number", "phone no", "contact number", "contact no", "number", "whatsapp", "whatsapp number", "cell"],
  email: ["email", "email id", "e-mail", "email address", "mail", "mail id"],
  city: ["city", "town", "location", "district"],
  state: ["state", "province", "region"],
  course: ["course", "program", "programme", "course interested", "interested course", "interested in", "specialization", "degree"],
  remarks: ["remarks", "remark", "comment", "comments", "notes", "note", "message", "query"],
};

const STATES = [
  "andhra pradesh", "arunachal pradesh", "assam", "bihar", "chhattisgarh", "goa", "gujarat", "haryana", "himachal pradesh",
  "jharkhand", "karnataka", "kerala", "madhya pradesh", "maharashtra", "manipur", "meghalaya", "mizoram", "nagaland",
  "odisha", "orissa", "punjab", "rajasthan", "sikkim", "tamil nadu", "telangana", "tripura", "uttar pradesh", "uttarakhand",
  "west bengal", "andaman and nicobar islands", "chandigarh", "dadra and nagar haveli and daman and diu", "delhi",
  "new delhi", "jammu and kashmir", "ladakh", "lakshadweep", "puducherry", "pondicherry", "up", "mp", "hp", "j&k", "ncr",
];
const COURSE_WORDS = /\b(mba|bba|bca|mca|b\.?\s?tech|m\.?\s?tech|b\.?\s?com|m\.?\s?com|b\.?\s?sc|m\.?\s?sc|b\.?\s?a|m\.?\s?a|phd|diploma|pgdm|llb|b\.?ed|executive|online|distance|degree)\b/i;
const PHONE_IN_TEXT = /(\+?\d[\d\s-]{8,14}\d)/;
const EMAIL_IN_TEXT = /[^\s@,;<>()]+@[^\s@,;<>()]+\.[a-z]{2,}/i;

const norm = (s: string) => s.trim().toLowerCase().replace(/[_.:\-]+/g, " ").replace(/\s+/g, " ");
const headerField = (cell: string) =>
  (Object.entries(ALIASES).find(([, names]) => names.some((n) => norm(n) === norm(cell)))?.[0] as PasteField | undefined) ?? null;
const looksLikePhone = (v: string) => /^[+\d\s()-]{7,20}$/.test(v.trim()) && isValidMobile(normalizeMobile(v));

export interface ParsedPaste {
  columns: PasteField[];
  rows: string[][];
  hadHeader: boolean;
}

/** Splits pasted text (Excel/Sheets tab-separated, CSV, or one lead per line) and guesses each column. */
export function parsePaste(text: string, courseNames: string[] = []): ParsedPaste {
  const lines = text.replace(/\r\n?/g, "\n").split("\n").filter((l) => l.trim());
  if (!lines.length) return { columns: [], rows: [], hadHeader: false };

  let rows: string[][];
  if (lines.some((l) => l.includes("\t"))) rows = lines.map((l) => l.split("\t"));
  else if (lines.filter((l) => l.includes(",")).length >= Math.ceil(lines.length / 2)) {
    rows = Papa.parse<string[]>(lines.join("\n"), { skipEmptyLines: true }).data;
  } else if (lines.filter((l) => /[;|]/.test(l)).length >= Math.ceil(lines.length / 2)) {
    rows = lines.map((l) => l.split(/[;|]/));
  } else {
    // Free text such as "Rahul Sharma 98765 43210 rahul@x.com": pull out the phone and email, the rest is the name.
    rows = lines.map((l) => {
      const email = l.match(EMAIL_IN_TEXT)?.[0] ?? "";
      const phone = l.replace(email, " ").match(PHONE_IN_TEXT)?.[0] ?? "";
      const rest = l.replace(email, " ").replace(phone, " ").replace(/[\s,;|-]+/g, " ").trim();
      return [rest, phone, email];
    });
    if (rows.length && rows.every((r) => !r[2])) rows = rows.map((r) => r.slice(0, 2));
  }
  rows = rows.map((r) => r.map((c) => String(c ?? "").trim())).filter((r) => r.some(Boolean));
  if (!rows.length) return { columns: [], rows: [], hadHeader: false };
  const width = Math.max(...rows.map((r) => r.length));
  rows = rows.map((r) => [...r, ...Array(width - r.length).fill("")]);

  // A header row names at least two known columns and holds no phone number itself.
  const first = rows[0].map(headerField);
  const hadHeader = first.filter(Boolean).length >= 2 && !rows[0].some(looksLikePhone)
    || (first.filter(Boolean).length === 1 && rows.length > 1 && !rows[0].some(looksLikePhone) && rows.slice(1).some((r) => r.some(looksLikePhone)));
  if (hadHeader) {
    const used = new Set<PasteField>();
    const columns = first.map((f) => (f && !used.has(f) ? (used.add(f), f) : "ignore") as PasteField);
    return { columns: fillUnknown(columns, rows.slice(1), courseNames), rows: rows.slice(1), hadHeader };
  }
  return { columns: fillUnknown(Array(width).fill(null), rows, courseNames), rows, hadHeader };
}

/** Guesses columns without a header from their contents. */
function fillUnknown(columns: (PasteField | null)[], rows: string[][], courseNames: string[]): PasteField[] {
  const courses = new Set(courseNames.map(norm));
  const share = (c: number, test: (v: string) => boolean) => {
    const values = rows.map((r) => r[c]).filter(Boolean);
    return values.length ? values.filter(test).length / values.length : 0;
  };
  const tests: [PasteField, (v: string) => boolean][] = [
    ["mobile", looksLikePhone],
    ["email", (v) => isValidEmail(v)],
    ["state", (v) => STATES.includes(norm(v))],
    ["course", (v) => courses.has(norm(v)) || COURSE_WORDS.test(v)],
  ];
  const out = [...columns];
  for (const [field, test] of tests) {
    if (out.includes(field)) continue;
    let best = -1, bestShare = 0.5;
    out.forEach((f, c) => { if (!f) { const s = share(c, test); if (s > bestShare) { best = c; bestShare = s; } } });
    if (best >= 0) out[best] = field;
  }
  // Remaining text columns, left to right: name, city, remarks.
  for (const field of ["student_name", "city", "remarks"] as PasteField[]) {
    if (out.includes(field)) continue;
    const c = out.findIndex((f, i) => !f && share(i, (v) => /[a-z]/i.test(v)) > 0);
    if (c >= 0) out[c] = field;
  }
  return out.map((f) => f ?? "ignore");
}

export function toLeadInputs(parsed: ParsedPaste): PartnerLeadInput[] {
  return parsed.rows.map((r) => {
    const lead: PartnerLeadInput = { student_name: "", mobile: "", email: "", city: "", state: "", course: "", remarks: "" };
    parsed.columns.forEach((field, c) => {
      if (field !== "ignore" && r[c]) lead[field] = lead[field] ? `${lead[field]} ${r[c]}` : r[c];
    });
    return lead;
  });
}

/** Problems that stop a row from being submitted. The server repeats these checks. */
export function leadProblem(lead: PartnerLeadInput): string | null {
  if (lead.student_name.trim().length < 2) return "Name is missing";
  if (lead.student_name.length > 200) return "Name is too long";
  if (!isValidMobile(normalizeMobile(lead.mobile))) return lead.mobile ? "Mobile number is not valid" : "Mobile number is missing";
  if (lead.email && !isValidEmail(lead.email.trim())) return "Email is not valid";
  if ([lead.email, lead.city, lead.state, lead.course].some((v) => v.length > 200)) return "A value is too long";
  if (lead.remarks.length > 2000) return "Remarks are too long";
  return null;
}
