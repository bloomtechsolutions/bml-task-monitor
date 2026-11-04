import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, Plus, MessageSquare, History } from "lucide-react";
import { getPerson } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { dueLabel, formatDate, formatDateTime, PRIORITY_LABEL, STATUS_LABEL } from "@/lib/format";
import { TASK_PRIORITIES } from "@/lib/database.types";
import { addComment, manageTask } from "@/app/actions";
import { StatusBadge, PriorityTag, DueText, ProgressBar, Notice, inputCls, labelCls } from "@/components/ui";
import { SubmitButton } from "@/components/submit-button";
import { TaskListItem } from "@/components/task-row";
import { ProgressForm } from "./progress-form";

const SAVED: Record<string, string> = {
  created: "Task assigned.",
  update: "Update saved.",
  comment: "Comment added.",
  details: "Task details updated.",
  cancelled: "Task cancelled.",
  reopened: "Task reopened.",
  subtask: "Sub-task added.",
};

type TimelineItem =
  | { kind: "update"; id: string; at: string; author: string; text: string; note: string | null }
  | { kind: "comment"; id: string; at: string; author: string; body: string };

export default async function TaskPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ saved?: string; error?: string }>;
}) {
  const [{ id }, sp, person] = await Promise.all([params, searchParams, getPerson()]);
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const supabase = createClient();

  const [{ data: task }, { data: updates }, { data: comments }, { data: subtasks }] = await Promise.all([
    supabase.from("task_overview").select("*").eq("id", id).maybeSingle(),
    supabase
      .from("task_updates")
      .select("id, created_at, note, old_status, new_status, old_progress, new_progress, old_due_date, new_due_date, author:profiles!task_updates_author_id_fkey(full_name)")
      .eq("task_id", id)
      .order("created_at", { ascending: false })
      .limit(100),
    supabase
      .from("task_comments")
      .select("id, created_at, body, author:profiles!task_comments_author_id_fkey(full_name)")
      .eq("task_id", id)
      .order("created_at", { ascending: false })
      .limit(100),
    supabase.from("task_overview").select("*").eq("parent_task_id", id).order("due_date"),
  ]);

  // RLS returns nothing when the viewer may not see the task.
  if (!task || !task.id || !task.status || !task.priority) notFound();

  const isAssignee = person !== null && task.assignee_id === person.id;
  const canManage = true; // no login: everyone can manage
  const canUpdate = true;
  const closed = task.status === "cancelled";

  const timeline: TimelineItem[] = [
    ...(updates ?? []).map((u): TimelineItem => {
      const parts: string[] = [];
      if (u.new_status && u.new_status !== u.old_status) parts.push(`set status to ${STATUS_LABEL[u.new_status]}`);
      if (u.new_progress !== null && u.new_progress !== u.old_progress && u.new_status !== "done") parts.push(`moved progress to ${u.new_progress}%`);
      if (u.new_due_date && u.new_due_date !== u.old_due_date) parts.push(`changed due date from ${formatDate(u.old_due_date)} to ${formatDate(u.new_due_date)}`);
      return {
        kind: "update",
        id: u.id,
        at: u.created_at,
        author: u.author?.full_name ?? "Someone",
        text: parts.length ? parts.join(", ") : "posted an update",
        note: u.note,
      };
    }),
    ...(comments ?? []).map(
      (c): TimelineItem => ({ kind: "comment", id: c.id, at: c.created_at, author: c.author?.full_name ?? "Someone", body: c.body }),
    ),
  ].sort((a, b) => b.at.localeCompare(a.at));

  // Everyone on the team list can be assigned.
  let reassignOptions: { id: string; name: string }[] = [];
  if (canManage && !closed) {
    const { data } = await supabase.from("profiles").select("id, full_name").eq("is_active", true).order("full_name");
    reassignOptions = (data ?? []).map((p) => ({ id: p.id, name: p.full_name ?? "Unnamed" }));
  }

  return (
    <div className="mx-auto max-w-5xl">
      <Link
        href={task.parent_task_id ? `/tasks/${task.parent_task_id}` : isAssignee ? "/" : "/?view=assigned"}
        className="mb-3 inline-flex items-center gap-1 text-sm text-slate-600 hover:text-slate-900"
      >
        <ArrowLeft aria-hidden className="size-4" /> {task.parent_task_id ? "Parent task" : "Back to tasks"}
      </Link>

      {sp.saved && SAVED[sp.saved] && <Notice tone="success">{SAVED[sp.saved]}</Notice>}
      {sp.error && <Notice tone="error">{sp.error}</Notice>}

      <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
        <div className="min-w-0 space-y-6">
          {/* Summary */}
          <section className="rounded-lg border border-slate-200 bg-white p-4 sm:p-5">
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
              <StatusBadge status={task.status} />
              <DueText label={dueLabel(task.due_date, task.status)} overdue={task.is_overdue === true} />
              <PriorityTag priority={task.priority} />
            </div>
            <h1 className="mt-3 text-xl font-semibold tracking-tight text-slate-900 sm:text-2xl">{task.title}</h1>
            {task.description && <p className="mt-2 whitespace-pre-wrap text-[15px] leading-relaxed text-slate-700">{task.description}</p>}
            <div className="mt-4 max-w-sm">
              <ProgressBar value={task.progress ?? 0} />
            </div>
          </section>

          {/* Primary action: progress update */}
          {canUpdate && !closed && (
            <section aria-labelledby="update-h" className="rounded-lg border border-slate-200 bg-white p-4 sm:p-5">
              <h2 id="update-h" className="mb-3 font-semibold text-slate-900">
                Post a progress update
              </h2>
              <ProgressForm taskId={task.id} status={task.status} progress={task.progress ?? 0} />
            </section>
          )}

          {/* Sub-tasks */}
          {((subtasks?.length ?? 0) > 0 || canManage) && !closed && (
            <section aria-labelledby="sub-h" className="overflow-hidden rounded-lg border border-slate-200 bg-white">
              <div className="flex items-center justify-between px-4 py-3">
                <h2 id="sub-h" className="font-semibold text-slate-900">
                  Sub-tasks{" "}
                  <span className="font-normal tabular-nums text-slate-500">
                    {(subtasks ?? []).filter((s) => s.status === "done").length}/{subtasks?.length ?? 0} done
                  </span>
                </h2>
                {canManage && (
                  <Link href={`/tasks/new?parent=${task.id}`} className="inline-flex items-center gap-1 rounded-md px-2 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-100">
                    <Plus aria-hidden className="size-4" /> Add sub-task
                  </Link>
                )}
              </div>
              {(subtasks?.length ?? 0) > 0 && (
                <ul className="divide-y divide-slate-100 border-t border-slate-100">
                  {subtasks!.map((s) => (
                    <TaskListItem key={s.id} task={s} showPerson="assignee" />
                  ))}
                </ul>
              )}
            </section>
          )}

          {/* Activity */}
          <section aria-labelledby="activity-h" className="rounded-lg border border-slate-200 bg-white p-4 sm:p-5">
            <h2 id="activity-h" className="mb-3 font-semibold text-slate-900">
              Activity
            </h2>
            <form action={addComment} className="mb-5 space-y-2">
              <input type="hidden" name="task_id" value={task.id} />
              <label htmlFor="body" className="sr-only">
                Add a comment
              </label>
              <textarea id="body" name="body" rows={2} maxLength={4000} required className={inputCls} placeholder="Ask a question or leave a note for the team…" />
              <div className="flex justify-end">
                <SubmitButton variant="secondary" pendingText="Posting…">
                  Post comment
                </SubmitButton>
              </div>
            </form>

            {timeline.length === 0 ? (
              <p className="text-sm text-slate-500">No activity yet.</p>
            ) : (
              <ol className="space-y-4">
                {timeline.map((item) => (
                  <li key={`${item.kind}-${item.id}`} className="flex gap-3">
                    <span className="mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-full bg-slate-100 text-slate-600">
                      {item.kind === "comment" ? <MessageSquare aria-hidden className="size-3.5" /> : <History aria-hidden className="size-3.5" />}
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm text-slate-800">
                        <strong className="font-medium">{item.author}</strong>{" "}
                        {item.kind === "update" ? <span className="text-slate-600">{item.text}</span> : <span className="text-slate-500">commented</span>}
                        <span className="ml-2 text-xs text-slate-400">{formatDateTime(item.at)}</span>
                      </p>
                      {item.kind === "comment" && <p className="mt-1 whitespace-pre-wrap text-[15px] text-slate-800">{item.body}</p>}
                      {item.kind === "update" && item.note && (
                        <p className="mt-1 whitespace-pre-wrap rounded-md bg-slate-50 px-3 py-2 text-[15px] text-slate-800">{item.note}</p>
                      )}
                    </div>
                  </li>
                ))}
              </ol>
            )}
          </section>
        </div>

        {/* Side panel */}
        <aside className="space-y-6">
          <section className="rounded-lg border border-slate-200 bg-white p-4">
            <dl className="space-y-3 text-sm">
              {(
                [
                  ["Assigned to", task.assignee_name],
                  ["Assigned by", task.assigned_by_name],
                  ["Unit", task.unit_name],
                  ["Due date", formatDate(task.due_date)],
                  ["Priority", PRIORITY_LABEL[task.priority]],
                  ["Created", task.created_at ? formatDateTime(task.created_at) : "—"],
                  ...(task.completed_at ? [["Completed", formatDateTime(task.completed_at)] as const] : []),
                ] as const
              ).map(([k, v]) => (
                <div key={k} className="flex justify-between gap-3">
                  <dt className="text-slate-500">{k}</dt>
                  <dd className="text-right font-medium text-slate-900">{v ?? "—"}</dd>
                </div>
              ))}
            </dl>
          </section>

          {canManage && (
            <section aria-labelledby="manage-h" className="rounded-lg border border-slate-200 bg-white p-4">
              <h2 id="manage-h" className="mb-3 text-sm font-semibold text-slate-900">
                Manage task
              </h2>
              {closed ? (
                <form action={manageTask}>
                  <input type="hidden" name="task_id" value={task.id} />
                  <input type="hidden" name="intent" value="reopen" />
                  <SubmitButton variant="secondary">Reopen task</SubmitButton>
                </form>
              ) : (
                <>
                  <form action={manageTask} className="space-y-3">
                    <input type="hidden" name="task_id" value={task.id} />
                    <input type="hidden" name="intent" value="save" />
                    <div>
                      <label htmlFor="m-due" className={labelCls}>
                        Due date
                      </label>
                      <input id="m-due" name="due_date" type="date" defaultValue={task.due_date ?? ""} className={inputCls} />
                    </div>
                    <div>
                      <label htmlFor="m-priority" className={labelCls}>
                        Priority
                      </label>
                      <select id="m-priority" name="priority" defaultValue={task.priority} className={inputCls}>
                        {TASK_PRIORITIES.map((p) => (
                          <option key={p} value={p}>
                            {PRIORITY_LABEL[p]}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label htmlFor="m-assignee" className={labelCls}>
                        Assigned to
                      </label>
                      <select id="m-assignee" name="assignee_id" defaultValue={task.assignee_id ?? ""} className={inputCls}>
                        {reassignOptions.map((p) => (
                          <option key={p.id} value={p.id}>
                            {p.name}
                          </option>
                        ))}
                      </select>
                    </div>
                    <SubmitButton variant="secondary">Save changes</SubmitButton>
                  </form>
                  <form action={manageTask} className="mt-4 border-t border-slate-100 pt-4">
                    <input type="hidden" name="task_id" value={task.id} />
                    <input type="hidden" name="intent" value="cancel" />
                    <SubmitButton variant="danger" confirmMessage="Cancel this task? It will leave everyone's active list. You can reopen it later.">
                      Cancel task
                    </SubmitButton>
                  </form>
                </>
              )}
            </section>
          )}
        </aside>
      </div>
    </div>
  );
}
