"use client";

import { useEffect, useMemo, useRef, useState, type DragEvent } from "react";
import { usePathname } from "next/navigation";
import { Check, ChevronLeft, ChevronRight, Download, Eye, FileSpreadsheet, Filter, GripVertical, Loader2, Plus, Search, X } from "lucide-react";
import { Badge, Button, Card, Empty, Modal } from "@/components/ui";
import { MAX_PIVOT_FIELDS, PIVOT_FIELDS, pivotFieldLabel, type PivotCell, type PivotFilters, type PivotLeadRow, type PivotOption, type PivotValues } from "@/lib/pivot";
import { cn, fmtDate, toCsv } from "@/lib/utils";
import { loadPivot, pivotFieldValues, pivotLeadsExport } from "./actions";
import { SheetGrid } from "@/components/sheet-grid";
import { downloadXlsx, type XlsxCell, type XlsxSheet } from "@/lib/xlsx";

type Zone = "rows" | "cols" | "filters";
type Layout = { rows: string[]; cols: string[]; filters: PivotFilters };
type Data = { cells: PivotCell[]; values: PivotValues; filterValues: PivotValues };
type Drill = { title: string; dims: string[]; keys: string[]; loading: boolean; rows?: PivotLeadRow[]; truncated?: boolean; error?: string };
/** card = the selected tab (e.g. one employee); null = everything. */
type Preview = { tab: "summary" | "leads"; card: string | null; loading: boolean; leads?: PivotLeadRow[]; truncated?: boolean; error?: string };

const LEAD_HEADER = ["Lead no.", "Name", "Mobile", "City", "State", "Course", "Stage", "Sub stage", "Employee", "Attempts", "Created", "Remark"];
const LEAD_WIDTHS = [14, 24, 14, 16, 16, 22, 18, 18, 20, 9, 13, 40];
const SHEET_TOP = 5; // title, dates, filters, blank row, header
interface TreeNode { path: string[]; level: number; total: number; byCol: Map<string, number>; children: TreeNode[] }

const MAX_COLS = 40;
const MAX_CARD_ROWS = 300;
const SEP = "\u0001";
const DRAG_TYPE = "application/x-pivot-field";
const pathKey = (path: string[]) => path.join(SEP);
const layoutKey = (l: Layout) => JSON.stringify([l.rows, l.cols, Object.entries(l.filters).sort()]);

