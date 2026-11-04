import Link from "next/link";
import { ChevronRight, GitBranch } from "lucide-react";
import type { Tables } from "@/lib/database.types";
import { dueLabel } from "@/lib/format";
import { StatusBadge, PriorityTag, DueText, ProgressBar } from "@/components/ui";

export type TaskRow = Tables<"task_overview">;

/** Compact list row. Show person = the other party (assignee in "assigned by me", assigner in "my tasks"). */
export function TaskListItem({ task, showPerson }: { task: TaskRow; showPerson?: "assignee" | "assigner" | "both" }) {
  if (!task.id || !task.status || !task.priority) return null;
  const overdue = task.is_overdue === true;
  const person =
    showPerson === "assignee"
      ? task.assignee_name
      : showPerson === "assigner"
        ? task.assigned_by_name && `From ${task.assigned_by_name}`
        : showPerson === "both"
          ? task.assignee_name
          : null;

  return (
    <li>
      <Link
        href={`/tasks/${task.id}`}
        className={`group flex items-center gap-3 px-4 py-3 hover:bg-slate-50 ${overdue ? "border-l-[3px] border-l-red-600" : "border-l-[3px] border-l-transparent"}`}
      >
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <p className="truncate font-medium text-slate-900">{task.title}</p>
            {(task.subtask_count ?? 0) > 0 && (
              <span className="inline-flex items-center gap-0.5 text-xs text-slate-500">
                <GitBranch aria-hidden className="size-3" />
                {task.subtask_count} sub-tasks
              </span>
            )}
          </div>
          <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1">
            <StatusBadge status={task.status} />
            <DueText label={dueLabel(task.due_date, task.status)} overdue={overdue} />
            <PriorityTag priority={task.priority} />
            {person && <span className="text-xs text-slate-600">{person}</span>}
            {task.unit_code && showPerson === "both" && <span className="text-xs text-slate-400">{task.unit_code}</span>}
          </div>
        </div>
        <div className="hidden w-32 shrink-0 sm:block">
          <ProgressBar value={task.progress ?? 0} />
        </div>
        <ChevronRight aria-hidden className="size-4 shrink-0 text-slate-400 group-hover:text-slate-700" />
      </Link>
    </li>
  );
}

export function TaskGroup({
  title,
  tasks,
  showPerson,
  tone = "default",
  collapsed = false,
}: {
  title: string;
  tasks: TaskRow[];
  showPerson?: "assignee" | "assigner" | "both";
  tone?: "default" | "danger";
  collapsed?: boolean;
}) {
  if (tasks.length === 0) return null;
  return (
    <details open={!collapsed} className="group/section mb-4 overflow-hidden rounded-lg border border-slate-200 bg-white">
      <summary className="flex cursor-pointer list-none items-center justify-between px-4 py-2.5 select-none [&::-webkit-details-marker]:hidden">
        <h2 className={`text-sm font-semibold ${tone === "danger" ? "text-red-800" : "text-slate-800"}`}>
          {title} <span className="ml-1 font-normal tabular-nums text-slate-500">{tasks.length}</span>
        </h2>
        <ChevronRight aria-hidden className="size-4 text-slate-400 transition-transform group-open/section:rotate-90" />
      </summary>
      <ul className="divide-y divide-slate-100 border-t border-slate-100">
        {tasks.map((t) => (
          <TaskListItem key={t.id} task={t} showPerson={showPerson} />
        ))}
      </ul>
    </details>
  );
}
