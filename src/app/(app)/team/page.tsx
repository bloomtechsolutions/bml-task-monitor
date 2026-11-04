import Link from "next/link";
import { redirect } from "next/navigation";
import { requirePerson } from "@/lib/auth";
import { isLead, unitScope } from "@/lib/permissions";
import { createClient } from "@/lib/supabase/server";
import { addDays, todayMV } from "@/lib/format";
import { PageHeader, EmptyState, Notice } from "@/components/ui";
import { TaskGroup, type TaskRow } from "@/components/task-row";

type Counts = { open: number; overdue: number; blocked: number; dueWeek: number; done30: number; onTime30: number };
const emptyCounts = (): Counts => ({ open: 0, overdue: 0, blocked: 0, dueWeek: 0, done30: 0, onTime30: 0 });

function tally(tasks: TaskRow[], weekEnd: string): Counts {
  const c = emptyCounts();
  for (const t of tasks) {
    if (t.status === "done") {
      c.done30++;
      if (t.completed_at && t.due_date && t.completed_at.slice(0, 10) <= t.due_date) c.onTime30++;
    } else if (t.status !== "cancelled" && t.status !== "submitted") {
      c.open++;
      if (t.is_overdue) c.overdue++;
      if (t.status === "blocked") c.blocked++;
      if (!t.is_overdue && (t.due_date ?? "") <= weekEnd) c.dueWeek++;
    }
  }
  return c;
}

function Metric({ label, value, tone }: { label: string; value: string | number; tone?: "danger" | "warn" }) {
  const color = tone === "danger" ? "text-red-600" : tone === "warn" ? "text-amber-600" : "text-blue-600";
  return (
    <div className="rounded-xl border border-slate-200 bg-white px-5 py-4 shadow-xs">
      <p className="text-[15px] text-slate-700">{label}</p>
      <p className={`mt-2 text-3xl font-semibold tabular-nums ${color}`}>{value}</p>
    </div>
  );
}

