import Link from "next/link";
import { ChevronLeft, ChevronRight, Plane } from "lucide-react";
import { requirePerson } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { isLead, scopedOr, unitScope } from "@/lib/permissions";
import { todayMV } from "@/lib/format";
import { PageHeader } from "@/components/ui";
import type { Tables } from "@/lib/database.types";

export const metadata = { title: "Calendar" };

type Task = Tables<"task_overview">;
const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

function iso(y: number, m: number, d: number) {
  return new Date(Date.UTC(y, m, d)).toISOString().slice(0, 10);
}

const DOT: Record<string, string> = {
  not_started: "bg-slate-400", in_progress: "bg-sky-500", blocked: "bg-amber-500", submitted: "bg-violet-500", done: "bg-emerald-500",
};

export default async function CalendarPage({ searchParams }: { searchParams: Promise<{ m?: string; view?: string }> }) {
  const [me, sp] = await Promise.all([requirePerson(), searchParams]);
  const today = todayMV();
  const [y, m] = /^\d{4}-\d{2}$/.test(sp.m ?? "") ? sp.m!.split("-").map(Number) : [Number(today.slice(0, 4)), Number(today.slice(5, 7))];
  const month = m - 1;
  const first = iso(y, month, 1);
  const last = iso(y, month + 1, 0);
  const view = sp.view === "team" && isLead(me) ? "team" : "mine";
  const qs = (mm: string) => `/calendar?m=${mm}${view === "team" ? "&view=team" : ""}`;
  const prev = iso(y, month - 1, 1).slice(0, 7);
  const next = iso(y, month + 1, 1).slice(0, 7);

  const supabase = createClient();
  let q = supabase.from("task_overview").select("*").gte("due_date", first).lte("due_date", last).neq("status", "cancelled").order("priority", { ascending: false }).limit(1000);
  q = view === "mine" ? q.eq("assignee_id", me.id) : (() => { const s = scopedOr(me); return s ? q.or(s) : q; })();
  const leaveQ = supabase.from("leave").select("profile_id, start_date, end_date, kind").lte("start_date", last).gte("end_date", first);
  const [{ data: tasks }, { data: leave }, { data: people }] = await Promise.all([
    q,
    view === "team" ? leaveQ : leaveQ.eq("profile_id", me.id),
    supabase.from("profiles").select("id, full_name, unit_id"),
  ]);
  const unit = unitScope(me);
  const names = new Map((people ?? []).map((p) => [p.id, p]));
  const leaveRows = (leave ?? []).filter((l) => view === "mine" || !unit || names.get(l.profile_id)?.unit_id === unit);

  const byDay = new Map<string, Task[]>();
  for (const t of tasks ?? []) if (t.due_date) byDay.set(t.due_date, [...(byDay.get(t.due_date) ?? []), t]);
  const leaveOn = (d: string) => leaveRows.filter((l) => l.start_date <= d && l.end_date >= d);

  const startDow = new Date(`${first}T00:00:00Z`).getUTCDay();
  const daysInMonth = Number(last.slice(8, 10));
  const cells: (string | null)[] = [...Array(startDow).fill(null), ...Array.from({ length: daysInMonth }, (_, i) => iso(y, month, i + 1))];
  while (cells.length % 7) cells.push(null);
  const label = new Date(`${first}T00:00:00Z`).toLocaleDateString("en-GB", { month: "long", year: "numeric", timeZone: "UTC" });

  return (
    <>
      <PageHeader
        title="Calendar"
        subtitle="Tasks by due date. Leave is shown so you can plan around it."
        action={
          <div className="flex flex-wrap items-center gap-2">
            {isLead(me) && (
              <div className="inline-flex rounded-lg border border-slate-300 bg-white p-0.5">
                {(
                  [
                    ["mine", "Mine"],
                    ["team", "Team"],
                  ] as const
                ).map(([v, l]) => (
                  <Link
                    key={v}
                    href={`/calendar?m=${first.slice(0, 7)}${v === "team" ? "&view=team" : ""}`}
                    aria-current={view === v ? "page" : undefined}
                    className={`rounded-md px-3 py-1.5 text-sm font-medium ${view === v ? "bg-blue-600 text-white" : "text-slate-700 hover:bg-slate-100"}`}
                  >
                    {l}
                  </Link>
                ))}
              </div>
            )}
            <div className="inline-flex items-center rounded-lg border border-slate-300 bg-white">
              <Link href={qs(prev)} aria-label="Previous month" className="grid size-9 place-items-center text-slate-600 hover:text-slate-900">
                <ChevronLeft className="size-4" />
              </Link>
              <span className="min-w-36 text-center text-sm font-medium text-slate-900">{label}</span>
              <Link href={qs(next)} aria-label="Next month" className="grid size-9 place-items-center text-slate-600 hover:text-slate-900">
                <ChevronRight className="size-4" />
              </Link>
            </div>
            <Link href={qs(today.slice(0, 7))} className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50">
              Today
            </Link>
          </div>
        }
      />

      {/* Month grid (tablet and up) */}
      <div className="hidden overflow-hidden rounded-xl border border-slate-200 bg-white shadow-xs md:block">
        <div className="grid grid-cols-7 border-b border-slate-200 bg-slate-50 text-xs font-medium text-slate-500">
          {DAYS.map((d) => (
            <div key={d} className={`px-2 py-2 ${d === "Fri" || d === "Sat" ? "text-slate-400" : ""}`}>
              {d}
            </div>
          ))}
        </div>
        <div className="grid grid-cols-7">
          {cells.map((d, i) => {
            const items = d ? byDay.get(d) ?? [] : [];
            const off = d ? leaveOn(d) : [];
            const weekend = i % 7 === 5 || i % 7 === 6;
            return (
              <div key={i} className={`min-h-28 border-r border-b border-slate-100 p-1.5 [&:nth-child(7n)]:border-r-0 ${!d ? "bg-slate-50/60" : weekend ? "bg-slate-50/40" : ""}`}>
                {d && (
                  <>
                    <p className={`mb-1 text-right text-xs tabular-nums ${d === today ? "font-semibold text-white" : "text-slate-500"}`}>
                      <span className={d === today ? "rounded-full bg-blue-600 px-1.5 py-0.5" : ""}>{Number(d.slice(8))}</span>
                    </p>
                    <ul className="space-y-0.5">
                      {items.slice(0, 3).map((t) => (
                        <li key={t.id}>
                          <Link
                            href={`/tasks/${t.id}`}
                            title={`${t.title} · ${t.assignee_name}`}
                            className={`flex items-center gap-1 truncate rounded px-1 py-0.5 text-xs hover:bg-slate-100 ${t.is_overdue ? "text-red-700" : t.status === "done" ? "text-slate-400 line-through" : "text-slate-800"}`}
                          >
                            <span aria-hidden className={`size-1.5 shrink-0 rounded-full ${DOT[t.status ?? "not_started"]}`} />
                            <span className="truncate">{t.title}</span>
                          </Link>
                        </li>
                      ))}
                      {items.length > 3 && <li className="px-1 text-xs text-slate-500">+{items.length - 3} more</li>}
                      {off.slice(0, 2).map((l, j) => (
                        <li key={`l${j}`} className="flex items-center gap-1 truncate rounded bg-amber-50 px-1 py-0.5 text-xs text-amber-900">
                          <Plane aria-hidden className="size-3 shrink-0" />
                          <span className="truncate">{names.get(l.profile_id)?.full_name?.split(" ")[0]} · {l.kind}</span>
                        </li>
                      ))}
                    </ul>
                  </>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Agenda (phones) */}
      <ol className="space-y-3 md:hidden">
        {cells
          .filter((d): d is string => !!d && ((byDay.get(d)?.length ?? 0) > 0 || leaveOn(d).length > 0))
          .map((d) => (
            <li key={d} className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-xs">
              <p className={`px-4 py-2 text-sm font-semibold ${d === today ? "bg-blue-50 text-blue-800" : "text-slate-800"}`}>
                {new Date(`${d}T00:00:00Z`).toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" })}
              </p>
              <ul className="divide-y divide-slate-100 border-t border-slate-100">
                {(byDay.get(d) ?? []).map((t) => (
                  <li key={t.id}>
                    <Link href={`/tasks/${t.id}`} className="flex items-center gap-2 px-4 py-2.5 text-[15px]">
                      <span aria-hidden className={`size-2 shrink-0 rounded-full ${DOT[t.status ?? "not_started"]}`} />
                      <span className={`min-w-0 flex-1 truncate ${t.is_overdue ? "text-red-700" : "text-slate-900"}`}>{t.title}</span>
                      {view === "team" && <span className="shrink-0 text-xs text-slate-500">{t.assignee_name?.split(" ")[0]}</span>}
                    </Link>
                  </li>
                ))}
                {leaveOn(d).map((l, j) => (
                  <li key={`l${j}`} className="flex items-center gap-2 px-4 py-2 text-sm text-amber-900">
                    <Plane aria-hidden className="size-4" /> {names.get(l.profile_id)?.full_name} · {l.kind} leave
                  </li>
                ))}
              </ul>
            </li>
          ))}
        {(tasks ?? []).length === 0 && leaveRows.length === 0 && <li className="rounded-xl border border-dashed border-slate-300 px-4 py-8 text-center text-sm text-slate-600">Nothing due this month.</li>}
      </ol>
    </>
  );
}
