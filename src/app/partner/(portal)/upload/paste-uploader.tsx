"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { CheckCircle2, CircleAlert, FileUp, Trash2, X } from "lucide-react";
import { Button, Card } from "@/components/ui";
import { toast } from "@/components/toast";
import { cn, normalizeMobile } from "@/lib/utils";
import { leadProblem, MAX_PARTNER_ROWS, parsePaste, PASTE_FIELDS, toLeadInputs, type PasteField, type ParsedPaste } from "@/lib/partner-paste";
import { checkExistingMobiles, submitPartnerLeads, type PartnerSubmitResult } from "../actions";

const EXAMPLE = "Name\tMobile\tEmail\tCity\tState\tCourse\nRahul Sharma\t9876543210\trahul@example.com\tJaipur\tRajasthan\tMBA";

export function PasteUploader({ courseNames }: { courseNames: string[] }) {
  const [text, setText] = useState("");
  const [columns, setColumns] = useState<PasteField[] | null>(null);
  const [removed, setRemoved] = useState<Set<number>>(new Set());
  const [existing, setExisting] = useState<Set<string>>(new Set());
  const [result, setResult] = useState<PartnerSubmitResult | null>(null);
  const [pending, start] = useTransition();

  const detected = useMemo(() => parsePaste(text, courseNames), [text, courseNames]);
  const parsed: ParsedPaste = useMemo(
    () => ({ ...detected, columns: columns && columns.length === detected.columns.length ? columns : detected.columns }),
    [detected, columns],
  );
  const leads = useMemo(() => toLeadInputs(parsed), [parsed]);

  // Row status: problems first, then repeats inside the paste, then numbers already in the CRM.
  const status = useMemo(() => {
    const seen = new Set<string>();
    return leads.map((lead, i) => {
      if (removed.has(i)) return "Removed";
      const problem = leadProblem(lead);
      if (problem) return problem;
      const mobile = normalizeMobile(lead.mobile);
      if (seen.has(mobile)) return "Repeated in this list";
      seen.add(mobile);
      if (existing.has(mobile)) return "Already registered";
      return null;
    });
  }, [leads, removed, existing]);
  const ready = status.filter((s) => s === null).length;
  const problems = status.filter((s) => s && s !== "Removed").length;
  const tooMany = ready > MAX_PARTNER_ROWS;

  // Look up numbers that are already registered once the paste stops changing.
  const mobiles = useMemo(() => [...new Set(leads.map((l) => normalizeMobile(l.mobile)).filter((m) => m.length >= 7))].slice(0, MAX_PARTNER_ROWS), [leads]);
  useEffect(() => {
    if (!mobiles.length) return;
    const timer = setTimeout(async () => {
      const r = await checkExistingMobiles(mobiles);
      if (r.existing) setExisting(new Set(r.existing));
    }, 500);
    return () => clearTimeout(timer);
  }, [mobiles]);

  function reset(next = "") {
    setText(next);
    setColumns(null);
    setRemoved(new Set());
    setExisting(new Set());
  }

  function submit() {
    const rows = leads.filter((_, i) => status[i] === null);
    start(async () => {
      const r = await submitPartnerLeads(rows);
      if (r.error && !r.inserted) { toast(r.error, "error"); return; }
      setResult(r);
      if (r.inserted) { toast(`${r.inserted} lead${r.inserted === 1 ? "" : "s"} added`); reset(); }
    });
  }

  function readFile(file: File | undefined) {
    if (!file) return;
    if (file.size > 2_000_000) { toast("Choose a file under 2 MB", "error"); return; }
    file.text().then((content) => { setResult(null); reset(content); });
  }

  const hasRows = parsed.rows.length > 0;
  const setColumn = (c: number, field: PasteField) => {
    const next = [...parsed.columns];
    // Each field maps to one column; picking it again moves it.
    next.forEach((f, i) => { if (f === field && field !== "ignore" && i !== c) next[i] = "ignore"; });
    next[c] = field;
    setColumns(next);
  };

  return (
    <div className="space-y-5">
      {result && (
        <Card className="p-4">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="flex items-center gap-2 font-semibold text-brand"><CheckCircle2 size={18} /> {result.inserted ?? 0} lead{result.inserted === 1 ? "" : "s"} added.</p>
              {result.error && <p className="mt-1 text-sm text-red-600">{result.error}</p>}
              {!!result.skipped?.length && (
                <details className="mt-2 text-sm">
                  <summary className="cursor-pointer text-muted">{result.skipped.length} row(s) were not added</summary>
                  <ul className="mt-2 space-y-1">{result.skipped.slice(0, 100).map((s) => <li key={s.row}>Row {s.row}: {s.reason}</li>)}</ul>
                </details>
              )}
              <Link href="/partner" className="mt-2 inline-block text-sm font-semibold text-brand underline">View my leads</Link>
            </div>
            <button type="button" onClick={() => setResult(null)} aria-label="Dismiss" className="text-muted"><X size={16} /></button>
          </div>
        </Card>
      )}

      <Card className="p-4">
        <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
          <label htmlFor="partner-paste" className="text-sm font-semibold">Paste leads</label>
          <div className="flex items-center gap-2">
            <label className="ui-button inline-flex h-9 cursor-pointer items-center gap-1.5 rounded-[10px] border border-line px-3 text-xs font-semibold hover:bg-soft">
              <FileUp size={14} /> Open CSV file
              <input type="file" accept=".csv,.tsv,.txt,text/csv,text/plain" className="sr-only" onChange={(e) => { readFile(e.target.files?.[0]); e.target.value = ""; }} />
            </label>
            {text && <Button variant="ghost" className="h-9" onClick={() => reset()}><Trash2 size={14} /> Clear</Button>}
          </div>
        </div>
        <textarea id="partner-paste" value={text} onChange={(e) => { setResult(null); reset(e.target.value); }} rows={hasRows ? 5 : 10} spellCheck={false}
          className="input min-h-[120px] py-2 font-mono text-xs" placeholder={`Paste here (Ctrl+V). For example:\n\n${EXAMPLE}`} />
        <p className="mt-2 text-xs text-muted">Contact name and mobile number are required. Email, city, state, course and remarks are optional. Up to {MAX_PARTNER_ROWS} leads at a time.</p>
      </Card>

      {hasRows && (
        <Card>
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line px-4 py-3">
            <div className="text-sm">
              <span className="font-semibold">Preview</span>
              <span className="ml-3 text-brand">{ready} ready</span>
              {problems > 0 && <span className="ml-3 text-red-600">{problems} will be skipped</span>}
              {parsed.hadHeader && <span className="ml-3 text-muted">Header row detected</span>}
            </div>
            <Button onClick={submit} disabled={pending || ready === 0 || tooMany}>
              {pending ? "Adding…" : `Confirm and add ${ready} lead${ready === 1 ? "" : "s"}`}
            </Button>
          </div>
          {tooMany && <p className="px-4 pt-3 text-sm text-red-600">Add at most {MAX_PARTNER_ROWS} leads at a time. Split the list and paste the rest afterwards.</p>}
          <p className="px-4 pt-3 text-xs text-muted">Check the column names. If one is wrong, choose the right one from its menu.</p>
          <div className="max-h-[560px] overflow-auto p-4 pt-2">
            <table className="table-grid w-full border-collapse text-sm">
              <thead className="sticky top-0 z-[1] bg-card">
                <tr>
                  <th className="w-10">#</th>
                  {parsed.columns.map((field, c) => (
                    <th key={c} className="min-w-[130px]">
                      <select aria-label={`Column ${c + 1}`} value={field} onChange={(e) => setColumn(c, e.target.value as PasteField)}
                        className={cn("input h-8 !py-0 text-xs", field === "ignore" && "text-muted")}>
                        {PASTE_FIELDS.map((f) => <option key={f.value} value={f.value}>{f.label}</option>)}
                      </select>
                    </th>
                  ))}
                  <th className="min-w-[160px]">Status</th>
                  <th className="w-10" />
                </tr>
              </thead>
              <tbody>
                {parsed.rows.map((row, i) => {
                  const s = status[i];
                  return (
                    <tr key={i} className={cn(s === "Removed" && "opacity-40", s && s !== "Removed" && "bg-red-500/5")}>
                      <td className="text-muted">{i + 1}</td>
                      {row.map((cell, c) => <td key={c} className={cn("max-w-[240px] truncate", parsed.columns[c] === "ignore" && "text-muted line-through")} title={cell}>{cell}</td>)}
                      <td>{s === null
                        ? <span className="inline-flex items-center gap-1 text-brand"><CheckCircle2 size={13} /> Ready</span>
                        : <span className={cn("inline-flex items-center gap-1", s === "Removed" ? "text-muted" : "text-red-600")}><CircleAlert size={13} /> {s}</span>}</td>
                      <td>
                        <button type="button" className="text-muted hover:text-red-600" aria-label={removed.has(i) ? `Restore row ${i + 1}` : `Remove row ${i + 1}`}
                          onClick={() => setRemoved((prev) => { const next = new Set(prev); if (next.has(i)) next.delete(i); else next.add(i); return next; })}>
                          {removed.has(i) ? "↺" : <X size={14} />}
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </Card>
      )}
    </div>
  );
}
