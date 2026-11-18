"use client";

import { useState } from "react";
import Link from "next/link";
import { colName, type XlsxSheet } from "@/lib/xlsx";
import { cn } from "@/lib/utils";

const MAX_ROWS = 2000;

/**
 * Spreadsheet-style preview of an XlsxSheet: column letters, row numbers, gridlines and a
 * formula bar showing the clicked cell. It always uses light "Excel" colours, in either theme.
 */
export function SheetGrid({ sheet, rowHref }: { sheet: XlsxSheet; rowHref?: (row: number) => string | undefined }) {
  const [sel, setSel] = useState<{ r: number; c: number } | null>(null);
  const width = Math.max(1, ...sheet.rows.map((r) => r.length));
  const rows = sheet.rows.slice(0, MAX_ROWS);
  const bold = new Set(sheet.bold ?? []);
  const selected = sel ? sheet.rows[sel.r]?.[sel.c] : undefined;

  return (
    <div className="flex min-h-0 flex-1 flex-col bg-white text-[13px] text-[#1f1f1f]" style={{ fontFamily: "Calibri, 'Segoe UI', Arial, sans-serif", colorScheme: "light" }}>
      <div className="flex h-8 shrink-0 items-center border-b border-[#d4d4d4] bg-[#f8f8f8]">
        <span className="flex h-full w-24 items-center border-r border-[#d4d4d4] px-2 text-xs text-[#555]">{sel ? `${colName(sel.c)}${sel.r + 1}` : ""}</span>
        <span className="px-2 text-xs italic text-[#777]">fx</span>
        <span className="min-w-0 flex-1 truncate px-1">{selected ?? ""}</span>
      </div>
      <div className="min-h-0 flex-1 overflow-auto">
        <table className="border-separate border-spacing-0">
          <thead>
            <tr>
              <th className="sticky left-0 top-0 z-[3] h-6 w-12 min-w-12 border-b border-r border-[#c8c8c8] bg-[#efefef]" />
              {Array.from({ length: width }, (_, c) => (
                <th key={c} style={{ minWidth: `${(sheet.widths?.[c] ?? 12) * 7.5}px` }}
                  className={cn("sticky top-0 z-[2] h-6 border-b border-r border-[#c8c8c8] bg-[#efefef] px-1 text-center text-xs font-normal text-[#555]",
                    sel?.c === c && "bg-[#d3e3d5] text-[#1e5c32]")}>
                  {colName(c)}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row, r) => {
              const href = rowHref?.(r);
              return (
                <tr key={r}>
                  <td className={cn("sticky left-0 z-[1] h-6 border-b border-r border-[#c8c8c8] bg-[#efefef] px-1 text-center text-xs text-[#555]", sel?.r === r && "bg-[#d3e3d5] text-[#1e5c32]")}>{r + 1}</td>
                  {Array.from({ length: width }, (_, c) => {
                    const v = row[c];
                    const isNum = typeof v === "number";
                    const isSel = sel?.r === r && sel?.c === c;
                    const text = v === null || v === undefined ? "" : isNum ? v.toLocaleString("en-IN") : String(v);
                    return (
                      <td key={c} onClick={() => setSel({ r, c })}
                        style={{ maxWidth: `${(sheet.widths?.[c] ?? 12) * 7.5 * 2}px` }}
                        className={cn("h-6 cursor-cell truncate whitespace-nowrap border-b border-r border-[#e1e1e1] px-1.5",
                          isNum && "text-right tabular-nums", bold.has(r) && "font-bold",
                          isSel && "outline outline-2 -outline-offset-2 outline-[#1e7145]")}
                        title={text.length > 30 ? text : undefined}>
                        {c === 0 && href && text ? <Link href={href} className="text-[#0b62c4] underline" onClick={(e) => e.stopPropagation()}>{text}</Link> : text}
                      </td>
                    );
                  })}
                </tr>
              );
            })}
          </tbody>
        </table>
        {sheet.rows.length > MAX_ROWS && (
          <p className="p-3 text-xs text-[#555]">Showing the first {MAX_ROWS.toLocaleString("en-IN")} of {sheet.rows.length.toLocaleString("en-IN")} rows. Download the Excel file for all of them.</p>
        )}
      </div>
    </div>
  );
}
