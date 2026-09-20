import { redirect } from "next/navigation";
import { currentUser, demoAccounts } from "@/lib/auth";
import { DEMO_PASSWORD } from "@/lib/db/seed";
import { ROLE_LABEL } from "@/lib/rbac";
import { LoginForm } from "./login-form";

export default async function LoginPage() {
  const user = await currentUser();
  if (user) redirect("/dashboard");
  const accounts = demoAccounts();

  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-100 px-4 py-10">
      <div className="grid w-full max-w-4xl gap-6 md:grid-cols-2">
        <div className="rounded-lg border border-slate-200 bg-white p-8 shadow-sm">
          <p className="text-lg font-bold tracking-tight text-sky-900">PWFTS</p>
          <p className="mt-1 text-sm text-slate-600">
            Public Works File Tracking &amp; Project Monitoring
          </p>
          <p className="text-xs text-slate-600">જાહેર બાંધકામ ફાઇલ ટ્રેકિંગ સિસ્ટમ</p>
          <div className="mt-6">
            <LoginForm />
          </div>
        </div>

        <div className="rounded-lg border border-slate-200 bg-white p-8 shadow-sm">
          <p className="text-sm font-semibold text-slate-900">Demo accounts</p>
          <p className="mt-1 text-xs text-slate-600">
            Password for every account: <code className="rounded bg-slate-100 px-1">{DEMO_PASSWORD}</code>
          </p>
          <ul className="mt-4 divide-y divide-slate-100">
            {accounts.map((a) => (
              <li key={a.id} className="flex items-center justify-between gap-3 py-2">
                <div>
                  <p className="text-xs font-medium text-slate-800">{a.email}</p>
                  <p className="text-[11px] text-slate-600">
                    {a.full_name} · {ROLE_LABEL[a.role]}
                  </p>
                </div>
              </li>
            ))}
          </ul>
          <p className="mt-4 text-[11px] text-slate-600">
            After signing in you can switch persona from the top bar without logging out.
          </p>
        </div>
      </div>
    </main>
  );
}
