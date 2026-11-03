"use client";
import { useState } from "react";
export function ReportTable({ rows, columns }: { rows: Record<string, string | number>[]; columns: string[] }) {
  const [sort, setSort] = useState<{ key: string; asc: boolean } | null>(null);
  const ordered = sort ? [...rows].sort((a, b) => {
    const x = a[sort.key], y = b[sort.key];
    return (typeof x === "number" && typeof y === "number" ? x - y : String(x ?? "").localeCompare(String(y ?? ""), undefined, { numeric: true })) * (sort.asc ? 1 : -1);
  }) : rows;
  return <div className="overflow-x-auto"><table className="table-grid w-full border-collapse"><thead><tr>{columns.map(key => <th key={key} aria-sort={sort?.key === key ? sort.asc ? "ascending" : "descending" : "none"}><button type="button" onClick={() => setSort({ key, asc: sort?.key === key ? !sort.asc : true })}>{key} {sort?.key === key ? sort.asc ? "↑" : "↓" : "↕"}</button></th>)}</tr></thead><tbody>{ordered.map((row, index) => <tr key={index}>{columns.map(key => <td key={key}>{row[key] ?? 0}</td>)}</tr>)}</tbody></table>{!rows.length && <p className="p-6 text-muted">No records match these filters.</p>}</div>;
}
