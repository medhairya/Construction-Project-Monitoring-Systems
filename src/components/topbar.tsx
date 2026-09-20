"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { Clock, LogOut, Menu, Users, X } from "lucide-react";
import { logoutAction, shiftClockAction, switchUserAction } from "@/lib/actions";
import { ROLE_LABEL } from "@/lib/rbac";
import type { Profile } from "@/lib/domain/types";
import { Button } from "@/components/ui";
import { NotificationBell } from "@/components/notifications";
import { NAV_FOR_ROLE } from "@/components/nav-items";
import type { Notification } from "@/lib/db/analytics";

export interface SwitcherAccount extends Profile {
  /** Department name, so the switcher says which desk you are moving to. */
  departmentName: string;
}

export function Topbar({
  user,
  accounts,
  clockOffsetDays,
  appDate,
  notifications,
}: {
  user: Profile;
  accounts: SwitcherAccount[];
  clockOffsetDays: number;
  appDate: string;
  notifications: Notification[];
}) {
  const [pending, start] = useTransition();
  const [menuOpen, setMenuOpen] = useState(false);
  const navItems = NAV_FOR_ROLE(user.role);
  const currentDept = accounts.find((a) => a.id === user.id)?.departmentName ?? null;

  return (
    <header className="border-b border-slate-200 bg-white">
      <div className="flex flex-wrap items-center gap-3 px-4 py-2.5 sm:px-5">
        <button
          type="button"
          aria-label="Open menu"
          className="rounded-md p-2 text-slate-600 hover:bg-slate-100 md:hidden"
          onClick={() => setMenuOpen((v) => !v)}
        >
          {menuOpen ? <X className="h-4 w-4" /> : <Menu className="h-4 w-4" />}
        </button>

        <div className="flex items-center gap-2 text-xs text-slate-600">
          <Clock className="h-3.5 w-3.5 shrink-0" />
          <span>
            <span className="hidden sm:inline">System date </span>
            <span className="font-medium text-slate-700">{appDate}</span>
            {clockOffsetDays !== 0 ? (
              <span className="ml-1 rounded bg-amber-100 px-1.5 py-0.5 font-semibold text-amber-800">
                demo clock {clockOffsetDays > 0 ? "+" : ""}
                {clockOffsetDays}d
              </span>
            ) : null}
          </span>
        </div>

        <div className="ml-auto flex items-center gap-2 sm:gap-3">
          <NotificationBell items={notifications} />

          <div className="flex items-center gap-2">
            <Users className="hidden h-3.5 w-3.5 text-slate-600 sm:block" />
            <select
              aria-label="Switch demo user"
              disabled={pending}
              value={user.id}
              onChange={(e) => start(() => void switchUserAction(e.target.value))}
              className="max-w-[11rem] rounded-md border border-slate-300 bg-white px-2 py-1.5 text-xs text-slate-800 sm:max-w-none"
            >
              {accounts.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.departmentName} — {ROLE_LABEL[a.role]} ({a.full_name})
                </option>
              ))}
            </select>
          </div>

          {/* Stable marker for tests: which persona the server currently sees. */}
          <span data-testid="current-user-id" className="hidden">
            {user.id}
          </span>

          <div className="hidden text-right lg:block">
            <p className="text-xs font-semibold text-slate-800">{user.full_name}</p>
            <p className="text-[11px] text-slate-600">
              {ROLE_LABEL[user.role]}
              {currentDept ? " · " + currentDept : ""}
            </p>
          </div>

          <Button
            variant="ghost"
            size="sm"
            title="Sign out"
            onClick={() => start(() => void logoutAction())}
          >
            <LogOut className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {menuOpen ? (
        <nav className="border-t border-slate-100 px-2 pb-3 md:hidden">
          {navItems.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              onClick={() => setMenuOpen(false)}
              className="block rounded-md px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
            >
              {item.label}
            </Link>
          ))}
        </nav>
      ) : null}
    </header>
  );
}

export function QuickClock() {
  const [pending, start] = useTransition();
  return (
    <div className="flex gap-2">
      <Button size="sm" variant="secondary" disabled={pending} onClick={() => start(() => void shiftClockAction(1))}>
        +1 day
      </Button>
      <Button size="sm" variant="secondary" disabled={pending} onClick={() => start(() => void shiftClockAction(7))}>
        +7 days
      </Button>
    </div>
  );
}
