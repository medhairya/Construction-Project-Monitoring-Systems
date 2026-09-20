import { NextResponse } from "next/server";
import { fnSlaSweep } from "@/lib/db/rpc";
import { nowApp } from "@/lib/db/store";

export const dynamic = "force-dynamic";

/**
 * SLA sweep (R7.1). Called by a scheduler (pg_cron / Vercel Cron) and also run
 * on every dashboard, inbox and escalation page load.
 * Protected by CRON_SECRET when that variable is set.
 */
export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (secret) {
    const auth = request.headers.get("authorization");
    if (auth !== "Bearer " + secret) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
  }
  const result = fnSlaSweep();
  return NextResponse.json({ ok: true, at: nowApp().toISOString(), ...result });
}
