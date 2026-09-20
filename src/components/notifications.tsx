"use client";

import { useState } from "react";
import Link from "next/link";
import { AlertTriangle, Bell, FileInput, Gavel, MessageSquare, TimerReset } from "lucide-react";
import type { Notification, NotificationKind } from "@/lib/db/analytics";
import { formatDateTime } from "@/lib/utils";

const ICONS: Record<NotificationKind, typeof Bell> = {
  INBOX: FileInput,
  AT_RISK: TimerReset,
  BREACH: AlertTriangle,
  CHAT: MessageSquare,
  DECISION: Gavel,
};

export function NotificationBell({ items }: { items: Notification[] }) {
  const [open, setOpen] = useState(false);
  const urgent = items.filter((i) => i.urgent).length;

  return (
    <div className="relative">
      <button
        type="button"
        aria-label={"Notifications (" + items.length + ")"}
        onClick={() => setOpen((v) => !v)}
        className="relative rounded-md p-2 text-slate-600 hover:bg-slate-100"
      >
        <Bell className="h-4 w-4" />
        {items.length > 0 ? (
          <span
            className={
              "absolute -right-0.5 -top-0.5 rounded-full px-1.5 text-[10px] font-bold text-white " +
              (urgent > 0 ? "bg-red-600" : "bg-sky-700")
            }
          >
            {items.length}
          </span>
        ) : null}
      </button>

      {open ? (
        <>
          <button
            type="button"
            aria-hidden
            tabIndex={-1}
            className="fixed inset-0 z-10 cursor-default"
            onClick={() => setOpen(false)}
          />
          <div className="absolute right-0 z-20 mt-2 max-h-[70vh] w-80 overflow-y-auto rounded-lg border border-slate-200 bg-white shadow-lg">
            <p className="border-b border-slate-100 px-4 py-2 text-xs font-semibold text-slate-700">
              Notifications
            </p>
            {items.length === 0 ? (
              <p className="px-4 py-6 text-center text-xs text-slate-600">Nothing needs you.</p>
            ) : (
              items.map((n) => {
                const Icon = ICONS[n.kind];
                return (
                  <Link
                    key={n.id}
                    href={n.href}
                    onClick={() => setOpen(false)}
                    className="flex gap-3 border-b border-slate-50 px-4 py-3 last:border-0 hover:bg-slate-50"
                  >
                    <Icon
                      className={"mt-0.5 h-4 w-4 shrink-0 " + (n.urgent ? "text-red-600" : "text-slate-600")}
                    />
                    <span className="min-w-0">
                      <span className="block truncate text-xs font-semibold text-slate-800">
                        {n.title}
                      </span>
                      <span className="block text-[11px] leading-snug text-slate-600">
                        {n.detail}
                      </span>
                      <span className="mt-0.5 block text-[10px] text-slate-600">
                        {formatDateTime(n.at)}
                      </span>
                    </span>
                  </Link>
                );
              })
            )}
          </div>
        </>
      ) : null}
    </div>
  );
}
