import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { escalationViews } from "@/lib/db/queries";
import { Badge, Card, CardBody, EmptyState, Td, Th } from "@/components/ui";
import { PriorityBadge } from "@/components/status";
import { formatDate, titleCase } from "@/lib/utils";

export const dynamic = "force-dynamic";

const STATUS_TONE: Record<string, string> = {
  AWAITING_JUSTIFICATION: "border-red-200 bg-red-50 text-red-700",
  UNDER_REVIEW: "border-amber-200 bg-amber-50 text-amber-700",
  DECIDED: "border-emerald-200 bg-emerald-50 text-emerald-700",
};

export default async function EscalationsPage() {
  await requireUser();
  const rows = escalationViews();

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-xl font-semibold tracking-tight text-slate-900">Escalations</h1>
        <p className="text-sm text-slate-600">
          Every SLA breach lands here: justification → official chat → Ministry decision (rule R7).
        </p>
      </div>

      <Card>
        <CardBody className="p-0">
          {rows.length === 0 ? (
            <div className="p-5">
              <EmptyState title="No escalations." hint="Advance the demo clock in Admin to force a breach." />
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[840px]">
                <thead>
                  <tr>
                    <Th>Project</Th>
                    <Th>Stage</Th>
                    <Th>Breached on</Th>
                    <Th>Overdue</Th>
                    <Th>Progress</Th>
                    <Th>Status</Th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((e) => (
                    <tr key={e.escalation.id} className="hover:bg-slate-50">
                      <Td>
                        <Link
                          href={"/escalations/" + e.escalation.id}
                          className="font-mono text-xs font-semibold text-sky-800 hover:underline"
                        >
                          {e.project.project_code}
                        </Link>
                        <div className="flex items-center gap-2">
                          <span className="text-xs text-slate-600">{e.project.title}</span>
                          <PriorityBadge priority={e.project.priority} />
                        </div>
                      </Td>
                      <Td className="text-xs">{e.stageName}</Td>
                      <Td className="text-xs">{formatDate(e.escalation.breached_at)}</Td>
                      <Td className="text-xs font-semibold text-red-700">{e.daysOverdue}d</Td>
                      <Td className="text-xs">
                        {e.hasJustification ? "justification ✓" : "justification pending"} ·{" "}
                        {e.messageCount} chat message{e.messageCount === 1 ? "" : "s"}
                      </Td>
                      <Td>
                        <Badge className={STATUS_TONE[e.escalation.status]}>
                          {titleCase(e.escalation.status)}
                        </Badge>
                      </Td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardBody>
      </Card>
    </div>
  );
}
