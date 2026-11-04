import Link from "next/link";
import { redirect } from "next/navigation";
import { requirePerson } from "@/lib/auth";
import { isLead, unitScope } from "@/lib/permissions";
import { createClient } from "@/lib/supabase/server";
import { addDays, todayMV } from "@/lib/format";
import { PageHeader, EmptyState, Notice } from "@/components/ui";
import { type TaskRow } from "@/components/task-row";
import { PendingWork, pendingCounts, type PendingGroup } from "@/components/pending-work";

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

export default async function TeamPage({ searchParams }: { searchParams: Promise<{ unit?: string; group?: string }> }) {
  const [{ unit: requestedUnit, group: groupParam }, me] = await Promise.all([searchParams, requirePerson()]);
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
    .sort((a, b) => b.c.overdue - a.c.overdue || b.c.open - a.c.open || a.name.localeCompare(b.name));

  const unitStats = !selectedUnit
    ? visibleUnits
        .map((u) => {
          const ts = (rows ?? []).filter((t) => t.unit_id === u.id);
          return { u, p: pendingCounts(ts), c: tally(ts, weekEnd) };
        })
        .filter((x) => x.p.pending + x.c.done30 > 0)
    : [];
  const pc = pendingCounts(all);
  const group: PendingGroup = groupParam === "status" || (groupParam === "unit" && !selectedUnit) ? groupParam : "person";
  const hrefFor = (g: PendingGroup) => `/team?${new URLSearchParams({ ...(selectedUnit && !myUnit ? { unit: selectedUnit.id } : {}), group: g })}#pending-h`;
  const th = "px-2 py-2 text-right font-medium";
  const td = (n: number, tone = "") => <td className={`px-2 py-2.5 text-right tabular-nums ${n ? tone : "text-slate-400"}`}>{n}</td>;

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

      <section aria-label="Summary" className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-4 xl:grid-cols-6">
        <Metric label="Pending" value={pc.pending} />
        <Metric label="Overdue" value={pc.overdue} tone={pc.overdue ? "danger" : undefined} />
        <Metric label="Blocked" value={pc.blocked} tone={pc.blocked ? "warn" : undefined} />
        <Metric label="Awaiting sign-off" value={pc.awaiting} />
        <Metric label="Due in 7 days" value={pc.dueWeek} />
        <Metric label="On time (30 days)" value={onTimeRate === null ? "—" : `${onTimeRate}%`} />
      </section>

      {all.length === 0 && !error ? (
        <EmptyState title="No tasks yet" body="Once tasks are assigned in your team, their progress shows up here." />
      ) : (
        <div className="space-y-6">
          {unitStats.length > 0 && (
            <section aria-labelledby="units-h" className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-xs">
              <h2 id="units-h" className="px-4 py-3 font-semibold text-slate-900">
                By unit
              </h2>
              <div className="overflow-x-auto">
                <table className="w-full min-w-[640px] border-t border-slate-100 text-sm">
                  <thead className="text-xs text-slate-500">
                    <tr>
                      <th scope="col" className="px-4 py-2 text-left font-medium">Unit</th>
                      <th scope="col" className={th}>Pending</th>
                      <th scope="col" className={th}>Not started</th>
                      <th scope="col" className={th}>In progress</th>
                      <th scope="col" className={th}>Blocked</th>
                      <th scope="col" className={th}>Awaiting sign-off</th>
                      <th scope="col" className={th}>Overdue</th>
                      <th scope="col" className="px-4 py-2 text-right font-medium">Done 30d</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {unitStats.map(({ u, p, c }) => (
                      <tr key={u.id}>
                        <td className="px-4 py-2.5">
                          <Link href={`/team?unit=${u.id}`} className="font-medium text-slate-900 hover:underline">
                            {u.name}
                          </Link>
                        </td>
                        {td(p.pending, "font-semibold text-slate-900")}
                        {td(p.notStarted)}
                        {td(p.inProgress)}
                        {td(p.blocked, "font-semibold text-amber-700")}
                        {td(p.awaiting, "text-violet-700")}
                        {td(p.overdue, "font-semibold text-red-700")}
                        <td className="px-4 py-2.5 text-right tabular-nums text-slate-600">{c.done30}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          )}

          <section aria-labelledby="people-h" className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-xs">
            <div className="flex flex-wrap items-baseline justify-between gap-2 px-4 py-3">
              <h2 id="people-h" className="font-semibold text-slate-900">
                Workload by person
              </h2>
              <p className="text-xs text-slate-500">Orange = {overload}+ pending (overloaded). Change in Settings.</p>
            </div>
            {workload.length === 0 ? (
              <p className="border-t border-slate-100 px-4 py-3 text-sm text-slate-500">No assigned tasks.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[720px] border-t border-slate-100 text-sm">
                  <thead className="text-xs text-slate-500">
                    <tr>
                      <th scope="col" className="px-4 py-2 text-left font-medium">Person</th>
                      <th scope="col" className={th}>Pending</th>
                      <th scope="col" className={th}>Not started</th>
                      <th scope="col" className={th}>In progress</th>
                      <th scope="col" className={th}>Blocked</th>
                      <th scope="col" className={th}>Awaiting sign-off</th>
                      <th scope="col" className={th}>Overdue</th>
                      <th scope="col" className="px-4 py-2 text-right font-medium">Done 30d</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {workload.map((p) => {
                      const q = pendingCounts(p.tasks);
                      return (
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
                          <td className={`px-2 py-2.5 text-right tabular-nums ${q.pending >= overload ? "font-semibold text-orange-700" : "font-semibold text-slate-900"}`}>
                            {q.pending}
                            {q.pending >= overload && <span className="sr-only"> (overloaded)</span>}
                          </td>
                          {td(q.notStarted)}
                          {td(q.inProgress)}
                          {td(q.blocked, "font-semibold text-amber-700")}
                          {td(q.awaiting, "text-violet-700")}
                          {td(q.overdue, "font-semibold text-red-700")}
                          <td className="px-4 py-2.5 text-right tabular-nums text-slate-600">{p.c.done30}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </section>

          <PendingWork tasks={all} group={group} hrefFor={hrefFor} allowUnit={!selectedUnit} meId={me.id} />
        </div>
      )}
    </>
  );
}
