"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui";
import { notify } from "@/components/toast";
import type { PartnerStatusOption } from "@/lib/partner-data";
import { updatePartnerLeadStatus } from "../../actions";

export function StatusForm({ leadId, options, stageId, subStageId, otherText }: {
  leadId: string; options: PartnerStatusOption[]; stageId: string | null; subStageId: string | null; otherText: string;
}) {
  const [stage, setStage] = useState(stageId ?? "");
  const [sub, setSub] = useState(subStageId ?? "");
  const [other, setOther] = useState(otherText);
  const [pending, start] = useTransition();
  const router = useRouter();
  const current = options.find((o) => o.id === stage);
  const isOther = current?.name.toLowerCase() === "other";
  const funnels = [...new Set(options.map((o) => o.funnel))];
  const changed = stage !== (stageId ?? "") || sub !== (subStageId ?? "") || (isOther && other.trim() !== otherText);

  return (
    <form className="space-y-3" onSubmit={(e) => {
      e.preventDefault();
      start(async () => {
        if (notify(await updatePartnerLeadStatus(leadId, stage, sub || null, other))) router.refresh();
      });
    }}>
      <h2 className="text-lg font-semibold">Status</h2>
      <label className="block">
        <span className="mb-1 block text-sm font-semibold">Status</span>
        <select className="input" value={stage} required onChange={(e) => { setStage(e.target.value); setSub(""); }}>
          <option value="" disabled>Choose a status</option>
          {funnels.map((f) => (
            <optgroup key={f} label={f}>
              {options.filter((o) => o.funnel === f).map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
            </optgroup>
          ))}
        </select>
      </label>
      {current && current.subs.length > 0 && (
        <label className="block">
          <span className="mb-1 block text-sm font-semibold">Sub-status</span>
          <select className="input" value={sub} required onChange={(e) => setSub(e.target.value)}>
            <option value="" disabled>Choose a sub-status</option>
            {current.subs.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
        </label>
      )}
      {isOther && (
        <label className="block">
          <span className="mb-1 block text-sm font-semibold">Describe the status</span>
          <input className="input" value={other} maxLength={200} required onChange={(e) => setOther(e.target.value)} />
        </label>
      )}
      <Button type="submit" disabled={pending || !stage || !changed}>{pending ? "Saving…" : "Update status"}</Button>
      <p className="text-xs text-muted">Status changes appear in the updates for you and our team.</p>
    </form>
  );
}
