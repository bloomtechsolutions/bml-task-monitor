import type { Enums } from "@/lib/database.types";

const TZ = "Indian/Maldives";

/** Today's date (YYYY-MM-DD) in Maldives time, regardless of server timezone. */
export function todayMV(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
}

export function addDays(isoDate: string, days: number): string {
  const d = new Date(`${isoDate}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

export function daysBetween(fromIso: string, toIso: string): number {
  return Math.round((Date.parse(`${toIso}T00:00:00Z`) - Date.parse(`${fromIso}T00:00:00Z`)) / 86_400_000);
}

export function formatDate(isoDate: string | null): string {
  if (!isoDate) return "—";
  return new Date(`${isoDate.slice(0, 10)}T00:00:00Z`).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  });
}

export function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString("en-GB", {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: TZ,
  });
}

/** Human due label relative to today, e.g. "Due today", "3 days overdue". */
export function dueLabel(dueDate: string | null, status: Enums<"task_status"> | null): string {
  if (!dueDate) return "No due date";
  if (status === "done") return `Due ${formatDate(dueDate)}`;
  const diff = daysBetween(todayMV(), dueDate);
  if (diff < 0) return `${-diff} day${diff === -1 ? "" : "s"} overdue`;
  if (diff === 0) return "Due today";
  if (diff === 1) return "Due tomorrow";
  if (diff <= 6) return `Due in ${diff} days`;
  return `Due ${formatDate(dueDate)}`;
}

export const STATUS_LABEL: Record<Enums<"task_status">, string> = {
  not_started: "Not started",
  in_progress: "In progress",
  blocked: "Blocked",
  done: "Done",
  cancelled: "Cancelled",
};

export const PRIORITY_LABEL: Record<Enums<"task_priority">, string> = {
  low: "Low",
  medium: "Medium",
  high: "High",
  urgent: "Urgent",
};

export const ROLE_LABEL: Record<Enums<"user_role">, string> = {
  head: "Head of Retail",
  manager: "Unit manager",
  staff: "Staff",
};