export function PivotBuilder({ initial, from, to }: { initial: Layout & Data; from: string; to: string }) {
  const pathname = usePathname();
  const [layout, setLayout] = useState<Layout>({ rows: initial.rows, cols: initial.cols, filters: initial.filters });
  // What the table shows. It keeps the last result on screen while a new one loads.
  const [view, setView] = useState<Layout & Data>(initial);
  const [loading, setLoading] = useState(false);
  const cache = useRef(new Map<string, Data>([[layoutKey(initial), initial]]));
  const request = useRef(0);
  const [over, setOver] = useState<Zone | null>(null);
  const [notice, setNotice] = useState("");
  const [drill, setDrill] = useState<Drill | null>(null);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [exporting, setExporting] = useState(false);
  const [picking, setPicking] = useState<string | null>(null);
  const [activeCard, setActiveCard] = useState<string | null>(null);
  const [tabQuery, setTabQuery] = useState("");
  const [fieldQuery, setFieldQuery] = useState("");
  const [labels, setLabels] = useState<PivotValues>(initial.filterValues);
  const used = [...layout.rows, ...layout.cols];
  const full = used.length >= MAX_PIVOT_FIELDS;
  const { rows, cols, cells, values } = view;

  async function apply(next: Layout) {
    if (next.rows.length + next.cols.length > MAX_PIVOT_FIELDS) {
      setNotice(`You can group by up to ${MAX_PIVOT_FIELDS} fields. Remove one (×) first.`);
      return;
    }
    setNotice("");
    setLayout(next);
    const params = new URLSearchParams({ from, to });
    if (next.rows.length) params.set("rows", next.rows.join(","));
    if (next.cols.length) params.set("cols", next.cols.join(","));
    if (Object.keys(next.filters).length) params.set("filters", JSON.stringify(next.filters));
    window.history.replaceState(null, "", `${pathname}?${params}`);

    const key = layoutKey(next);
    const id = ++request.current;
    const hit = cache.current.get(key);
    if (hit) { setView({ ...next, ...hit }); setLoading(false); return; }
    setLoading(true);
    const res = await loadPivot(from, to, next.rows, next.cols, next.filters);
    if (id !== request.current) return; // a newer change is already on its way
    setLoading(false);
    if (res.error || !res.cells) { setNotice(res.error ?? "Could not load the report"); return; }
    const data = { cells: res.cells, values: res.values ?? {}, filterValues: res.filterValues ?? {} };
    cache.current.set(key, data);
    setLabels((l) => ({ ...l, ...data.filterValues }));
    setView({ ...next, ...data });
  }

  /** Moves a field into Rows or Columns, optionally before another field already there. */
  function place(field: string, zone: Zone, before?: string) {
    if (zone === "filters") { setPicking(field); return; }
    const next = { ...layout, rows: layout.rows.filter((f) => f !== field), cols: layout.cols.filter((f) => f !== field) };
    const list = next[zone];
    const at = before ? list.indexOf(before) : -1;
    if (at >= 0) list.splice(at, 0, field); else list.push(field);
    apply(next);
  }
  const remove = (field: string) => apply({ ...layout, rows: layout.rows.filter((f) => f !== field), cols: layout.cols.filter((f) => f !== field) });
  function setFilter(field: string, keys: string[], names?: Record<string, string>) {
    const filters = { ...layout.filters };
    if (keys.length) filters[field] = keys; else delete filters[field];
    if (names) setLabels((l) => ({ ...l, [field]: { ...l[field], ...Object.fromEntries(Object.entries(names).map(([k, label]) => [k, { label, rank: 0 }])) } }));
    apply({ ...layout, filters });
  }

  const startDrag = (field: string) => (e: DragEvent) => {
    e.dataTransfer.effectAllowed = "move";
    e.dataTransfer.setData(DRAG_TYPE, field);
    e.dataTransfer.setData("text/plain", field);
  };
  const endDrag = () => setOver(null);
  function dragOver(zone: Zone, e: DragEvent) { e.preventDefault(); e.dataTransfer.dropEffect = "move"; if (over !== zone) setOver(zone); }
  function dragLeave(zone: Zone, e: DragEvent) { if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setOver((z) => (z === zone ? null : z)); }
  function drop(zone: Zone, e: DragEvent) {
    e.preventDefault();
    const field = e.dataTransfer.getData(DRAG_TYPE) || e.dataTransfer.getData("text/plain") || "";
    endDrag();
    if (!PIVOT_FIELDS.some((f) => f.key === field)) return;
    const before = (e.target as HTMLElement).closest<HTMLElement>("[data-field]")?.dataset.field;
    place(field, zone, before && before !== field ? before : undefined);
  }

  async function openDrill(title: string, dims: string[], keys: string[]) {
    setDrill({ title, dims, keys, loading: true });
    const res = await pivotLeadsExport(from, to, dims, keys, view.filters);
    setDrill({ title, dims, keys, loading: false, ...res });
  }

  const label = (dim: string, key: string) => values[dim]?.[key]?.label ?? labels[dim]?.[key]?.label ?? (key || "(blank)");
  const filterText = (field: string) => {
    const keys = layout.filters[field] ?? [];
    const names = keys.map((k) => labels[field]?.[k]?.label ?? values[field]?.[k]?.label ?? (k || "(blank)"));
    return names.length <= 2 ? names.join(", ") : `${names.length} selected`;
  };
  const describe = (dims: string[], keys: string[]) =>
    dims.length ? dims.map((d, i) => `${pivotFieldLabel(d)}: ${label(d, keys[i])}`).join(" · ") : "All leads";

  const model = useMemo(() => buildModel(rows, cols, cells, values), [rows, cols, cells, values]);
  const current = model.tree.find((t) => t.path[0] === activeCard)?.path[0] ?? model.tree[0]?.path[0];
  const filterSummary = () => Object.keys(view.filters).map((f) => `${pivotFieldLabel(f)}: ${filterText(f)}`).join("; ") || "None";

  /** The breakdown (every level), one column per field with parents repeated; one card or all. */
  function summarySheet(card: string | null = null): XlsxSheet {
    const tops = card === null ? model.tree : model.tree.filter((t) => t.path[0] === card);
    const grand = tops.reduce((sum, t) => sum + t.total, 0) || (card === null ? model.grand : 0);
    const header = [...rows.map(pivotFieldLabel), "Leads", "% of group"];
    const sheet: XlsxCell[][] = [[card === null ? "Pivot report" : `Pivot report: ${label(rows[0], card)}`], ["Created", `${from} to ${to}`], ["Filters", scopeSummary(card)], [], header];
    const bold = [0, SHEET_TOP - 1];
    const walk = (nodes: TreeNode[], parent: number) => nodes.forEach((n) => {
      const line: XlsxCell[] = rows.map((d, i) => (i <= n.level ? label(d, n.path[i]) : ""));
      line.push(n.total, parent ? Math.round((n.total / parent) * 1000) / 10 : 0);
      if (n.children.length) bold.push(sheet.length);
      sheet.push(line);
      walk(n.children, n.total);
    });
    if (rows.length) walk(tops, grand);
    bold.push(sheet.length);
    sheet.push([...(rows.length ? ["Total", ...rows.slice(1).map(() => "")] : ["All leads"]), grand, 100]);
    return { name: "Summary", rows: sheet, bold, widths: [...rows.map(() => 24), 10, 12] };
  }
  const scopeSummary = (card: string | null) =>
    [card === null ? "" : `${pivotFieldLabel(rows[0])}: ${label(rows[0], card)}`, Object.keys(view.filters).length ? filterSummary() : ""].filter(Boolean).join("; ") || "None";
  const scopeLeads = (card: string | null) => pivotLeadsExport(from, to, card === null ? [] : [rows[0]], card === null ? [] : [card], view.filters);

  function leadsSheet(title: string, leads: PivotLeadRow[], truncated?: boolean): XlsxSheet {
    const sheet: XlsxCell[][] = [[title], ["Created", `${from} to ${to}`], ["Filters", filterSummary()], [], LEAD_HEADER,
      ...leads.map((l) => [l.lead_no, l.student_name, l.mobile, l.city, l.state, l.course?.name ?? l.product, l.stage?.name, l.sub_stage?.name,
        l.owner?.full_name ?? "Unassigned", l.attempt_count, fmtDate(l.created_at), l.remarks])];
    if (truncated) sheet.push([], ["Only the first 10,000 leads are included. Narrow the filters to get the rest."]);
    return { name: "Leads", rows: sheet, bold: [0, SHEET_TOP - 1], widths: LEAD_WIDTHS };
  }
  const leadHref = (leads: PivotLeadRow[]) => (r: number) => (r >= SHEET_TOP && leads[r - SHEET_TOP] ? `/leads/${leads[r - SHEET_TOP].id}` : undefined);

  /** Opens the Excel-style preview for the selected tab (or everything), and loads its leads. */
  async function openPreview(card: string | null = model.tree.length > 1 ? current ?? null : null, tab: Preview["tab"] = "summary") {
    setPreview({ tab, card, loading: true });
    const res = await scopeLeads(card);
    setPreview((p) => (p && p.card === card ? { ...p, loading: false, leads: res.rows, truncated: res.truncated, error: res.error } : p));
  }

  /** Workbook with the Summary sheet and every matching lead, for the selected tab (or everything). */
  async function exportExcel(card: string | null = model.tree.length > 1 ? current ?? null : null) {
    setExporting(true);
    let leads = preview?.card === card ? preview?.leads : undefined, truncated = preview?.truncated;
    if (!leads) {
      const res = await scopeLeads(card);
      if (res.error) { setNotice(res.error); setExporting(false); return; }
      leads = res.rows ?? []; truncated = res.truncated;
    }
    const name = card === null ? "" : `-${label(rows[0], card).replace(/[^\w-]+/g, "-")}`;
    downloadXlsx(`pivot-report${name}-${from}-${to}`, [summarySheet(card), leadsSheet("Leads", leads, truncated)]);
    setExporting(false);
  }

  function exportCsv() {
    const records: Record<string, string | number>[] = [];
    const walk = (nodes: TreeNode[]) => nodes.forEach((n) => {
      const rec: Record<string, string | number> = {};
      rows.forEach((d, i) => { rec[pivotFieldLabel(d)] = i < n.path.length ? label(d, n.path[i]) : i === n.path.length ? "(subtotal)" : ""; });
      if (!rows.length) rec[""] = "All leads";
      model.colTuples.forEach((ct) => { rec[cols.length ? cols.map((d, i) => label(d, ct[i])).join(" / ") : "Leads"] = n.byCol.get(ct.join(SEP)) ?? 0; });
      if (cols.length) rec.Total = n.total;
      records.push(rec);
      walk(n.children);
    });
    walk(model.tree);
    const a = document.createElement("a");
    a.href = `data:text/csv;charset=utf-8,${encodeURIComponent(toCsv(records))}`;
    a.download = `pivot-report-${from}-${to}.csv`;
    a.click();
  }

  const filterFields = Object.keys(layout.filters);
  const leadsWord = (n: number) => `${n.toLocaleString("en-IN")} lead${n === 1 ? "" : "s"}`;
  // Parent totals for the share bars: each line shows its part of the group it sits in.
  const shownFields = PIVOT_FIELDS.filter((f) => !fieldQuery || f.label.toLowerCase().includes(fieldQuery.toLowerCase()));

  return (
    <div className="grid gap-4 lg:h-full lg:grid-cols-[300px_minmax(0,1fr)] lg:grid-rows-[minmax(0,1fr)]">
      <Card className="flex flex-col p-3 lg:min-h-0">
        <h2 className="text-base font-semibold">Fields</h2>
        <p className="mb-3 text-xs text-muted">Click a block (or drag it) to group by it. Use its funnel to filter.</p>
        <label className="mb-3 flex h-11 items-center gap-2 rounded-xl border border-line bg-card px-3 focus-within:border-brand">
          <Search size={15} className="text-muted" />
          <input value={fieldQuery} onChange={(e) => setFieldQuery(e.target.value)} placeholder="Search fields" aria-label="Search fields"
            className="h-full min-w-0 flex-1 bg-transparent text-sm outline-none" />
          {fieldQuery && <button type="button" aria-label="Clear search" onClick={() => setFieldQuery("")} className="text-muted hover:text-fg"><X size={14} /></button>}
        </label>
        <ul className="max-h-[50vh] space-y-2 overflow-y-auto pr-1 lg:max-h-none lg:min-h-0 lg:flex-1">
          {shownFields.length === 0 && <li className="px-1 py-4 text-sm text-muted">No field matches “{fieldQuery}”.</li>}
          {shownFields.map((f) => {
            const grouped = layout.rows.includes(f.key);
            const filtered = !!layout.filters[f.key];
            const canAdd = !grouped && !full;
            return (
              <li key={f.key} draggable={canAdd} onDragStart={startDrag(f.key)} onDragEnd={endDrag}
                className={cn("flex min-h-[52px] items-stretch overflow-hidden rounded-xl border transition-colors",
                  grouped ? "border-brand/50 bg-brand/10" : "border-line bg-card", canAdd && "cursor-grab hover:border-brand active:cursor-grabbing")}>
                <button type="button" disabled={!canAdd} onClick={() => place(f.key, "rows")}
                  title={grouped ? "Already in Group by" : full ? `Group by holds up to ${MAX_PIVOT_FIELDS} fields` : `Group by ${f.label}`}
                  className="flex min-w-0 flex-1 items-center gap-2.5 px-3 text-left disabled:cursor-default">
                  <span className={cn("flex h-7 w-7 shrink-0 items-center justify-center rounded-lg", grouped ? "bg-brand text-white dark:text-bg" : "bg-soft text-muted")}>
                    {grouped ? <Check size={14} /> : <Plus size={14} />}
                  </span>
                  <span className="min-w-0">
                    <span className="block truncate text-sm font-semibold">{f.label}</span>
                    {(grouped || filtered) && (
                      <span className="block truncate text-[11px] text-muted">
                        {[grouped && "In Group by", filtered && `Only: ${filterText(f.key)}`].filter(Boolean).join(" · ")}
                      </span>
                    )}
                  </span>
                </button>
                <button type="button" onClick={() => setPicking(f.key)} title={`Filter by ${f.label}`} aria-label={`Filter by ${f.label}`}
                  className={cn("flex w-11 shrink-0 items-center justify-center border-l border-line hover:bg-soft hover:text-brand", filtered ? "text-brand" : "text-muted")}>
                  <Filter size={15} fill={filtered ? "currentColor" : "none"} />
                </button>
              </li>
            );
          })}
        </ul>
      </Card>

      <div className="flex min-w-0 flex-col gap-3 lg:min-h-0">
        <div onDragEnter={(e) => dragOver("rows", e)} onDragOver={(e) => dragOver("rows", e)} onDragLeave={(e) => dragLeave("rows", e)} onDrop={(e) => drop("rows", e)}
          className={cn("shrink-0 rounded-xl border-2 border-dashed bg-card px-3 py-3 transition-colors", over === "rows" ? "border-brand bg-brand/10" : "border-line")}>
          <div className="flex flex-wrap items-center gap-2">
            <span className="mr-1 text-sm font-semibold">Group by</span>
            {layout.rows.length === 0 && <span className="text-sm text-muted">Pick fields on the left, for example Employee, then Stage.</span>}
            {layout.rows.map((field, i) => (
              <span key={field} className="inline-flex items-center gap-2">
                {i > 0 && <ChevronRight size={15} className="text-muted" />}
                <span data-field={field} draggable onDragStart={startDrag(field)} onDragEnd={endDrag} title="Drag to reorder"
                  className="inline-flex h-10 cursor-grab items-center gap-1.5 rounded-xl bg-brand pl-2.5 pr-1.5 text-sm font-semibold text-white active:cursor-grabbing dark:text-bg">
                  <GripVertical size={13} className="opacity-70" />{pivotFieldLabel(field)}
                  <button type="button" aria-label={`Remove ${pivotFieldLabel(field)}`} onClick={() => remove(field)} className="rounded-md p-1 hover:bg-white/20"><X size={13} /></button>
                </span>
              </span>
            ))}
          </div>
          {filterFields.length > 0 && (
            <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-line pt-3">
              <span className="mr-1 text-sm font-semibold">Only</span>
              {filterFields.map((field) => (
                <span key={field} className="inline-flex h-9 items-center gap-1 rounded-xl border border-brand/60 bg-brand/10 pl-3 pr-1.5 text-sm">
                  <button type="button" onClick={() => setPicking(field)} className="font-semibold hover:underline">
                    {pivotFieldLabel(field)}: <span className="font-normal">{filterText(field)}</span>
                  </button>
                  <button type="button" aria-label={`Remove ${pivotFieldLabel(field)} filter`} onClick={() => setFilter(field, [])} className="rounded-md p-1 hover:bg-soft"><X size={13} /></button>
                </span>
              ))}
              {filterFields.length > 1 && <button type="button" onClick={() => apply({ ...layout, filters: {} })} className="text-sm font-semibold text-muted underline">Clear all</button>}
            </div>
          )}
        </div>
        {notice && <p role="alert" className="text-sm font-semibold text-red-600">{notice}</p>}

        <Card className="flex flex-col lg:min-h-0 lg:flex-1">
          <div className="flex shrink-0 flex-wrap items-center justify-between gap-2 border-b border-line px-4 py-2.5">
            <p className="flex items-center gap-2 text-sm">
              {loading ? <Loader2 size={14} className="animate-spin text-brand" /> : null}
              <span className="text-base font-semibold">{leadsWord(model.grand)}</span>
              <span className="text-xs text-muted">
                created {from} to {to}{filterFields.length ? " · filtered" : ""}
              </span>
            </p>
            <div className="flex gap-1">
              {model.grand > 0 && <>
                <Button className="h-9 px-3" onClick={() => openPreview()} title={model.tree.length > 1 && current ? `Preview ${label(rows[0], current)}` : "Preview"}>
                  <Eye size={14} /> Preview{model.tree.length > 1 && current ? <span className="max-w-[140px] truncate font-normal opacity-80">· {label(rows[0], current)}</span> : null}
                </Button>
                <Button variant="outline" className="h-9 px-3" disabled={exporting} onClick={() => exportExcel()}>
                  {exporting ? <Loader2 size={14} className="animate-spin" /> : <FileSpreadsheet size={14} />} Excel
                </Button>
                <Button variant="ghost" className="h-9 px-3" onClick={exportCsv}><Download size={14} /> CSV</Button>
              </>}
            </div>
          </div>
          <div className={cn("flex min-h-0 flex-1 flex-col transition-opacity duration-150", loading && "pointer-events-none opacity-60")}>
            {model.grand === 0 ? <Empty>No leads match this period and these filters.</Empty>
              : rows.length === 0 ? (
                <div className="flex flex-wrap items-center gap-3 px-4 py-8 text-sm text-muted">
                  <span className="text-3xl font-semibold text-fg"><CountButton n={model.grand} onClick={() => openDrill("All leads", [], [])} /></span>
                  <span>leads{filterFields.length ? " match the filters" : " in this period"}. Pick a field on the left to break them down.</span>
                </div>
              ) : (
                <div className="flex min-h-0 flex-1 flex-col">
                  {model.tree.length > 1 && (() => {
                    const dim = rows[0];
                    const shown = model.tree.filter((t) => !tabQuery || label(dim, t.path[0]).toLowerCase().includes(tabQuery.toLowerCase()));
                    const at = Math.max(0, model.tree.findIndex((t) => t.path[0] === current));
                    const step = (d: number) => setActiveCard(model.tree[(at + d + model.tree.length) % model.tree.length].path[0]);
                    return (
                      <div className="flex shrink-0 items-center gap-2 border-b border-line px-3 py-2">
                        <button type="button" onClick={() => step(-1)} aria-label="Previous" className="rounded-lg border border-line p-1.5 text-muted hover:border-brand hover:text-brand"><ChevronLeft size={16} /></button>
                        {model.tree.length > 8 && (
                          <label className="flex h-9 w-44 shrink-0 items-center gap-1.5 rounded-lg border border-line px-2 focus-within:border-brand">
                            <Search size={13} className="text-muted" />
                            <input value={tabQuery} onChange={(e) => setTabQuery(e.target.value)} placeholder={`Find ${pivotFieldLabel(dim).toLowerCase()}`}
                              aria-label={`Find ${pivotFieldLabel(dim).toLowerCase()}`} className="min-w-0 flex-1 bg-transparent text-xs outline-none" />
                          </label>
                        )}
                        <div role="tablist" aria-label={pivotFieldLabel(dim)} className="flex min-w-0 flex-1 gap-1.5 overflow-x-auto pb-0.5">
                          {shown.map((t) => {
                            const k = t.path[0];
                            const on = k === current;
                            return (
                              <button key={k} type="button" role="tab" aria-selected={on} onClick={() => setActiveCard(k)}
                                className={cn("flex shrink-0 items-center gap-2 rounded-xl border px-3 py-1.5 text-left transition-colors",
                                  on ? "border-brand bg-brand text-white dark:text-bg" : "border-line bg-card hover:border-brand")}>
                                <span className="max-w-[180px] truncate text-sm font-semibold">{label(dim, k)}</span>
                                <span className={cn("rounded-md px-1.5 text-xs font-semibold tabular-nums", on ? "bg-white/20" : "bg-soft text-muted")}>{t.total.toLocaleString("en-IN")}</span>
                              </button>
                            );
                          })}
                          {shown.length === 0 && <span className="self-center text-xs text-muted">No match.</span>}
                        </div>
                        <span className="shrink-0 text-xs text-muted">{at + 1} / {model.tree.length}</span>
                        <button type="button" onClick={() => step(1)} aria-label="Next" className="rounded-lg border border-line p-1.5 text-muted hover:border-brand hover:text-brand"><ChevronRight size={16} /></button>
                      </div>
                    );
                  })()}
                <div className="max-h-[70vh] space-y-3 overflow-auto bg-soft/30 p-3 lg:max-h-none lg:min-h-0 lg:flex-1">
                  {model.tree.filter((t) => t.path[0] === current).map((top) => {
                    const card = top.path[0];
                    const dim = rows[0];
                    const node = top;
                    const total = node.total;
                    const color = values[dim]?.[card]?.color;
                    const table = node ? mergedRows(node) : [];
                    return (
                      <section key={card} className="overflow-hidden rounded-2xl border border-line bg-card shadow-sm">
                        <header className="flex flex-wrap items-center gap-3 px-4 py-3">
                          <div className="min-w-0">
                            <p className="text-[11px] font-semibold uppercase tracking-wide text-muted">{pivotFieldLabel(dim)}</p>
                            <h3 className="truncate text-lg font-semibold">{color ? <Badge color={color}>{label(dim, card)}</Badge> : label(dim, card)}</h3>
                          </div>
                          <div className="ml-auto text-right">
                            <p className="text-2xl font-semibold leading-none"><CountButton n={total} onClick={() => openDrill(describe([dim], [card]), [dim], [card])} /></p>
                            <p className="mt-1 text-xs text-muted">{model.grand ? `${((total / model.grand) * 100).toFixed(1)}% of all leads` : ""}</p>
                          </div>
                        </header>
                        {table.length > 0 && (
                          <div className="overflow-x-auto border-t border-line">
                            <table className="w-full border-collapse text-sm">
                              <thead className="bg-soft/70 text-[11px] font-semibold uppercase tracking-wide text-muted">
                                <tr>
                                  {rows.slice(1).map((d) => <th key={d} className="whitespace-nowrap border-r border-line/60 px-3 py-2 text-left">{pivotFieldLabel(d)}</th>)}
                                  <th className="w-20 px-3 py-2 text-right">Leads</th>
                                  <th className="w-16 px-3 py-2 text-right">%</th>
                                </tr>
                              </thead>
                              <tbody>
                                {table.slice(0, MAX_CARD_ROWS).map(({ leaf, starts }, ri) => {
                                  const cell = (n: TreeNode, merged: boolean, span = 1) => {
                                    const d = rows[n.level];
                                    const key = n.path[n.level];
                                    const c = values[d]?.[key]?.color;
                                    const parent = parentOf(node, n.path)?.total ?? total;
                                    const share = parent ? n.total / parent : 0;
                                    const dims = rows.slice(0, n.path.length);
                                    return (
                                      <td key={pathKey(n.path)} rowSpan={span}
                                        className={cn("border-r border-line/60 px-3 py-2", merged && "bg-card align-top")}>
                                        <span className="block max-w-[340px] truncate font-semibold" title={label(d, key)}>{c ? <Badge color={c}>{label(d, key)}</Badge> : label(d, key)}</span>
                                        {merged && (
                                          <span className="mt-0.5 block text-xs text-muted">
                                            <CountButton n={n.total} onClick={() => openDrill(describe(dims, n.path), dims, n.path)} /> leads · {(share * 100).toFixed(share < 0.1 ? 1 : 0)}%
                                          </span>
                                        )}
                                      </td>
                                    );
                                  };
                                  const parent = parentOf(node, leaf.path)?.total ?? total;
                                  const share = parent ? leaf.total / parent : 0;
                                  const dims = rows.slice(0, leaf.path.length);
                                  // A thicker line where a new top group starts.
                                  const groupStart = ri > 0 && starts.length > 0 && starts[0].n.level === 1;
                                  return (
                                    <tr key={pathKey(leaf.path)} className={cn("border-b border-line/50 hover:bg-soft/60", groupStart && "border-t-2 border-t-line")}>
                                      {starts.map(({ n, span }) => cell(n, true, span))}
                                      {cell(leaf, false)}
                                      <td className="px-3 py-2 text-right text-base tabular-nums">
                                        <CountButton n={leaf.total} onClick={() => openDrill(describe(dims, leaf.path), dims, leaf.path)} />
                                      </td>
                                      <td className="px-3 py-2 text-right text-xs tabular-nums text-muted">{(share * 100).toFixed(share < 0.1 ? 1 : 0)}%</td>
                                    </tr>
                                  );
                                })}
                              </tbody>
                            </table>
                            {table.length > MAX_CARD_ROWS && (
                              <p className="border-t border-line px-4 py-2 text-xs text-muted">
                                Showing the first {MAX_CARD_ROWS} rows of {table.length.toLocaleString("en-IN")}. Use Preview or Excel for all of them, or narrow it with a filter on the left.
                              </p>
                            )}
                          </div>
                        )}
                      </section>
                    );
                  })}
                </div>
                </div>
              )}
          </div>
        </Card>
      </div>

      {picking && (
        <FilterPicker field={picking} from={from} to={to} filters={layout.filters}
          onClose={() => setPicking(null)}
          onApply={(keys, names) => { setPicking(null); setFilter(picking, keys, names); }} />
      )}

      {preview && (() => {
        const scoped = preview.card !== null;
        const count = scoped ? model.tree.find((t) => t.path[0] === preview.card)?.total ?? 0 : model.grand;
        return (
          <Modal full title={scoped ? `Preview: ${label(rows[0], preview.card!)}` : "Preview: all"} onClose={() => setPreview(null)}>
            <div className="flex shrink-0 flex-wrap items-center justify-between gap-2 border-b border-line px-4 py-2">
              <div className="flex flex-wrap items-center gap-3">
                {model.tree.length > 1 && current && (
                  <div className="inline-flex rounded-lg border border-line p-0.5 text-sm" role="group" aria-label="Preview scope">
                    {([[current, label(rows[0], current)], [null, `All ${pivotFieldLabel(rows[0]).toLowerCase()}s`]] as [string | null, string][]).map(([c, name]) => (
                      <button key={String(c)} type="button" onClick={() => openPreview(c, preview.tab)}
                        className={cn("max-w-[220px] truncate rounded-md px-3 py-1 font-semibold", preview.card === c ? "bg-brand text-white dark:text-bg" : "text-muted hover:text-fg")}>
                        {name}
                      </button>
                    ))}
                  </div>
                )}
                <p className="text-sm text-muted"><b className="text-fg">{leadsWord(count)}</b> · created {from} to {to} · Filters: {scopeSummary(preview.card)}</p>
              </div>
              <Button className="h-9 px-3" disabled={exporting || preview.loading} onClick={() => exportExcel(preview.card)}>
                {exporting ? <Loader2 size={14} className="animate-spin" /> : <FileSpreadsheet size={14} />} Download Excel
              </Button>
            </div>
            {preview.tab === "summary" ? <SheetGrid sheet={summarySheet(preview.card)} />
              : preview.loading ? <p className="flex flex-1 items-center justify-center gap-2 text-sm text-muted"><Loader2 size={14} className="animate-spin" /> Loading leads…</p>
                : preview.error ? <p className="p-4 text-sm font-semibold text-red-600">{preview.error}</p>
                  : <SheetGrid sheet={leadsSheet("Leads", preview.leads ?? [], preview.truncated)} rowHref={leadHref(preview.leads ?? [])} />}
            <SheetTabs tabs={[["summary", "Summary"], ["leads", `Leads${preview.leads ? ` (${preview.leads.length.toLocaleString("en-IN")})` : ""}`]]}
              active={preview.tab} onPick={(tab) => setPreview((p) => (p ? { ...p, tab: tab as Preview["tab"] } : p))} />
          </Modal>
        );
      })()}

      {drill && (
        <Modal full title={drill.title} onClose={() => setDrill(null)}>
          <div className="flex shrink-0 flex-wrap items-center justify-between gap-2 border-b border-line px-4 py-2">
            <p className="text-sm text-muted">{drill.rows ? <><b className="text-fg">{leadsWord(drill.rows.length)}</b>{drill.truncated ? " (first 10,000)" : ""}. Click a lead number to open it.</> : "Loading…"}</p>
            <Button className="h-9 px-3" disabled={!drill.rows?.length}
              onClick={() => drill.rows && downloadXlsx(`pivot-leads-${from}-${to}`, leadsSheet(drill.title, drill.rows, drill.truncated))}>
              <FileSpreadsheet size={14} /> Download Excel
            </Button>
          </div>
          {drill.loading ? <p className="flex flex-1 items-center justify-center gap-2 text-sm text-muted"><Loader2 size={14} className="animate-spin" /> Loading leads…</p>
            : drill.error ? <p className="p-4 text-sm font-semibold text-red-600">{drill.error}</p>
              : <SheetGrid sheet={leadsSheet(drill.title, drill.rows ?? [], drill.truncated)} rowHref={leadHref(drill.rows ?? [])} />}
        </Modal>
      )}
    </div>
  );
}

