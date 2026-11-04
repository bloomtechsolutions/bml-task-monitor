import Link from "next/link";
import { TaskGroup, type TaskRow } from "@/components/task-row";
import { addDays, todayMV } from "@/lib/format";

export type PendingGroup = "status" | "person" | "unit";
const PENDING = new Set(["not_started", "in_progress", "blocked", "submitted"]);

export const isPending = (t: TaskRow) => PENDING.has(t.status ?? "");

/** Counts for pending (not done / cancelled) work. */
export function pendingCounts(tasks: TaskRow[]) {
  const weekEnd = addDays(todayMV(), 7);
  const p = tasks.filter(isPending);
  return {
    pending: p.length,
    overdue: p.filter((t) => t.is_overdue).length,
    blocked: p.filter((t) => t.status === "blocked").length,
    awaiting: p.filter((t) => t.status === "submitted").length,
    dueWeek: p.filter((t) => !t.is_overdue && t.status !== "submitted" && (t.due_date ?? "") <= weekEnd).length,
    inProgress: p.filter((t) => t.status === "in_progress").length,
    notStarted: p.filter((t) => t.status === "not_started").length,
  };
}

const byUrgency = (a: TaskRow, b: TaskRow) =>
  Number(b.is_overdue) - Number(a.is_overdue) || (b.days_overdue ?? 0) - (a.days_overdue ?? 0) || (a.due_date ?? "").localeCompare(b.due_date ?? "");

export function PendingWork({
  tasks,
  group,
  hrefFor,
  allowUnit,
  meId,
}: {
  tasks: TaskRow[];
  group: PendingGroup;
  hrefFor: (g: PendingGroup) => string;
  allowUnit: boolean;
  meId?: string;
}) {
  const pending = tasks.filter(isPending).sort(byUrgency);
  const tabs: [PendingGroup, string][] = [
    ["status", "By status"],
    ["person", "By person"],
    ...(allowUnit ? ([["unit", "By unit"]] as [PendingGroup, string][]) : []),
  ];

  let groups: { key: string; title: string; tasks: TaskRow[]; tone?: "danger" | "accent" }[] = [];
  if (group === "status") {
    groups = [
      { key: "overdue", title: "Overdue", tasks: pending.filter((t) => t.is_overdue), tone: "danger" },
      { key: "blocked", title: "Blocked", tasks: pending.filter((t) => !t.is_overdue && t.status === "blocked") },
      { key: "submitted", title: "Awaiting sign-off", tasks: pending.filter((t) => t.status === "submitted"), tone: "accent" },
      { key: "in_progress", title: "In progress", tasks: pending.filter((t) => !t.is_overdue && t.status === "in_progress") },
      { key: "not_started", title: "Not started", tasks: pending.filter((t) => !t.is_overdue && t.status === "not_started") },
    ];
  } else {
    const map = new Map<string, { title: string; tasks: TaskRow[] }>();
    for (const t of pending) {
      const key = (group === "person" ? t.assignee_id : t.unit_id) ?? "none";
      const title = group === "person" ? (t.assignee_id === meId ? `${t.assignee_name} (me)` : t.assignee_name ?? "Unassigned") : t.unit_name ?? "No unit";
      const g = map.get(key) ?? { title, tasks: [] };
      g.tasks.push(t);
      map.set(key, g);
    }
    groups = [...map.entries()]
      .map(([key, g]) => {
        const overdue = g.tasks.filter((t) => t.is_overdue).length;
        const blocked = g.tasks.filter((t) => t.status === "blocked").length;
        const extra = [overdue && `${overdue} overdue`, blocked && `${blocked} blocked`].filter(Boolean).join(" · ");
        return { key, title: extra ? `${g.title} — ${extra}` : g.title, tasks: g.tasks, tone: overdue ? ("danger" as const) : undefined, overdue };
      })
      .sort((a, b) => b.overdue - a.overdue || b.tasks.length - a.tasks.length || a.title.localeCompare(b.title));
  }
  const visible = groups.filter((g) => g.tasks.length > 0);

  return (
    <section aria-labelledby="pending-h">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <h2 id="pending-h" className="text-[17px] font-semibold text-slate-900">
          All pending work <span className="ml-1 font-normal tabular-nums text-slate-500">{pending.length}</span>
        </h2>
        <nav aria-label="Group pending work" className="inline-flex rounded-lg border border-slate-300 bg-white p-0.5">
          {tabs.map(([g, label]) => (
            <Link
              key={g}
              href={hrefFor(g)}
              scroll={false}
              aria-current={group === g ? "true" : undefined}
              className={`rounded-md px-3 py-1.5 text-sm font-medium ${group === g ? "bg-blue-600 text-white" : "text-slate-700 hover:bg-slate-100"}`}
            >
              {label}
            </Link>
          ))}
        </nav>
      </div>
      {visible.length === 0 ? (
        <p className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-900">No pending work. Everything is done.</p>
      ) : (
        visible.map((g, i) => (
          <TaskGroup
            key={g.key}
            title={g.title}
            tasks={g.tasks}
            showPerson={group === "person" ? "assigner" : "both"}
            tone={g.tone}
            collapsed={group !== "status" && i >= 4}
          />
        ))
      )}
    </section>
  );
}
