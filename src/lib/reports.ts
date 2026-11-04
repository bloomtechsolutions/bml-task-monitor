import "server-only";
import { createClient } from "@/lib/supabase/server";
import type { Profile } from "@/lib/auth";
import { unitScope } from "@/lib/permissions";
import { addDays, todayMV } from "@/lib/format";
import type { Tables } from "@/lib/database.types";

export type Row = Tables<"task_overview">;
export type Period = "month" | "last_month" | "90d" | "year" | "custom";

const DATE = /^\d{4}-\d{2}-\d{2}$/;

export function resolvePeriod(p: string | undefined, from?: string, to?: string): { period: Period; from: string; to: string } {
  const today = todayMV();
  const [y, m] = [Number(today.slice(0, 4)), Number(today.slice(5, 7))];
  const ym = (yy: number, mm: number) => new Date(Date.UTC(yy, mm - 1, 1)).toISOString().slice(0, 10);
  switch (p) {
    case "last_month":
      return { period: "last_month", from: ym(y, m - 1), to: addDays(ym(y, m), -1) };
    case "90d":
      return { period: "90d", from: addDays(today, -89), to: today };
    case "year":
      return { period: "year", from: `${y}-01-01`, to: today };
    case "custom":
      if (from && to && DATE.test(from) && DATE.test(to) && from <= to) return { period: "custom", from, to };
      break;
  }
  return { period: "month", from: ym(y, m), to: today };
}

/** Tasks relevant to [from, to] within the viewer's scope: created by `to` and not finished before `from`. */
export async function loadReportRows(me: Profile, from: string, to: string, unit: string | null): Promise<Row[]> {
  const scope = unitScope(me);
  let q = createClient()
    .from("task_overview")
    .select("*")
    .neq("status", "cancelled")
    .lte("created_at", `${to}T23:59:59+05:00`)
    .or(`completed_at.is.null,completed_at.gte.${from}T00:00:00+05:00`)
    .limit(5000);
  const u = scope ?? unit;
  if (u) q = q.eq("unit_id", u);
  const { data } = await q;
  return data ?? [];
}

const mvDate = (iso: string | null) => (iso ? new Date(new Date(iso).getTime() + 5 * 3600_000).toISOString().slice(0, 10) : null);

export function finishedOn(t: Row): string | null {
  return t.status === "done" ? mvDate(t.submitted_at ?? t.completed_at) : null;
}

export type Stats = { created: number; completed: number; onTime: number; lateDays: number; late: number; overdueNow: number; open: number };

export function stats(rows: Row[], from: string, to: string): Stats {
  const s: Stats = { created: 0, completed: 0, onTime: 0, lateDays: 0, late: 0, overdueNow: 0, open: 0 };
  for (const t of rows) {
    const created = mvDate(t.created_at);
    if (created && created >= from && created <= to) s.created++;
    const done = finishedOn(t);
    if (done && done >= from && done <= to) {
      s.completed++;
      if (t.due_date && done <= t.due_date) s.onTime++;
      else if (t.due_date) {
        s.late++;
        s.lateDays += Math.round((Date.parse(done) - Date.parse(t.due_date)) / 86_400_000);
      }
    }
    if (t.status !== "done") {
      s.open++;
      if (t.is_overdue) s.overdueNow++;
    }
  }
  return s;
}

export const pct = (a: number, b: number) => (b ? `${Math.round((a / b) * 100)}%` : "—");