/** Excel-style sheet tabs along the bottom of a preview. */
function SheetTabs({ tabs, active, onPick }: { tabs: [string, string][]; active: string; onPick: (tab: string) => void }) {
  return (
    <div className="flex shrink-0 items-end gap-0.5 border-t border-[#d4d4d4] bg-[#f3f3f3] px-2 pt-0.5" style={{ colorScheme: "light" }}>
      {tabs.map(([key, name]) => (
        <button key={key} type="button" onClick={() => onPick(key)}
          className={cn("rounded-b-md px-4 py-1.5 text-[13px]", active === key ? "border-b-2 border-[#1e7145] bg-white font-semibold text-[#1e7145] shadow-sm" : "text-[#444] hover:bg-[#e6e6e6]")}>
          {name}
        </button>
      ))}
    </div>
  );
}

/** Checkbox list of a field's values in the period, with how many leads each has. */
function FilterPicker({ field, from, to, filters, onClose, onApply }: {
  field: string; from: string; to: string; filters: PivotFilters;
  onClose: () => void; onApply: (keys: string[], names: Record<string, string>) => void;
}) {
  const [options, setOptions] = useState<PivotOption[] | null>(null);
  const [error, setError] = useState("");
  const [picked, setPicked] = useState<Set<string>>(new Set(filters[field] ?? []));
  const [q, setQ] = useState("");
  // Compare by content: callers may pass a fresh object on every render.
  const scope = JSON.stringify(filters);
  useEffect(() => {
    let live = true;
    pivotFieldValues(from, to, field, JSON.parse(scope)).then((res) => {
      if (!live) return;
      if (res.error) setError(res.error); else setOptions(res.options ?? []);
    });
    return () => { live = false; };
  }, [field, from, to, scope]);
  const shown = (options ?? []).filter((o) => !q || o.label.toLowerCase().includes(q.toLowerCase()));
  const flip = (key: string) => setPicked((s) => { const n = new Set(s); if (n.has(key)) n.delete(key); else n.add(key); return n; });
  return (
    <Modal title={`Filter by ${pivotFieldLabel(field)}`} onClose={onClose}>
      {error ? <p className="text-sm font-semibold text-red-600">{error}</p> : !options ? (
        <p className="flex items-center justify-center gap-2 py-8 text-sm text-muted"><Loader2 size={14} className="animate-spin" /> Loading values…</p>
      ) : (
        <div className="space-y-3">
          <label className="flex items-center gap-2 rounded-[10px] border border-line px-3">
            <Search size={14} className="text-muted" />
            <input autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder={`Search ${pivotFieldLabel(field).toLowerCase()}`} className="h-10 min-w-0 flex-1 bg-transparent text-sm outline-none" />
          </label>
          <div className="flex gap-3 text-xs font-semibold">
            <button type="button" className="text-brand underline" onClick={() => setPicked(new Set([...picked, ...shown.map((o) => o.key)]))}>Select {q ? "shown" : "all"}</button>
            <button type="button" className="text-muted underline" onClick={() => setPicked(new Set())}>Clear</button>
            <span className="ml-auto text-muted">{picked.size} selected</span>
          </div>
          <ul className="max-h-[50vh] divide-y divide-line overflow-auto rounded-lg border border-line">
            {shown.length === 0 && <li className="p-3 text-sm text-muted">No values match.</li>}
            {shown.map((o) => (
              <li key={o.key}>
                <label className="flex cursor-pointer items-center gap-2 px-3 py-2 text-sm hover:bg-soft">
                  <input type="checkbox" checked={picked.has(o.key)} onChange={() => flip(o.key)} />
                  <span className="flex-1">{o.color ? <Badge color={o.color}>{o.label}</Badge> : o.label}</span>
                  <span className="text-xs text-muted">{o.n.toLocaleString("en-IN")}</span>
                </label>
              </li>
            ))}
          </ul>
          <div className="flex gap-2">
            <Button onClick={() => onApply([...picked], Object.fromEntries((options ?? []).filter((o) => picked.has(o.key)).map((o) => [o.key, o.label])))}>
              {picked.size ? "Apply filter" : "Remove filter"}
            </Button>
            <Button variant="outline" onClick={onClose}>Cancel</Button>
          </div>
        </div>
      )}
    </Modal>
  );
}

