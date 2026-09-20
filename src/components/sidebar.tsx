"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  AlertTriangle,
  FolderSearch,
  Inbox,
  LayoutDashboard,
  Settings,
  FilePlus2,
  HardHat,
} from "lucide-react";
import { cn } from "@/lib/utils";
import type { Role } from "@/lib/domain/types";
import { NAV_FOR_ROLE, type NavIcon } from "@/components/nav-items";

const ICONS: Record<NavIcon, typeof LayoutDashboard> = {
  dashboard: LayoutDashboard,
  projects: FolderSearch,
  new: FilePlus2,
  inbox: Inbox,
  escalations: AlertTriangle,
  execution: HardHat,
  admin: Settings,
};

export function Sidebar({ role, escalationCount }: { role: Role; escalationCount: number }) {
  const pathname = usePathname();
  const items = NAV_FOR_ROLE(role);
  return (
    <aside className="hidden w-60 shrink-0 border-r border-slate-200 bg-white md:block">
      <div className="px-5 py-4">
        <Link href="/dashboard" className="block">
          <p className="text-base font-bold tracking-tight text-sky-900">PWFTS</p>
          <p className="text-[11px] leading-tight text-slate-600">
            Public Works File Tracking
            <br />
            <span className="text-slate-600">જાહેર બાંધકામ ફાઇલ ટ્રેકિંગ</span>
          </p>
        </Link>
      </div>
      <nav className="px-2 pb-6">
        {items.map((item) => {
          const Icon = ICONS[item.icon];
          const active =
            pathname === item.href ||
            (item.href !== "/dashboard" &&
              item.href !== "/projects/new" &&
              pathname.startsWith(item.href));
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "mb-0.5 flex items-center gap-2.5 rounded-md px-3 py-2 text-sm font-medium transition-colors",
                active
                  ? "bg-sky-50 text-sky-900"
                  : "text-slate-600 hover:bg-slate-50 hover:text-slate-900",
              )}
            >
              <Icon className="h-4 w-4" />
              <span className="flex-1">{item.label}</span>
              {item.href === "/escalations" && escalationCount > 0 ? (
                <span className="rounded-full bg-red-600 px-1.5 py-0.5 text-[10px] font-bold text-white">
                  {escalationCount}
                </span>
              ) : null}
            </Link>
          );
        })}
      </nav>
    </aside>
  );
}
