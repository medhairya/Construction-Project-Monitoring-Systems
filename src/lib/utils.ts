import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/** Indian format: ₹1,84,00,00,000 → "₹184.00 Cr". */
export function formatCost(rupees: number): string {
  if (rupees >= 1_00_00_000) return "₹" + (rupees / 1_00_00_000).toFixed(2) + " Cr";
  if (rupees >= 1_00_000) return "₹" + (rupees / 1_00_000).toFixed(2) + " L";
  return "₹" + rupees.toLocaleString("en-IN");
}

export function formatDate(iso: string | Date | null | undefined): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

export function formatDateTime(iso: string | Date | null | undefined): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function relativeDays(iso: string, now: Date): string {
  const days = Math.round((now.getTime() - new Date(iso).getTime()) / 86_400_000);
  if (days <= 0) return "today";
  if (days === 1) return "1 day ago";
  return days + " days ago";
}

export function titleCase(value: string): string {
  return value
    .toLowerCase()
    .split("_")
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}