function CountButton({ n, onClick }: { n: number; onClick: () => void }) {
  if (!n) return <span className="text-muted">–</span>;
  return <button type="button" onClick={onClick} className="font-semibold text-brand underline-offset-2 hover:underline">{n.toLocaleString("en-IN")}</button>;
}

/**
 * Table rows for a card: one row per deepest value. Each row also lists the groups that START
 * on it, with how many rows they span, so their names are shown once as merged cells.
 */
function mergedRows(root: TreeNode): { leaf: TreeNode; starts: { n: TreeNode; span: number }[] }[] {
  const walk = (n: TreeNode): { leaf: TreeNode; starts: { n: TreeNode; span: number }[] }[] => {
    if (!n.children.length) return [{ leaf: n, starts: [] }];
    const out = n.children.flatMap(walk);
    out[0].starts.unshift({ n, span: out.length });
    return out;
  };
  return root.children.flatMap(walk);
}

function parentOf(root: TreeNode, path: string[]): TreeNode | undefined {
  let node: TreeNode | undefined = root;
  for (let i = 1; i < path.length - 1 && node; i++) node = node.children.find((c) => c.path[i] === path[i]);
  return node;
}

/** Row fields become a tree (each level a subtotal); column fields become the cross-tab columns. */
function buildModel(rows: string[], cols: string[], cells: PivotCell[], values: PivotValues) {
  const R = rows.length;
  const rank = (dim: string, key: string) => values[dim]?.[key]?.rank ?? 0;
  const colKeys = new Map<string, string[]>();
  const colTotals = new Map<string, number>();
  let grand = 0;
  for (const c of cells) {
    const ct = c.keys.slice(R);
    const ck = ct.join(SEP);
    colKeys.set(ck, ct);
    colTotals.set(ck, (colTotals.get(ck) ?? 0) + c.n);
    grand += c.n;
  }
  const allCols = [...colKeys.values()].sort((a, b) => {
    for (let i = 0; i < cols.length; i++) { const d = rank(cols[i], a[i]) - rank(cols[i], b[i]); if (d) return d; }
    return 0;
  });

  const build = (subset: PivotCell[], level: number, path: string[]): TreeNode[] => {
    if (level >= R) return [];
    const groups = new Map<string, PivotCell[]>();
    for (const c of subset) {
      const k = c.keys[level] ?? "";
      const g = groups.get(k);
      if (g) g.push(c); else groups.set(k, [c]);
    }
    return [...groups.entries()]
      .sort(([a], [b]) => rank(rows[level], a) - rank(rows[level], b))
      .map(([key, group]) => {
        const byCol = new Map<string, number>();
        let total = 0;
        for (const c of group) {
          const ck = c.keys.slice(R).join(SEP);
          byCol.set(ck, (byCol.get(ck) ?? 0) + c.n);
          total += c.n;
        }
        const p = [...path, key];
        return { path: p, level, total, byCol, children: build(group, level + 1, p) };
      });
  };
  const tree: TreeNode[] = R
    ? build(cells, 0, [])
    : [{ path: [], level: 0, total: grand, byCol: new Map(colTotals), children: [] }];

  return {
    tree,
    colTuples: allCols.slice(0, MAX_COLS),
    colsCut: allCols.length > MAX_COLS,
    colTotal: (ct: string[]) => colTotals.get(ct.join(SEP)) ?? 0,
    grand,
  };
}
