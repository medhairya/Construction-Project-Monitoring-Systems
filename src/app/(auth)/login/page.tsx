import { redirect } from "next/navigation";
import { currentUser, demoAccounts } from "@/lib/auth";
import { DEMO_PASSWORD } from "@/lib/db/seed";
import { getDb } from "@/lib/db/store";
import { ROLE_LABEL } from "@/lib/rbac";
import { stageName } from "@/lib/domain/stages";
import { STAGE_DEFINITIONS } from "@/lib/domain/stages";
import { LoginForm } from "./login-form";
import type { Profile } from "@/lib/domain/types";

export default async function LoginPage() {
  const user = await currentUser();
  if (user) redirect("/dashboard");

  const db = getDb();
  const accounts = demoAccounts();

  // Group the accounts by department, so it is obvious which login sits where
  // in the flow and which stages that department owns.
  const groups = db.departments.map((dept) => ({
    dept,
    stages: STAGE_DEFINITIONS.filter((s) => s.owner_department_code === dept.code),
    members: accounts.filter((a) => a.department_id === dept.id),
  }));
  const unattached = accounts.filter((a) => !a.department_id);

  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-100 px-4 py-10">
      <div className="grid w-full max-w-5xl gap-6 lg:grid-cols-[minmax(0,22rem)_minmax(0,1fr)]">
        <div className="h-fit rounded-lg border border-slate-200 bg-white p-8 shadow-sm">
          <p className="text-lg font-bold tracking-tight text-sky-900">PWFTS</p>
          <p className="mt-1 text-sm text-slate-600">
            Public Works File Tracking &amp; Project Monitoring
          </p>
          <p className="text-xs text-slate-600">જાહેર બાંધકામ ફાઇલ ટ્રેકિંગ સિસ્ટમ</p>
          <div className="mt-6">
            <LoginForm />
          </div>
        </div>

        <div className="rounded-lg border border-slate-200 bg-white p-6 shadow-sm sm:p-8">
          <p className="text-sm font-semibold text-slate-900">Demo accounts, by department</p>
          <p className="mt-1 text-xs text-slate-600">
            Password for every account:{" "}
            <code className="rounded bg-slate-100 px-1 font-semibold">{DEMO_PASSWORD}</code>. Each
            department only sees desk-level detail for its own files.
          </p>

          <div className="mt-5 space-y-5">
            {groups.map(({ dept, stages, members }) =>
              members.length === 0 ? null : (
                <section key={dept.id}>
                  <div className="flex flex-wrap items-baseline gap-2 border-b border-slate-200 pb-1">
                    <h2 className="text-xs font-bold uppercase tracking-wide text-sky-900">
                      {dept.name}
                    </h2>
                    <span className="rounded bg-slate-100 px-1.5 py-0.5 text-[10px] font-semibold text-slate-600">
                      {dept.code}
                    </span>
                    <span className="text-[11px] text-slate-600">
                      owns {stages.map((s) => "stage " + s.seq).join(", ")} ·{" "}
                      {stages.map((s) => stageName(s.key)).join(" / ")}
                    </span>
                  </div>
                  <ul className="mt-2 space-y-1.5">
                    {members.map((a) => (
                      <AccountRow key={a.id} account={a} deskName={deskOf(a, db.desks)} />
                    ))}
                  </ul>
                </section>
              ),
            )}

            {unattached.length > 0 ? (
              <section>
                <div className="border-b border-slate-200 pb-1">
                  <h2 className="text-xs font-bold uppercase tracking-wide text-slate-700">
                    No department
                  </h2>
                </div>
                <ul className="mt-2 space-y-1.5">
                  {unattached.map((a) => (
                    <AccountRow key={a.id} account={a} deskName={null} />
                  ))}
                </ul>
              </section>
            ) : null}
          </div>

          <p className="mt-5 text-[11px] text-slate-600">
            After signing in you can switch between all of these from the top bar without logging
            out.
          </p>
        </div>
      </div>
    </main>
  );
}

function AccountRow({ account, deskName }: { account: Profile; deskName: string | null }) {
  return (
    <li className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5">
      <code className="text-xs font-semibold text-slate-900">{account.email}</code>
      <span className="text-[11px] text-slate-600">
        {ROLE_LABEL[account.role]}
        {deskName ? " · " + deskName : ""} · {account.full_name}
      </span>
    </li>
  );
}

function deskOf(account: Profile, desks: { id: string; designation: string }[]): string | null {
  return desks.find((d) => d.id === account.desk_id)?.designation ?? null;
}
