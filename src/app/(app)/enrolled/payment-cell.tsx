"use client";

import { useState, useTransition } from "react";
import { Check, Pencil } from "lucide-react";
import { notify } from "@/components/toast";
import { fmtMoney } from "@/lib/utils";
import { updateEnrollmentPayment } from "../leads/actions";

/** Paid amount with an inline edit, for recording instalments as they come in. */
export function PaymentCell({ id, paid, fee }: { id: string; paid: number; fee: number }) {
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(String(paid));
  const [pending, start] = useTransition();

  if (!editing) {
    return (
      <button type="button" onClick={() => setEditing(true)} className="inline-flex items-center gap-1.5 hover:text-brand" aria-label="Edit paid amount">
        {fmtMoney(paid)} <Pencil size={12} />
      </button>
    );
  }
  return (
    <form
      className="flex items-center gap-1"
      onSubmit={(e) => {
        e.preventDefault();
        start(async () => {
          if (notify(await updateEnrollmentPayment(id, Number(value)))) setEditing(false);
        });
      }}
    >
      <input type="number" min={0} max={fee} step="0.01" required autoFocus value={value} onChange={(e) => setValue(e.target.value)} aria-label="Paid amount" className="input !h-8 !w-28" />
      <button type="submit" disabled={pending} aria-label="Save paid amount" className="text-emerald-600">
        <Check size={16} />
      </button>
    </form>
  );
}
