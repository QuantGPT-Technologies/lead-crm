"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button, Modal } from "@/components/ui";
import { notify } from "@/components/toast";
import { quickUpdateLead } from "./actions";

export interface QuickStage { id: string; name: string; color: string }
export interface QuickSubStage { id: string; name: string; stage_id: string }
export interface QuickLead { id: string; name: string; stageId: string | null; subStageId: string | null; otherText: string; remark: string }

/** Change a lead's stage, sub stage and remark without opening it. */
export function QuickUpdate({ lead, stages, subStages, onClose }: {
  lead: QuickLead; stages: QuickStage[]; subStages: QuickSubStage[]; onClose: () => void;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [stageId, setStageId] = useState(lead.stageId ?? "");
  const [subStageId, setSubStageId] = useState(lead.subStageId ?? "");
  const [otherText, setOtherText] = useState(lead.otherText);
  const [remark, setRemark] = useState(lead.remark);
  const subs = subStages.filter((s) => s.stage_id === stageId);
  const isOther = stages.find((s) => s.id === stageId)?.name.toLowerCase() === "other";

  return (
    <Modal title={`Update ${lead.name}`} onClose={onClose}>
      <form className="space-y-4" onSubmit={(e) => {
        e.preventDefault();
        start(async () => {
          const res = await quickUpdateLead(lead.id, { stageId, subStageId: subStageId || null, otherText, remark });
          if (notify(res)) { onClose(); router.refresh(); }
        });
      }}>
        <label className="block">
          <span className="mb-1.5 block text-sm font-semibold">Stage</span>
          <select className="input" value={stageId} required autoFocus onChange={(e) => { setStageId(e.target.value); setSubStageId(""); }}>
            <option value="" disabled>Choose a stage</option>
            {stages.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
        </label>
        {subs.length > 0 && (
          <label className="block">
            <span className="mb-1.5 block text-sm font-semibold">Sub stage</span>
            <select className="input" value={subStageId} required onChange={(e) => setSubStageId(e.target.value)}>
              <option value="" disabled>Choose a sub stage</option>
              {subs.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          </label>
        )}
        {isOther && (
          <label className="block">
            <span className="mb-1.5 block text-sm font-semibold">Describe the stage</span>
            <input className="input" value={otherText} required maxLength={200} onChange={(e) => setOtherText(e.target.value)} />
          </label>
        )}
        <label className="block">
          <span className="mb-1.5 block text-sm font-semibold">Remark</span>
          <textarea className="input min-h-[90px] py-2" value={remark} maxLength={2000} rows={3} onChange={(e) => setRemark(e.target.value)}
            placeholder="What happened on this lead?" />
        </label>
        <div className="flex gap-2">
          <Button type="submit" disabled={pending || !stageId}>{pending ? "Saving…" : "Save"}</Button>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
        </div>
      </form>
    </Modal>
  );
}
