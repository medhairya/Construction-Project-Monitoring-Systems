import { Badge } from "@/components/ui";
import { SLA_BADGE, SLA_BAR, type SlaState } from "@/lib/sla";
import type { Priority, ProjectStatus, StageStatus } from "@/lib/domain/types";
import { cn } from "@/lib/utils";

export function SlaPill({ sla, slaDays }: { sla: SlaState | null; slaDays?: number }) {
  if (!sla) return <span className="text-xs text-slate-600">—</span>;
  const label = sla.breached
    ? Math.abs(sla.daysRemaining) + "d overdue"
    : sla.daysRemaining + "d left";
  return (
    <Badge className={SLA_BADGE[sla.level]}>
      {label}
      {slaDays ? <span className="font-normal">· SLA {slaDays}d</span> : null}
    </Badge>
  );
}

export function SlaBar({ sla }: { sla: SlaState | null }) {
  if (!sla) return null;
  return (
    <div className="h-1.5 w-full overflow-hidden rounded-full bg-slate-200">
      <div
        className={cn("h-full rounded-full", SLA_BAR[sla.level])}
        style={{ width: Math.min(sla.pctUsed, 100) + "%" }}
      />
    </div>
  );
}

export function PriorityBadge({ priority }: { priority: Priority }) {
  if (priority !== "HIGH") return null;
  return <Badge className="border-red-300 bg-red-600 text-white">High priority</Badge>;
}

export function StatusBadge({ status }: { status: ProjectStatus }) {
  const map: Record<ProjectStatus, string> = {
    ACTIVE: "border-emerald-200 bg-emerald-50 text-emerald-700",
    ESCALATED: "border-red-200 bg-red-50 text-red-700",
    COMPLETED: "border-slate-200 bg-slate-100 text-slate-600",
    CANCELLED: "border-slate-200 bg-slate-100 text-slate-600",
  };
  return <Badge className={map[status]}>{status.toLowerCase()}</Badge>;
}

export function StageStatusBadge({ status }: { status: StageStatus }) {
  const map: Record<StageStatus, string> = {
    ACTIVE: "border-sky-200 bg-sky-50 text-sky-700",
    APPROVED: "border-emerald-200 bg-emerald-50 text-emerald-700",
    RETURNED: "border-amber-200 bg-amber-50 text-amber-700",
    BREACHED: "border-red-200 bg-red-50 text-red-700",
  };
  return <Badge className={map[status]}>{status.toLowerCase()}</Badge>;
}
