import Link from "next/link";
import { AlertTriangle, CheckCircle2, FileStack, TimerReset } from "lucide-react";
import { requireUser } from "@/lib/auth";
import { escalationViews, inboxFor, kpisFor } from "@/lib/db/queries";
import {
  bottleneckDesk,
  deskLoad,
  districtOverview,
  inboxHealth,
  ministryHighPriority,
  siteSummary,
  stageLoad,
} from "@/lib/db/analytics";
import { stageName } from "@/lib/domain/stages";
import { Card, CardBody, CardHeader, CardTitle, EmptyState, Td, Th } from "@/components/ui";
import { PriorityBadge, SlaPill, StatusBadge } from "@/components/status";
import { StageLoadChart } from "@/components/charts";
import { ROLE_LABEL } from "@/lib/rbac";
import { formatCost, formatDate } from "@/lib/utils";

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const user = await requireUser();
  const kpis = kpisFor(user);
  const inbox = inboxFor(user).slice(0, 6);
  const escalations = escalationViews().filter((e) => !e.decided);

  const cards = [
    { label: "Active projects", value: kpis.active, icon: FileStack, tone: "text-sky-700" },
    { label: "Escalated", value: kpis.escalated, icon: AlertTriangle, tone: "text-red-700" },
    { label: "SLA at risk (≥75%)", value: kpis.atRisk, icon: TimerReset, tone: "text-amber-700" },
    { label: "Completed", value: kpis.completed, icon: CheckCircle2, tone: "text-emerald-700" },
  ];

  const isMinistry = user.role === "MINISTRY" || user.role === "SUPER_ADMIN";
  const isDeptView = user.role === "DEPT_HEAD" || user.role === "DEPT_OPERATOR";

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold tracking-tight text-slate-900">Dashboard</h1>
        <p className="text-sm text-slate-600">
          {user.full_name} · {ROLE_LABEL[user.role]}
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {cards.map((c) => (
          <Card key={c.label}>
            <CardBody className="flex items-center gap-4">
              <c.icon className={"h-8 w-8 shrink-0 " + c.tone} />
              <div className="min-w-0">
                <p className="text-2xl font-semibold text-slate-900">{c.value}</p>
                <p className="truncate text-xs text-slate-600">{c.label}</p>
              </div>
            </CardBody>
          </Card>
        ))}
      </div>

      {isMinistry ? <MinistryPanels /> : null}
      {isDeptView ? <DeptPanels departmentId={user.department_id} userId={user.id} /> : null}
      {user.role === "SITE_ENGINEER" ? <SitePanels userId={user.id} /> : null}

      <div className="grid gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader className="flex items-center justify-between">
            <CardTitle>
              {user.role === "SITE_ENGINEER" ? "My projects" : "My department inbox"}
            </CardTitle>
            <Link href="/inbox" className="text-xs font-medium text-sky-700 hover:underline">
              View all
            </Link>
          </CardHeader>
          <CardBody className="p-0">
            {inbox.length === 0 ? (
              <div className="p-5">
                <EmptyState title="No files are currently with you." />
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[520px]">
                  <thead>
                    <tr>
                      <Th>Project</Th>
                      <Th>Stage</Th>
                      <Th>Held at</Th>
                      <Th>SLA</Th>
                    </tr>
                  </thead>
                  <tbody>
                    {inbox.map((v) => (
                      <tr key={v.project.id}>
                        <Td>
                          <Link
                            href={"/projects/" + v.project.project_code}
                            className="font-medium text-sky-800 hover:underline"
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
                        <Td>
                          <SlaPill sla={v.sla} slaDays={v.instance?.sla_days} />
                        </Td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </CardBody>
        </Card>

        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Open escalations</CardTitle>
            </CardHeader>
            <CardBody className="space-y-3">
              {escalations.length === 0 ? (
                <p className="text-xs text-slate-600">Nothing escalated right now.</p>
              ) : (
                escalations.slice(0, 5).map((e) => (
                  <Link
                    key={e.escalation.id}
                    href={"/escalations/" + e.escalation.id}
                    className="block rounded-md border border-red-100 bg-red-50 px-3 py-2 hover:border-red-300"
                  >
                    <p className="text-xs font-semibold text-red-800">{e.project.project_code}</p>
                    <p className="text-[11px] text-red-700">
                      {e.stageName} · {e.daysOverdue}d overdue ·{" "}
                      {e.escalation.status.replace(/_/g, " ").toLowerCase()}
                    </p>
                  </Link>
                ))
              )}
            </CardBody>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Where the files are</CardTitle>
            </CardHeader>
            <CardBody>
              <StageLoadChart data={stageLoad()} />
            </CardBody>
          </Card>
        </div>
      </div>
    </div>
  );
}

async function MinistryPanels() {
  const districts = districtOverview();
  const high = ministryHighPriority();

  return (
    <div className="grid gap-6 lg:grid-cols-3">
      <Card className="lg:col-span-2">
        <CardHeader>
          <CardTitle>District overview</CardTitle>
        </CardHeader>
        <CardBody className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[620px]">
              <thead>
                <tr>
                  <Th>District</Th>
                  <Th>Projects</Th>
                  <Th>Active</Th>
                  <Th>At risk</Th>
                  <Th>Escalated</Th>
                  <Th>Completed</Th>
                  <Th>Sanctioned</Th>
                </tr>
              </thead>
              <tbody>
                {districts.map((d) => (
                  <tr key={d.district}>
                    <Td className="text-xs font-medium">{d.district}</Td>
                    <Td className="text-xs">{d.total}</Td>
                    <Td className="text-xs">{d.active}</Td>
                    <Td className="text-xs">
                      <span className={d.atRisk > 0 ? "font-semibold text-amber-700" : ""}>
                        {d.atRisk}
                      </span>
                    </Td>
                    <Td className="text-xs">
                      <span className={d.escalated > 0 ? "font-semibold text-red-700" : ""}>
                        {d.escalated}
                      </span>
                    </Td>
                    <Td className="text-xs">{d.completed}</Td>
                    <Td className="text-xs">{formatCost(d.sanctionedCost)}</Td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardBody>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>HIGH priority after a decision</CardTitle>
        </CardHeader>
        <CardBody className="space-y-2">
          {high.length === 0 ? (
            <p className="text-xs text-slate-600">No HIGH priority files.</p>
          ) : (
            high.map((v) => (
              <Link
                key={v.project.id}
                href={"/projects/" + v.project.project_code}
                className="block rounded-md border border-slate-200 px-3 py-2 hover:border-sky-300"
              >
                <p className="text-xs font-semibold text-slate-800">{v.project.project_code}</p>
                <p className="text-[11px] text-slate-600">
                  {stageName(v.project.current_stage_key)} · {v.ownerDeptName}
                </p>
              </Link>
            ))
          )}
        </CardBody>
      </Card>
    </div>
  );
}

async function DeptPanels({
  departmentId,
  userId,
}: {
  departmentId: string | null;
  userId: string;
}) {
  if (!departmentId) return null;
  const user = { id: userId, role: "DEPT_HEAD" as const, department_id: departmentId };
  const health = inboxHealth({
    ...user,
    email: "",
    full_name: "",
    desk_id: null,
  });
  const desks = deskLoad(departmentId);
  const bottleneck = bottleneckDesk(departmentId);

  return (
    <div className="grid gap-6 lg:grid-cols-3">
      <Card>
        <CardHeader>
          <CardTitle>Inbox health</CardTitle>
        </CardHeader>
        <CardBody className="space-y-3">
          <p className="text-3xl font-semibold text-slate-900">{health.total}</p>
          <p className="text-xs text-slate-600">files with your department</p>
          <div className="flex h-2 overflow-hidden rounded-full bg-slate-100">
            <div className="bg-emerald-500" style={{ width: pct(health.green, health.total) }} />
            <div className="bg-amber-500" style={{ width: pct(health.amber, health.total) }} />
            <div className="bg-red-500" style={{ width: pct(health.red, health.total) }} />
          </div>
          <p className="text-[11px] text-slate-600">
            {health.green} on track · {health.amber} at risk · {health.red} breached ·{" "}
            {health.highPriority} high priority
          </p>
        </CardBody>
      </Card>

      <Card className="lg:col-span-2">
        <CardHeader className="flex items-center justify-between">
          <CardTitle>Desk performance</CardTitle>
          {bottleneck ? (
            <span className="text-xs text-red-700">
              Bottleneck: {bottleneck.desk} ({bottleneck.avgTurnaround}d average)
            </span>
          ) : null}
        </CardHeader>
        <CardBody className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[520px]">
              <thead>
                <tr>
                  <Th>Desk</Th>
                  <Th>Officer</Th>
                  <Th>Holding now</Th>
                  <Th>Avg days held</Th>
                  <Th>Avg turnaround</Th>
                </tr>
              </thead>
              <tbody>
                {desks.map((d) => (
                  <tr key={d.desk} className={bottleneck?.desk === d.desk ? "bg-red-50" : ""}>
                    <Td className="text-xs font-medium">{d.desk}</Td>
                    <Td className="text-xs">{d.officer}</Td>
                    <Td className="text-xs">{d.holding}</Td>
                    <Td className="text-xs">{d.avgDaysHeld}d</Td>
                    <Td className="text-xs">{d.handled > 0 ? d.avgTurnaround + "d" : "—"}</Td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardBody>
      </Card>
    </div>
  );
}

async function SitePanels({ userId }: { userId: string }) {
  const rows = siteSummary({
    id: userId,
    role: "SITE_ENGINEER",
    department_id: null,
    email: "",
    full_name: "",
    desk_id: null,
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle>My sites — progress and reports due</CardTitle>
      </CardHeader>
      <CardBody className="p-0">
        {rows.length === 0 ? (
          <div className="p-5">
            <EmptyState title="No sites are assigned to you." />
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[620px]">
              <thead>
                <tr>
                  <Th>Project</Th>
                  <Th>Progress</Th>
                  <Th>Reports missed</Th>
                  <Th>Last report</Th>
                  <Th>Due</Th>
                  <Th>Status</Th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.project.id}>
                    <Td>
                      <Link
                        href={"/projects/" + r.project.project_code + "/execution"}
                        className="text-xs font-semibold text-sky-800 hover:underline"
                      >
                        {r.project.project_code}
                      </Link>
                      <p className="text-xs text-slate-600">{r.project.title}</p>
                    </Td>
                    <Td>
                      <div className="flex items-center gap-2">
                        <div className="h-1.5 w-20 overflow-hidden rounded-full bg-slate-200">
                          <div
                            className="h-full rounded-full bg-sky-700"
                            style={{ width: r.progressPct + "%" }}
                          />
                        </div>
                        <span className="text-xs">{r.progressPct}%</span>
                      </div>
                    </Td>
                    <Td className="text-xs">
                      <span className={r.missedReports > 0 ? "font-semibold text-amber-700" : ""}>
                        {r.missedReports}
                      </span>
                    </Td>
                    <Td className="text-xs">{formatDate(r.lastReport)}</Td>
                    <Td className="text-xs">{formatDate(r.dueAt)}</Td>
                    <Td>
                      <StatusBadge status={r.project.status} />
                    </Td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </CardBody>
    </Card>
  );
}

function pct(part: number, total: number) {
  if (total === 0) return "0%";
  return (part / total) * 100 + "%";
}
