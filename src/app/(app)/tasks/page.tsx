import Link from "next/link";
import { Plus } from "lucide-react";
import { getPerson } from "@/lib/auth";
import { WhoAreYou } from "@/components/who-are-you";
import { createClient } from "@/lib/supabase/server";
import { addDays, todayMV } from "@/lib/format";
import { PageHeader, EmptyState, ButtonLink, Notice } from "@/components/ui";
import { TaskGroup, type TaskRow } from "@/components/task-row";

type View = "mine" | "assigned";

function groupTasks(tasks: TaskRow[]) {
  const today = todayMV();
  const weekEnd = addDays(today, 7);
  const open = tasks.filter((t) => t.status !== "done" && t.status !== "cancelled");
  return {
    overdue: open.filter((t) => t.is_overdue),
    blocked: open.filter((t) => !t.is_overdue && t.status === "blocked"),
    thisWeek: open.filter((t) => !t.is_overdue && t.status !== "blocked" && (t.due_date ?? "") <= weekEnd),
    later: open.filter((t) => !t.is_overdue && t.status !== "blocked" && (t.due_date ?? "") > weekEnd),
    done: tasks.filter((t) => t.status === "done"),
  };
}

export const metadata = { title: "My tasks · Task Monitor" };

export default async function MyTasksPage({ searchParams }: { searchParams: Promise<{ view?: string; q?: string }> }) {
  const person = await getPerson();
  const sp = await searchParams;
  const supabase = createClient();

  if (!person) return <WhoAreYou purpose="to see your tasks" />;

  const view: View = sp.view === "assigned" ? "assigned" : "mine";
  const q = (sp.q ?? "").trim().slice(0, 80);

  const recentCutoff = new Date(Date.now() - 14 * 86_400_000).toISOString();

  let query = supabase
    .from("task_overview")
    .select("*")
    .neq("status", "cancelled")
    .or(`status.neq.done,completed_at.gte.${recentCutoff}`)
    .order("due_date", { ascending: true })
    .limit(300);

  query =
    view === "mine"
      ? query.eq("assignee_id", person.id)
      : query.eq("assigned_by", person.id).neq("assignee_id", person.id);
  if (q) query = query.ilike("title", `%${q.replace(/[%_,()]/g, " ")}%`);

  const { data, error } = await query;
  const tasks = data ?? [];
  const g = groupTasks(tasks);
  const openCount = tasks.length - g.done.length;
  const showPerson = view === "mine" ? "assigner" : "assignee";
  const firstName = person.full_name?.split(" ")[0];

  return (
    <>
      <PageHeader
        title={view === "mine" ? (firstName ? `${firstName}'s tasks` : "My tasks") : "Assigned by me"}
        subtitle={
          openCount === 0
            ? "Nothing open."
            : `${openCount} open${g.overdue.length ? ` · ${g.overdue.length} overdue` : ""}${g.blocked.length ? ` · ${g.blocked.length} blocked` : ""}`
        }
        action={
          <ButtonLink href="/tasks/new">
            <Plus aria-hidden className="size-4" />
            Assign task
          </ButtonLink>
        }
      />

      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div role="tablist" aria-label="Task view" className="inline-flex rounded-md border border-slate-300 bg-white p-0.5">
          {(
            [
              ["mine", "Assigned to me"],
              ["assigned", "Assigned by me"],
            ] as const
          ).map(([v, label]) => (
            <Link
              key={v}
              role="tab"
              aria-selected={view === v}
              href={v === "mine" ? "/tasks" : "/tasks?view=assigned"}
              className={`rounded px-3 py-1.5 text-sm font-medium ${view === v ? "bg-blue-600 text-white" : "text-slate-700 hover:bg-slate-100"}`}
            >
              {label}
            </Link>
          ))}
        </div>
        <form className="sm:w-72" role="search">
          {view === "assigned" && <input type="hidden" name="view" value="assigned" />}
          <label htmlFor="q" className="sr-only">
            Search tasks
          </label>
          <input
            id="q"
            name="q"
            type="search"
            defaultValue={q}
            placeholder="Search by title…"
            className="block w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-200"
          />
        </form>
      </div>

      {error && <Notice tone="error">Couldn&apos;t load tasks. Refresh to try again.</Notice>}

      {tasks.length === 0 && !error ? (
        <EmptyState
          title={q ? `No tasks match “${q}”` : view === "mine" ? "No tasks assigned to you" : "You haven't assigned any open tasks"}
          body={q ? "Try a different word, or clear the search." : view === "mine" ? "When someone assigns you a task it will show up here." : "Assign a task to someone in your team to start tracking it here."}
        />
      ) : (
        <>
          <TaskGroup title="Overdue" tasks={g.overdue} showPerson={showPerson} tone="danger" />
          <TaskGroup title="Blocked" tasks={g.blocked} showPerson={showPerson} />
          <TaskGroup title="Due in the next 7 days" tasks={g.thisWeek} showPerson={showPerson} />
          <TaskGroup title="Later" tasks={g.later} showPerson={showPerson} />
          <TaskGroup title="Done in the last 14 days" tasks={g.done} showPerson={showPerson} collapsed />
        </>
      )}
    </>
  );
}
