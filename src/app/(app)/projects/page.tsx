import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { sweepAndList } from "@/lib/db/queries";
import { getDb } from "@/lib/db/store";
import { STAGE_DEFINITIONS, stageName } from "@/lib/domain/stages";
import { Card, CardBody, EmptyState, Input, Select, Button, Td, Th } from "@/components/ui";
import { PriorityBadge, SlaPill, StatusBadge } from "@/components/status";
import { formatCost } from "@/lib/utils";

export const dynamic = "force-dynamic";

interface SearchParams {
  q?: string;
  district?: string;
  stage?: string;
  status?: string;
  priority?: string;
}

export default async function ProjectsPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const user = await requireUser();
  const sp = await searchParams;
  const db = getDb();

  const rows = sweepAndList(user).filter((v) => {
    const q = (sp.q ?? "").trim().toLowerCase();
    if (q && !(v.project.project_code.toLowerCase().includes(q) || v.project.title.toLowerCase().includes(q)))
      return false;
    if (sp.district && v.project.district_id !== sp.district) return false;
    if (sp.stage && v.project.current_stage_key !== sp.stage) return false;
    if (sp.status && v.project.status !== sp.status) return false;
    if (sp.priority && v.project.priority !== sp.priority) return false;
    return true;
  });

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-xl font-semibold tracking-tight text-slate-900">Projects</h1>
        <p className="text-sm text-slate-600">
          Search by Project ID or title. {rows.length} of {db.projects.length} shown.
        </p>
      </div>

      <Card>
        <CardBody>
          <form className="grid gap-3 md:grid-cols-6">
            <div className="md:col-span-2">
              <Input
                name="q"
                aria-label="Search by Project ID or title"
                placeholder="GJ-RB-2026-AHD-0001 or title"
                defaultValue={sp.q ?? ""}
              />
            </div>
            <Select name="district" aria-label="Filter by district" defaultValue={sp.district ?? ""}>
              <option value="">All districts</option>
              {db.districts.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.name}
                </option>
              ))}
            </Select>
            <Select name="stage" aria-label="Filter by stage" defaultValue={sp.stage ?? ""}>
              <option value="">All stages</option>
              {STAGE_DEFINITIONS.map((s) => (
                <option key={s.key} value={s.key}>
                  {s.seq}. {s.name}
                </option>
              ))}
            </Select>
            <Select name="status" aria-label="Filter by status" defaultValue={sp.status ?? ""}>
              <option value="">Any status</option>
              <option value="ACTIVE">Active</option>
              <option value="ESCALATED">Escalated</option>
              <option value="COMPLETED">Completed</option>
              <option value="CANCELLED">Cancelled</option>
            </Select>
            <div className="flex gap-2">
              <Select name="priority" aria-label="Filter by priority" defaultValue={sp.priority ?? ""}>
                <option value="">Any priority</option>
                <option value="HIGH">High</option>
                <option value="NORMAL">Normal</option>
              </Select>
              <Button type="submit">Search</Button>
            </div>
          </form>
        </CardBody>
      </Card>

      <Card>
        <CardBody className="p-0">
          {rows.length === 0 ? (
            <div className="p-5">
              <EmptyState title="No projects match this search." hint="Clear the filters and try again." />
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[840px]">
                <thead>
                  <tr>
                    <Th>Project ID</Th>
                    <Th>Title</Th>
                    <Th>Stage</Th>
                    <Th>With</Th>
                    <Th>Cost</Th>
                    <Th>SLA</Th>
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
                      </Td>
                      <Td>
                        <div className="flex items-center gap-2">
                          <span className="text-sm">{v.project.title}</span>
                          <PriorityBadge priority={v.project.priority} />
                        </div>
                        <p className="text-[11px] text-slate-600">{v.districtName}</p>
                      </Td>
                      <Td className="text-xs">{stageName(v.project.current_stage_key)}</Td>
                      <Td className="text-xs">{v.ownerDeptName}</Td>
                      <Td className="text-xs">{formatCost(v.project.sanctioned_cost)}</Td>
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