export default async function TeamPage({ searchParams }: { searchParams: Promise<{ unit?: string }> }) {
  const [{ unit: requestedUnit }, me] = await Promise.all([searchParams, requirePerson()]);
  if (!isLead(me)) redirect("/");
  const myUnit = unitScope(me);
  const unitFilter = myUnit ?? requestedUnit;

  const supabase = createClient();
  const since = new Date(Date.now() - 30 * 86_400_000).toISOString();
  const today = todayMV();
  let tq = supabase.from("task_overview").select("*");
  if (myUnit) tq = tq.eq("unit_id", myUnit);
  const [{ data: allUnits }, { data: rows, error }, { data: leave }, { data: settings }] = await Promise.all([
    supabase.from("units").select("id, name, code").eq("is_active", true).order("name"),
    tq
      .neq("status", "cancelled")
      .or(`status.neq.done,completed_at.gte.${since}`)
      .order("due_date")
      .limit(2000),
    supabase.from("leave").select("profile_id, start_date, end_date").lte("start_date", addDays(today, 7)).gte("end_date", today),
    supabase.from("app_settings").select("value").eq("key", "overload_threshold").maybeSingle(),
  ]);
  const units = (allUnits ?? []).filter((u) => !myUnit || u.id === myUnit);
  const overload = Number(settings?.value ?? 8);
  const leaveOf = (id: string) => (leave ?? []).find((l) => l.profile_id === id);

  const weekEnd = addDays(today, 7);
  const visibleUnits = units ?? [];
  const selectedUnit = visibleUnits.find((u) => u.id === unitFilter) ?? null;
  const all = (rows ?? []).filter((t) => !selectedUnit || t.unit_id === selectedUnit.id);
  const totals = tally(all, weekEnd);
  const onTimeRate = totals.done30 ? Math.round((totals.onTime30 / totals.done30) * 100) : null;

  // Per person workload
  const people = new Map<string, { name: string; unit: string; tasks: TaskRow[] }>();
  for (const t of all) {
    if (!t.assignee_id) continue;
    const entry = people.get(t.assignee_id) ?? { name: t.assignee_name ?? "Unknown", unit: t.unit_code ?? "", tasks: [] };
    entry.tasks.push(t);
    people.set(t.assignee_id, entry);
  }
  const workload = [...people.entries()]
    .map(([id, p]) => ({ id, ...p, c: tally(p.tasks, weekEnd) }))
    .sort((a, b) => b.c.overdue - a.c.overdue || b.c.open - a.c.open);

  const open = all.filter((t) => t.status !== "done" && t.status !== "submitted");
  const overdue = open.filter((t) => t.is_overdue).sort((a, b) => (b.days_overdue ?? 0) - (a.days_overdue ?? 0));
  const blocked = open.filter((t) => t.status === "blocked" && !t.is_overdue);
  const unitStats = !selectedUnit
    ? visibleUnits.map((u) => ({ u, c: tally((rows ?? []).filter((t) => t.unit_id === u.id), weekEnd) }))
    : [];

  return (
    <>
      <PageHeader
        title={selectedUnit ? selectedUnit.name : "Retail Banking overview"}
        subtitle="Open work, overdue items and completion over the last 30 days."
      />

      {visibleUnits.length > 0 && !myUnit && (
        <nav aria-label="Filter by unit" className="-mx-4 mb-5 flex gap-2 overflow-x-auto px-4 pb-1">
          {[{ id: "", name: "All units" }, ...visibleUnits].map((u) => {
            const active = (selectedUnit?.id ?? "") === u.id;
            return (
              <Link
                key={u.id || "all"}
                href={u.id ? `/team?unit=${u.id}` : "/team"}
                aria-current={active ? "page" : undefined}
                className={`shrink-0 rounded-full border px-3 py-1.5 text-sm font-medium ${active ? "border-blue-600 bg-blue-600 text-white" : "border-slate-300 bg-white text-slate-700 hover:bg-slate-50"}`}
              >
                {u.name}
              </Link>
            );
          })}
        </nav>
      )}

      {error && <Notice tone="error">Couldn&apos;t load team tasks. Refresh to try again.</Notice>}

      <section aria-label="Summary" className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-4 xl:grid-cols-5">
        <Metric label="Open" value={totals.open} />
        <Metric label="Overdue" value={totals.overdue} tone={totals.overdue ? "danger" : undefined} />
        <Metric label="Blocked" value={totals.blocked} tone={totals.blocked ? "warn" : undefined} />
        <Metric label="Due in 7 days" value={totals.dueWeek} />
        <Metric label="On time (30 days)" value={onTimeRate === null ? "—" : `${onTimeRate}%`} />
      </section>

      {all.length === 0 && !error ? (
        <EmptyState title="No tasks yet" body="Once tasks are assigned in your team, their progress shows up here." />
      ) : (
        <div className="grid gap-6 lg:grid-cols-[1fr_380px]">
          <div className="min-w-0">
            <TaskGroup title="Overdue — needs follow-up" tasks={overdue} showPerson="both" tone="danger" />
            <TaskGroup title="Blocked" tasks={blocked} showPerson="both" />
            {overdue.length === 0 && blocked.length === 0 && (
              <p className="mb-4 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-900">
                Nothing overdue or blocked.
              </p>
            )}
          </div>

          <div className="space-y-6">
            {unitStats.length > 0 && (
              <section aria-labelledby="units-h" className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-xs">
                <h2 id="units-h" className="px-4 py-2.5 text-sm font-semibold text-slate-800">
                  By unit
                </h2>
                <table className="w-full border-t border-slate-100 text-sm">
                  <thead className="text-xs text-slate-500">
                    <tr>
                      <th scope="col" className="px-4 py-2 text-left font-medium">Unit</th>
                      <th scope="col" className="px-2 py-2 text-right font-medium">Open</th>
                      <th scope="col" className="px-4 py-2 text-right font-medium">Overdue</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {unitStats.map(({ u, c }) => (
                      <tr key={u.id}>
                        <td className="px-4 py-2.5">
                          <Link href={`/team?unit=${u.id}`} className="font-medium text-slate-900 hover:underline">
                            {u.name}
                          </Link>
                        </td>
                        <td className="px-2 py-2.5 text-right tabular-nums">{c.open}</td>
                        <td className={`px-4 py-2.5 text-right tabular-nums ${c.overdue ? "font-semibold text-red-700" : "text-slate-500"}`}>{c.overdue}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </section>
            )}

            <section aria-labelledby="people-h" className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-xs">
              <h2 id="people-h" className="px-4 py-2.5 text-sm font-semibold text-slate-800">
                Workload by person
              </h2>
              {workload.length === 0 ? (
                <p className="border-t border-slate-100 px-4 py-3 text-sm text-slate-500">No assigned tasks.</p>
              ) : (
                <table className="w-full border-t border-slate-100 text-sm">
                  <thead className="text-xs text-slate-500">
                    <tr>
                      <th scope="col" className="px-4 py-2 text-left font-medium">Person</th>
                      <th scope="col" className="px-2 py-2 text-right font-medium">Open</th>
                      <th scope="col" className="px-2 py-2 text-right font-medium">Overdue</th>
                      <th scope="col" className="px-4 py-2 text-right font-medium">Done 30d</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {workload.map((p) => (
                      <tr key={p.id}>
                        <td className="px-4 py-2.5">
                          <span className="font-medium text-slate-900">{p.name}</span>
                          {!selectedUnit && <span className="ml-1.5 text-xs text-slate-400">{p.unit}</span>}
                          {leaveOf(p.id) && (
                            <span className="ml-1.5 rounded bg-amber-100 px-1.5 py-0.5 text-[11px] text-amber-900">
                              {leaveOf(p.id)!.start_date <= today ? "On leave" : "Leave soon"}
                            </span>
                          )}
                        </td>
                        <td className={`px-2 py-2.5 text-right tabular-nums ${p.c.open >= overload ? "font-semibold text-orange-700" : ""}`}>
                          {p.c.open}
                          {p.c.open >= overload && <span className="sr-only"> (overloaded)</span>}
                        </td>
                        <td className={`px-2 py-2.5 text-right tabular-nums ${p.c.overdue ? "font-semibold text-red-700" : "text-slate-500"}`}>{p.c.overdue}</td>
                        <td className="px-4 py-2.5 text-right tabular-nums text-slate-600">{p.c.done30}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </section>
          </div>
        </div>
      )}
    </>
  );
}
