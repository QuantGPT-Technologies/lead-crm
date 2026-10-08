"use client";

import { useState, useTransition } from "react";
import Papa from "papaparse";
import { Download, FileUp } from "lucide-react";
import { Button, Card, Field, Select } from "@/components/ui";
import { toast } from "@/components/toast";
import type { Named } from "@/lib/types";
import { uploadLeads, type UploadResult } from "../ops-actions";

const SAMPLE = "Name,Mobile,Email,City,State,University,Course,Source,Product,Remarks\nRahul Sharma,9876543210,rahul@example.com,Delhi,Delhi,Sample University,MBA,Website,Online MBA,Asked for a call after 6pm\n";
const MAX_ROWS = 5000;

export function Uploader({ sources }: { sources: Named[] }) {
  const [file, setFile] = useState<File | null>(null);
  const [rows, setRows] = useState<Record<string, string>[]>([]);
  const [source, setSource] = useState("");
  const [result, setResult] = useState<UploadResult | null>(null);
  const [pending, start] = useTransition();

  function pick(f: File | null) {
    setResult(null);
    setRows([]);
    setFile(f);
    if (!f) return;
    if (!/\.csv$/i.test(f.name)) return toast("Please choose a .csv file (in Excel: File → Save As → CSV)", "error");
    Papa.parse<Record<string, string>>(f, {
      header: true,
      skipEmptyLines: "greedy",
      complete: (res) => {
        if (res.data.length > MAX_ROWS) return toast(`This file has ${res.data.length} rows. Split it into files of at most ${MAX_ROWS}.`, "error");
        setRows(res.data);
      },
      error: (e) => toast(`Could not read the file: ${e.message}`, "error"),
    });
  }

  const headers = rows[0] ? Object.keys(rows[0]) : [];

  return (
    <Card className="space-y-4 p-4">
      <div className="flex flex-wrap items-end gap-3">
        <Field label="CSV file" required>
          <input type="file" accept=".csv,text/csv" onChange={(e) => pick(e.target.files?.[0] ?? null)} className="input !h-auto py-1.5" />
        </Field>
        <Field label="Source for rows without one">
          <Select value={source} onChange={(e) => setSource(e.target.value)} options={sources.map((s) => ({ value: s.id, label: s.name }))} placeholder="None" className="!w-52" />
        </Field>
        <Button
          disabled={pending || rows.length === 0}
          onClick={() =>
            start(async () => {
              const res = await uploadLeads(file?.name ?? "upload.csv", rows, source);
              if (res.error) return toast(res.error, "error");
              setResult(res);
              setRows([]);
              toast(`${res.inserted} lead(s) added`);
            })
          }
        >
          <FileUp size={15} /> {pending ? "Uploading..." : rows.length ? `Upload ${rows.length} rows` : "Upload"}
        </Button>
        <a href={`data:text/csv;charset=utf-8,${encodeURIComponent(SAMPLE)}`} download="lead-upload-sample.csv" className="inline-flex h-9 items-center gap-1.5 font-bold text-brand">
          <Download size={15} /> Sample file
        </a>
      </div>
      <p className="text-xs text-muted">
        Required columns: <b>Name</b> and <b>Mobile</b>. Optional: Email, Alt Mobile, City, State, University, Course, Source, Product, Campaign, Medium, Qualification, Remarks.
        Leads are added to the unassigned pool; mobiles that already exist are skipped, never overwritten.
      </p>

      {rows.length > 0 && (
        <div className="overflow-x-auto rounded-md border border-line">
          <table className="table-grid w-full border-collapse text-xs">
            <thead>
              <tr>{headers.map((h) => <th key={h}>{h}</th>)}</tr>
            </thead>
            <tbody>
              {rows.slice(0, 5).map((r, i) => (
                <tr key={i}>{headers.map((h) => <td key={h}>{r[h]}</td>)}</tr>
              ))}
            </tbody>
          </table>
          <p className="p-2 text-xs text-muted">Preview of the first {Math.min(5, rows.length)} of {rows.length} rows.</p>
        </div>
      )}

      {result && (
        <div className="rounded-md bg-soft p-4" role="status">
          <p className="font-bold">
            {result.inserted} added · {result.duplicates} duplicate · {result.invalid} invalid · {result.total} rows in file
          </p>
          {!!result.problems?.length && (
            <ul className="mt-2 max-h-40 list-disc overflow-y-auto pl-5 text-xs text-red-600">
              {result.problems.map((p) => <li key={p}>{p}</li>)}
            </ul>
          )}
        </div>
      )}
    </Card>
  );
}
