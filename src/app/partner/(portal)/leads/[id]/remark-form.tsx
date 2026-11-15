"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui";
import { notify } from "@/components/toast";
import { addPartnerRemark } from "../../actions";

export function RemarkForm({ leadId }: { leadId: string }) {
  const [text, setText] = useState("");
  const [pending, start] = useTransition();
  const router = useRouter();
  return (
    <form className="space-y-2" onSubmit={(e) => {
      e.preventDefault();
      start(async () => {
        if (notify(await addPartnerRemark(leadId, text))) { setText(""); router.refresh(); }
      });
    }}>
      <label htmlFor="partner-remark" className="text-sm font-semibold">Add a remark</label>
      <textarea id="partner-remark" value={text} onChange={(e) => setText(e.target.value)} maxLength={2000} rows={3}
        className="input min-h-[84px] py-2" placeholder="Share anything the counsellor should know about this lead" />
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs text-muted">Remarks cannot be edited or removed once added.</p>
        <Button type="submit" disabled={pending || !text.trim()}>{pending ? "Adding…" : "Add remark"}</Button>
      </div>
    </form>
  );
}
