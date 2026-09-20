import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { getDb, nowApp } from "@/lib/db/store";
import { ROLE_LABEL } from "@/lib/rbac";
import { STAGE_DEFINITIONS } from "@/lib/domain/stages";
import { Card, CardBody, CardHeader, CardTitle, Td, Th } from "@/components/ui";
import { AdminControls } from "./controls";
import { formatDateTime } from "@/lib/utils";

export const dynamic = "force-dynamic";

export default async function AdminPage() {
  const user = await requireUser();
  if (user.role !== "SUPER_ADMIN" && user.role !== "MINISTRY") redirect("/dashboard");
  const db = getDb();

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-xl font-semibold tracking-tight text-slate-900">Admin</h1>
        <p className="text-sm text-slate-600">
          Demo clock, seed data, users and the SLA defaults behind every stage.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Demo clock</CardTitle>
        </CardHeader>
        <CardBody className="space-y-3">
          <p className="text-xs text-slate-600">
            Every SLA calculation uses <code className="font-mono">now_app()</code> = real time +
            offset. Move the clock forward to force a breach live during the demo.
          </p>
          <p className="text-sm">
            System date now: <strong>{formatDateTime(nowApp())}</strong> · offset{" "}
            {Math.round(db.system_clock.offset_minutes / (60 * 24))} days
          </p>
          <AdminControls />
        </CardBody>
      </Card>

      <div className="grid gap-5 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Users</CardTitle>
          </CardHeader>
          <CardBody className="p-0">
            <table className="w-full">
              <thead>
                <tr>
                  <Th>Name</Th>
                  <Th>Email</Th>
                  <Th>Role</Th>
                  <Th>Desk</Th>
                </tr>
              </thead>
              <tbody>
                {db.profiles.map((p) => (
                  <tr key={p.id}>
                    <Td className="text-xs">{p.full_name}</Td>
                    <Td className="text-xs">{p.email}</Td>
                    <Td className="text-xs">{ROLE_LABEL[p.role]}</Td>
                    <Td className="text-xs">
                      {db.desks.find((d) => d.id === p.desk_id)?.designation ?? "—"}
                    </Td>
                  </tr>
                ))}
              </tbody>
            </table>
          </CardBody>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Default SLAs</CardTitle>
          </CardHeader>
          <CardBody className="p-0">
            <table className="w-full">
              <thead>
                <tr>
                  <Th>#</Th>
                  <Th>Stage</Th>
                  <Th>Owner</Th>
                  <Th>Default SLA</Th>
                </tr>
              </thead>
              <tbody>
                {STAGE_DEFINITIONS.map((s) => (
                  <tr key={s.key}>
                    <Td className="text-xs">{s.seq}</Td>
                    <Td className="text-xs">{s.name}</Td>
                    <Td className="text-xs">
                      {db.departments.find((d) => d.code === s.owner_department_code)?.name}
                    </Td>
                    <Td className="text-xs">{s.default_sla_days} days</Td>
                  </tr>
                ))}
              </tbody>
            </table>
          </CardBody>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Desks</CardTitle>
        </CardHeader>
        <CardBody className="p-0">
          <table className="w-full">
            <thead>
              <tr>
                <Th>Department</Th>
                <Th>Designation</Th>
                <Th>Officer</Th>
                <Th>Contact</Th>
              </tr>
            </thead>
            <tbody>
              {db.desks.map((d) => (
                <tr key={d.id}>
                  <Td className="text-xs">
                    {db.departments.find((x) => x.id === d.department_id)?.name}
                  </Td>
                  <Td className="text-xs">{d.designation}</Td>
                  <Td className="text-xs">{d.officer_name}</Td>
                  <Td className="text-xs">{d.email}</Td>
                </tr>
              ))}
            </tbody>
          </table>
        </CardBody>
      </Card>
    </div>
  );
}
