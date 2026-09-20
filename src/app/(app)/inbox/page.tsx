import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { inboxFor } from "@/lib/db/queries";
import { stageName } from "@/lib/domain/stages";
import { Alert, Card, CardBody, EmptyState, Td, Th } from "@/components/ui";
import { PriorityBadge, SlaBar, SlaPill, StatusBadge } from "@/components/status";
import { departmentName } from "@/lib/rbac";
import { getDb } from "@/lib/db/store";
import { formatDate } from "@/lib/utils";

export const dynamic = "force-dynamic";

export default async function InboxPage() {
  const user = await requireUser();
  const rows = inboxFor(user);
  const db = getDb();

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-xl font-semibold tracking-tight text-slate-900">
          {user.role === "MINISTRY" || user.role === "SUPER_ADMIN"
            ? "All files in the system"
            : "Files currently in " + departmentName(user.department_id, db.departments)}
        </h1>
        <p className="text-sm text-slate-600">
          Sorted by HIGH priority first, then by least SLA remaining.
        </p>
      </div>

      {rows.some((r) => r.project.priority === "HIGH") ? (
        <Alert tone="warning">
          A re-entered HIGH priority file is at the top of this list. It came back through a Ministry
          decision after an SLA breach.
        </Alert>
      ) : null}

      <Card>
        <CardBody className="p-0">
          {rows.length === 0 ? (
            <div className="p-5">
              <EmptyState
                title="No files are with your department right now."
                hint="Files appear here as soon as a stage owned by your department becomes active."
              />
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[900px]">
                <thead>
                  <tr>
                    <Th>Project</Th>
                    <Th>Stage</Th>
                    <Th>Desk holding it</Th>
                    <Th>Days held</Th>
                    <Th>SLA remaining</Th>
                    <Th>Due</Th>
                    <Th>Status</Th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((v) => (
                    <tr key={v.project.id} className="hover:bg-slate-50">
                      <Td>
                        <Link
                          href={"/projects/" + v.project.project_code}
                          className="font-mono text-xs font-semibold text-sky-800 hover:underline"
                        >
                          {v.project.project_code}
                        </Link>
                        <div className="flex items-center gap-2">
                          <span className="text-xs text-slate-600">{v.project.title}</span>
                          <PriorityBadge priority={v.project.priority} />
                        </div>
                      </Td>
                      <Td className="text-xs">{stageName(v.project.current_stage_key)}</Td>
                      <Td className="text-xs">{v.holderDesk?.designation ?? "—"}</Td>
                      <Td className="text-xs">{v.sla?.daysUsed ?? 0}d</Td>
                      <Td className="w-44">
                        <SlaPill sla={v.sla} slaDays={v.instance?.sla_days} />
                        <div className="mt-1">
                          <SlaBar sla={v.sla} />
                        </div>
                      </Td>
                      <Td className="text-xs">{formatDate(v.instance?.due_at)}</Td>
                      <Td>
                        <StatusBadge status={v.project.status} />
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
