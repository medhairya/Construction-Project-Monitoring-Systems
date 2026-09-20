"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui";
import {
  resetClockAction,
  resetSeedAction,
  runSweepAction,
  shiftClockAction,
} from "@/lib/actions";

export function AdminControls() {
  const [pending, start] = useTransition();
  const [message, setMessage] = useState<string | null>(null);

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2">
        <Button disabled={pending} onClick={() => start(() => void shiftClockAction(1))}>
          +1 day
        </Button>
        <Button disabled={pending} onClick={() => start(() => void shiftClockAction(7))}>
          +7 days
        </Button>
        <Button
          variant="secondary"
          disabled={pending}
          onClick={() => start(() => void resetClockAction())}
        >
          Reset clock
        </Button>
        <Button
          variant="secondary"
          disabled={pending}
          onClick={() =>
            start(async () => {
              const r = await runSweepAction();
              setMessage(r.breached + " stage(s) are past their SLA and escalated.");
            })
          }
        >
          Run SLA sweep now
        </Button>
        <Button
          variant="danger"
          disabled={pending}
          onClick={() => {
            if (confirm("Reset all demo data? Every project, movement and escalation is rebuilt."))
              start(() => void resetSeedAction());
          }}
        >
          Reset demo data
        </Button>
      </div>
      {message ? <p className="text-xs text-slate-600">{message}</p> : null}
    </div>
  );
}
