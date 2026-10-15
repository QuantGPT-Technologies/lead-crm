"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { AlarmClock, PhoneCall } from "lucide-react";
import { toast } from "@/components/toast";
import { cn } from "@/lib/utils";
import { moveStage } from "../actions";

export interface KanbanCard {
  id: string;
  name: string;
  leadNo: string;
  priority: string;
  attempts: number;
  owner: string;
  course: string;
  overdue: boolean;
}
interface Column {
  id: string;
  name: string;
  color: string;
  total: number;
  cards: KanbanCard[];
}

const PRIORITY: Record<string, string> = {
  hot: "bg-red-500",
  warm: "bg-amber-500",
  cold: "bg-sky-500",
};

export function Kanban({
  columns: initial,
  perColumn,
}: {
  columns: Column[];
  perColumn: number;
}) {
  const [columns, setColumns] = useState(initial);
  const [dragging, setDragging] = useState<{
    card: string;
    from: string;
  } | null>(null);
  const [over, setOver] = useState<string | null>(null);
  const [pending, start] = useTransition();

  // fresh data from the server (after a move or a filter change) replaces the local copy
  const [seen, setSeen] = useState(initial);
  if (seen !== initial) {
    setSeen(initial);
    setColumns(initial);
  }

  function drop(to: string, moving = dragging) {
    setOver(null);
    if (pending || !moving || moving.from === to) return;
    const { card, from } = moving;
    setDragging(null);
    const moved = columns
      .find((c) => c.id === from)
      ?.cards.find((c) => c.id === card);
    if (!moved) return;

    // move the card immediately, then put it back if the server refuses
    const before = columns;
    setColumns((cols) =>
      cols.map((c) =>
        c.id === from
          ? {
              ...c,
              total: c.total - 1,
              cards: c.cards.filter((x) => x.id !== card),
            }
          : c.id === to
            ? { ...c, total: c.total + 1, cards: [moved, ...c.cards] }
            : c,
      ),
    );
    start(async () => {
      const res = await moveStage(card, to);
      if (res.error) {
        setColumns(before);
        toast(res.error, "error");
      }
    });
  }

  return (
    <div className="flex gap-3 overflow-x-auto pb-4">
      {columns.map((col) => (
        <section
          key={col.id}
          aria-label={col.name}
          onDragOver={(e) => {
            e.preventDefault();
            setOver(col.id);
          }}
          onDragLeave={() => setOver((o) => (o === col.id ? null : o))}
          onDrop={() => drop(col.id)}
          className={cn(
            "kanban-lane flex max-h-[calc(100vh-260px)] w-[300px] shrink-0 flex-col border",
            over === col.id
              ? "border-brand ring-2 ring-brand/30"
              : "border-transparent",
          )}
        >
          <header className="flex items-center justify-between px-4 py-4 text-xs font-semibold">
              <span className="flex min-w-0 flex-1 items-center gap-2 pr-2">
              <span
                  className="h-2 w-2 shrink-0 rounded-full"
                style={{ background: col.color }}
              />
                <span>{col.name}</span>
            </span>
              <span className="shrink-0 rounded-md bg-card px-2 text-[10px] leading-6 text-muted">
              {col.total}
            </span>
          </header>
          <div className="flex-1 space-y-2 overflow-y-auto p-2">
            {col.cards.map((card) => (
              <article
                key={card.id}
                draggable={!pending}
                onDragStart={() => setDragging({ card: card.id, from: col.id })}
                onDragEnd={() => setDragging(null)}
                className={cn(
                  "kanban-card cursor-grab active:cursor-grabbing",
                  dragging?.card === card.id && "opacity-40",
                )}
              >
                <div className="flex items-start gap-2">
                  <span
                    className={cn(
                      "mt-1.5 h-2 w-2 shrink-0 rounded-full",
                      PRIORITY[card.priority],
                    )}
                    title={`${card.priority} priority`}
                  />
                  <Link
                    href={`/leads/${card.id}`}
                    className="min-w-0 flex-1 truncate font-bold hover:text-brand"
                  >
                    {card.name}
                  </Link>
                </div>
                <p className="mt-0.5 truncate text-xs text-muted">
                  {card.course || card.leadNo}
                </p>
                <div className="mt-2 flex items-center gap-3 text-xs text-muted">
                  <span className="truncate">{card.owner}</span>
                  <span className="ml-auto flex items-center gap-1">
                    <PhoneCall size={12} /> {card.attempts}
                  </span>
                  {card.overdue && (
                    <AlarmClock
                      size={13}
                      className="text-red-500"
                      aria-label="Follow-up overdue"
                    />
                  )}
                </div>
                <label className="mt-4 flex items-center gap-2 border-t border-line pt-3 text-[10px] text-muted">
                  <span className="shrink-0">Move to</span>
                  <select
                    aria-label={`Move ${card.name} to stage`}
                    disabled={pending}
                    value={col.id}
                    onChange={(e) =>
                      drop(e.target.value, { card: card.id, from: col.id })
                    }
                    className="min-w-0 flex-1 rounded border border-line bg-card p-1 text-[10px] text-fg"
                  >
                    {columns.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name}
                      </option>
                    ))}
                  </select>
                </label>
              </article>
            ))}
            {col.cards.length === 0 && (
              <p className="py-6 text-center text-xs text-muted">
                Drop a lead here
              </p>
            )}
            {col.total > col.cards.length && col.cards.length >= perColumn && (
              <Link
                href={`/leads?stage=${col.id}`}
                className="block py-1 text-center text-xs font-bold text-brand"
              >
                View all {col.total} in list
              </Link>
            )}
          </div>
        </section>
      ))}
    </div>
  );
}
