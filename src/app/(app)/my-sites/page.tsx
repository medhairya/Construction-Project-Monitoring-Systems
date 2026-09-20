import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { sweepAndList } from "@/lib/db/queries";
import { getDb } from "@/lib/db/store";
import { stageName } from "@/lib/domain/stages";
import { Card, CardBody, EmptyState, Td, Th } from "@/components/ui";
import { SlaPill, StatusBadge } from "@/components/status";

export const dynamic = "force-dynamic";

export default async function MySitesPage() {
  const user = await requireUser();
  const db = getDb();
  const rows = sweepAndList(user).filter(
    (v) => v.project.assigned_site_engineer_id === user.id || user.role !== "SITE_ENGINEER",
  );

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-xl font-semibold tracking-tight text-slate-900">My sites</h1>
        <p className="text-sm text-slate-600">Projects assigned to you, with reports due.</p>
      </div>

      <Card>
        <CardBody className="p-0">
          {rows.length === 0 ? (
            <div className="p-5">
              <EmptyState title="No projects are assigned to you." />
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[560px]">
              <thead>
                <tr>
                  <Th>Project</Th>
                  <Th>Stage</Th>
                  <Th>Reports</Th>
                  <Th>SLA</Th>
                  <Th>Status</Th>
                </tr>
              </thead>
              <tbody>
                {rows.map((v) => (
                  <tr key={v.project.id}>
                    <Td>
                      <Link
                        href={"/projects/" + v.project.project_code + "/execution"}
                        className="font-mono text-xs font-semibold text-sky-800 hover:underline"
                      >
                        {v.project.project_code}
                      </Link>
                      <p className="text-xs text-slate-600">{v.project.title}</p>
                    </Td>
                    <Td className="text-xs">{stageName(v.project.current_stage_key)}</Td>
                    <Td className="text-xs">
                      {db.execution_reports.filter((r) => r.project_id === v.project.id).length}{" "}
                      submitted
                    </Td>
                    <Td>
                      <SlaPill sla={v.sla} slaDays={v.instance?.sla_days} />
                    </Td>
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
