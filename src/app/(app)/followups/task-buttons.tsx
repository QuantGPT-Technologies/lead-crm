"use client";

import { useTransition } from "react";
import { Button } from "@/components/ui";
import { notify } from "@/components/toast";
import { completeTask } from "../leads/actions";

export function TaskButtons({ id }: { id: string }) {
  const [pending, start] = useTransition();
  return (
    <span className="flex gap-1">
      <Button variant="success" className="h-8" disabled={pending} onClick={() => start(async () => void notify(await completeTask(id)))}>
        Done
      </Button>
      <Button variant="ghost" className="h-8" disabled={pending} onClick={() => start(async () => void notify(await completeTask(id, "cancelled")))}>
        Cancel
      </Button>
    </span>
  );
}
