// SLA computation. Callers pass the app clock (nowApp) so the demo clock
// offset is respected everywhere.
export type SlaLevel = "GREEN" | "AMBER" | "RED";

export const MS_PER_DAY = 86_400_000;

export function addDays(from: Date, days: number): Date {
  return new Date(from.getTime() + days * MS_PER_DAY);
}

export function daysBetween(a: Date, b: Date): number {
  return (b.getTime() - a.getTime()) / MS_PER_DAY;
}

export interface SlaState {
  daysUsed: number;
  daysRemaining: number;
  pctUsed: number;
  level: SlaLevel;
  breached: boolean;
}

export function slaState(
  startedAt: string | Date,
  dueAt: string | Date,
  now: Date,
  endedAt?: string | Date | null,
): SlaState {
  const start = new Date(startedAt);
  const due = new Date(dueAt);
  const end = endedAt ? new Date(endedAt) : now;
  const total = Math.max(daysBetween(start, due), 0.0001);
  const used = Math.max(daysBetween(start, end), 0);
  const pctUsed = (used / total) * 100;
  const breached = end.getTime() > due.getTime();
  const level: SlaLevel = breached ? "RED" : pctUsed >= 75 ? "AMBER" : "GREEN";
  return {
    daysUsed: Math.floor(used),
    daysRemaining: Math.ceil(daysBetween(end, due)),
    pctUsed: Math.min(Math.round(pctUsed), 999),
    level,
    breached,
  };
}

export const SLA_BADGE: Record<SlaLevel, string> = {
  GREEN: "text-emerald-700 bg-emerald-50 border-emerald-200",
  AMBER: "text-amber-700 bg-amber-50 border-amber-200",
  RED: "text-red-700 bg-red-50 border-red-200",
};

export const SLA_DOT: Record<SlaLevel, string> = {
  GREEN: "bg-emerald-500",
  AMBER: "bg-amber-500",
  RED: "bg-red-500",
};

export const SLA_BAR: Record<SlaLevel, string> = {
  GREEN: "bg-emerald-500",
  AMBER: "bg-amber-500",
  RED: "bg-red-500",
};
