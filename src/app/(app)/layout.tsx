import { requireUser, demoAccounts } from "@/lib/auth";
import { getDb, nowApp } from "@/lib/db/store";
import { escalationViews } from "@/lib/db/queries";
import { notificationsFor } from "@/lib/db/analytics";
import { Sidebar } from "@/components/sidebar";
import { Topbar } from "@/components/topbar";
import { formatDate } from "@/lib/utils";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser();
  const db = getDb();
  const openEscalations = escalationViews().filter((e) => !e.decided).length;

  return (
    <div className="flex min-h-screen">
      <Sidebar role={user.role} escalationCount={openEscalations} />
      <div className="flex min-w-0 flex-1 flex-col">
        <Topbar
          user={user}
          accounts={demoAccounts()}
          clockOffsetDays={Math.round(db.system_clock.offset_minutes / (60 * 24))}
          appDate={formatDate(nowApp())}
          notifications={notificationsFor(user)}
        />
        <main className="flex-1 px-4 py-5 sm:px-5 sm:py-6">{children}</main>
      </div>
    </div>
  );
}
