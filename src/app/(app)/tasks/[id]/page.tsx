import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, Plus, Paperclip, FileText, Trash2, CheckSquare, Square, ShieldCheck, FolderKanban } from "lucide-react";
import { requirePerson } from "@/lib/auth";
import { canApprove, canAssignTo, canManageTask, canViewTask } from "@/lib/permissions";
import { createClient } from "@/lib/supabase/server";
import { dueLabel, formatDate, formatDateTime, PRIORITY_LABEL } from "@/lib/format";
import { TASK_PRIORITIES } from "@/lib/database.types";
import {
  addChecklistItems, addComment, deleteChecklistItem, deleteEvidence, manageTask, reviewTask, toggleChecklistItem, uploadEvidence,
} from "@/app/actions";
import { StatusBadge, PriorityTag, DueText, ProgressBar, Notice, inputCls, labelCls } from "@/components/ui";
import { SubmitButton } from "@/components/submit-button";
import { TaskListItem } from "@/components/task-row";
import { TaskTimeline } from "@/components/task-timeline";
import { ProgressForm } from "./progress-form";

const SAVED: Record<string, string> = {
  created: "Task assigned.",
  update: "Update saved.",
  comment: "Comment added.",
  details: "Task details updated.",
  cancelled: "Task cancelled.",
  reopened: "Task reopened.",
  subtask: "Sub-task added.",
  submitted: "Sent for sign-off. You'll be notified when it's approved.",
  approved: "Approved and marked done.",
  returned: "Sent back with your notes.",
  file: "File attached.",
  file_removed: "File removed.",
};

function fileSize(n: number | null): string {
  if (!n) return "";
  return n < 1024 * 1024 ? `${Math.max(1, Math.round(n / 1024))} KB` : `${(n / 1024 / 1024).toFixed(1)} MB`;
}

function SubmitButtonIcon({ label }: { label: string }) {
  return (
    <button type="submit" aria-label={label} className="grid size-8 place-items-center rounded-md text-slate-400 hover:bg-slate-100 hover:text-red-600">
      <Trash2 aria-hidden className="size-4" />
    </button>
  );
}

export default async function TaskPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ saved?: string; error?: string; activity?: string }>;
}) {
  const [{ id }, sp, person] = await Promise.all([params, searchParams, requirePerson()]);
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const supabase = createClient();

  const [{ data: task }, { data: updates }, { data: comments }, { data: subtasks }] = await Promise.all([
    supabase.from("task_overview").select("*").eq("id", id).maybeSingle(),
    supabase
      .from("task_updates")
      .select("id, created_at, note, author_id, old_status, new_status, old_progress, new_progress, old_due_date, new_due_date")
      .eq("task_id", id)
      .order("created_at", { ascending: false })
      .limit(100),
    supabase
      .from("task_comments")
      .select("id, created_at, body, author_id")
      .eq("task_id", id)
      .order("created_at", { ascending: false })
      .limit(300),
    supabase.from("task_overview").select("*").eq("parent_task_id", id).order("due_date"),
  ]);

  if (!task || !task.id || !task.status || !task.priority || !canViewTask(person, task)) notFound();

  const [{ data: checklist }, { data: files }, { data: leave }, { data: events }, { data: everyone }] = await Promise.all([
    supabase.from("task_checklist_items").select("*").eq("task_id", id).order("position"),
    supabase.from("task_attachments").select("*").eq("task_id", id).order("created_at"),
    supabase
      .from("leave")
      .select("start_date, end_date, kind")
      .eq("profile_id", task.assignee_id!)
      .lte("start_date", task.due_date!)
      .gte("end_date", new Date().toISOString().slice(0, 10))
      .order("start_date")
      .limit(1),
    supabase.from("task_events").select("id, created_at, actor_id, kind, detail").eq("task_id", id).order("created_at", { ascending: false }).limit(500),
    supabase.from("profiles").select("id, full_name"),
  ]);
  const names = new Map((everyone ?? []).map((p) => [p.id, p.full_name ?? "Unnamed"]));
  const activityFilter = sp.activity === "comments" || sp.activity === "changes" ? sp.activity : "all";

  const taskId: string = task.id;
  const isAssignee = task.assignee_id === person.id;
  const canManage = canManageTask(person, task);
  const canUpdate = isAssignee || canManage;
  const mayApprove = canApprove(person, task);
  const closed = task.status === "cancelled";
  const awaiting = task.status === "submitted";
  const doneItems = (checklist ?? []).filter((c) => c.is_done).length;

  let reassignOptions: { id: string; name: string }[] = [];
  if (canManage && !closed) {
    const { data } = await supabase.from("profiles").select("id, full_name, unit_id").eq("is_active", true).order("full_name");
    reassignOptions = (data ?? [])
      .filter((p) => canAssignTo(person, p) || p.id === task.assignee_id)
      .map((p) => ({ id: p.id, name: p.full_name ?? "Unnamed" }));
  }

  return (
    <div className="mx-auto max-w-5xl">
      <Link
        href={task.parent_task_id ? `/tasks/${task.parent_task_id}` : isAssignee ? "/tasks" : "/tasks?view=assigned"}
        className="mb-3 inline-flex items-center gap-1 text-sm text-slate-600 hover:text-slate-900"
      >
        <ArrowLeft aria-hidden className="size-4" /> {task.parent_task_id ? "Parent task" : "Back to tasks"}
      </Link>

      {sp.saved && SAVED[sp.saved] && <Notice tone="success">{SAVED[sp.saved]}</Notice>}
      {sp.error && <Notice tone="error">{sp.error}</Notice>}

      <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
        <div className="min-w-0 space-y-6">
          {/* Summary */}
          <section className="rounded-xl border border-slate-200 bg-white shadow-xs p-4 sm:p-5">
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
            {task.project_id && (
              <Link href={`/projects/${task.project_id}`} className="mt-4 inline-flex items-center gap-1.5 text-sm font-medium text-blue-700 hover:underline">
                <FolderKanban aria-hidden className="size-4" /> {task.project_title}
              </Link>
            )}
            {leave?.[0] && (
              <p className="mt-4 rounded-md bg-amber-50 px-3 py-2 text-sm text-amber-900 ring-1 ring-amber-200">
                {task.assignee_name} is on {leave[0].kind} leave {formatDate(leave[0].start_date)} – {formatDate(leave[0].end_date)}, before this is due.
              </p>
            )}
          </section>

          {/* Sign-off */}
          {awaiting && (
            <section aria-labelledby="review-h" className="rounded-xl border border-violet-200 bg-violet-50/60 p-4 shadow-xs sm:p-5">
              <h2 id="review-h" className="flex items-center gap-2 font-semibold text-violet-900">
                <ShieldCheck aria-hidden className="size-5" /> Waiting for sign-off
              </h2>
              {mayApprove ? (
                <form action={reviewTask} className="mt-3 space-y-3">
                  <input type="hidden" name="task_id" value={taskId} />
                  <label htmlFor="review-note" className={labelCls}>
                    Note <span className="font-normal text-slate-500">(required if you send it back)</span>
                  </label>
                  <textarea id="review-note" name="note" rows={2} maxLength={2000} className={inputCls} placeholder="What's good, or what needs fixing" />
                  <div className="flex flex-wrap justify-end gap-2">
                    <SubmitButton variant="secondary" name="decision" value="return" pendingText="Sending back…">
                      Send back
                    </SubmitButton>
                    <SubmitButton name="decision" value="approve" pendingText="Approving…">
                      Approve &amp; close
                    </SubmitButton>
                  </div>
                </form>
              ) : (
                <p className="mt-2 text-sm text-violet-900">
                  {task.assigned_by_name ?? "The person who assigned it"} will review it. You&apos;ll get a notification when it&apos;s approved or sent back.
                </p>
              )}
            </section>
          )}

          {/* Primary action: progress update */}
          {canUpdate && !closed && !(awaiting && mayApprove) && (
            <section aria-labelledby="update-h" className="rounded-xl border border-slate-200 bg-white shadow-xs p-4 sm:p-5">
              <h2 id="update-h" className="mb-3 font-semibold text-slate-900">
                Post a progress update
              </h2>
              <ProgressForm
                taskId={task.id}
                status={task.status}
                checklistTotal={checklist?.length ?? 0}
                checklistDone={doneItems}
                needsSignOff={task.requires_approval === true && !mayApprove}
              />
            </section>
          )}

          {/* Checklist */}
          {((checklist?.length ?? 0) > 0 || (canUpdate && !closed)) && (
            <section aria-labelledby="check-h" className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-xs">
              <div className="flex items-center justify-between px-4 py-3">
                <h2 id="check-h" className="font-semibold text-slate-900">
                  Checklist{" "}
                  {(checklist?.length ?? 0) > 0 && (
                    <span className="font-normal tabular-nums text-slate-500">
                      {doneItems}/{checklist!.length} done
                    </span>
                  )}
                </h2>
              </div>
              {(checklist?.length ?? 0) > 0 && (
                <ul className="divide-y divide-slate-100 border-t border-slate-100">
                  {checklist!.map((c) => (
                    <li key={c.id} className="flex items-center gap-2 px-4 py-2">
                      <form action={toggleChecklistItem} className="flex min-w-0 flex-1">
                        <input type="hidden" name="task_id" value={taskId} />
                        <input type="hidden" name="item_id" value={c.id} />
                        <input type="hidden" name="done" value={c.is_done ? "0" : "1"} />
                        <button
                          type="submit"
                          disabled={!canUpdate || closed}
                          aria-pressed={c.is_done}
                          className="flex min-h-9 min-w-0 flex-1 items-center gap-2.5 text-left text-[15px] disabled:cursor-default"
                        >
                          {c.is_done ? (
                            <CheckSquare aria-hidden className="size-5 shrink-0 text-emerald-600" />
                          ) : (
                            <Square aria-hidden className="size-5 shrink-0 text-slate-400" />
                          )}
                          <span className={c.is_done ? "text-slate-500 line-through" : "text-slate-800"}>{c.body}</span>
                        </button>
                      </form>
                      {canUpdate && !closed && (
                        <form action={deleteChecklistItem}>
                          <input type="hidden" name="task_id" value={taskId} />
                          <input type="hidden" name="item_id" value={c.id} />
                          <button type="submit" aria-label={`Remove “${c.body}”`} className="grid size-8 place-items-center rounded-md text-slate-400 hover:bg-slate-100 hover:text-red-600">
                            <Trash2 aria-hidden className="size-4" />
                          </button>
                        </form>
                      )}
                    </li>
                  ))}
                </ul>
              )}
              {canUpdate && !closed && (
                <form action={addChecklistItems} className="flex gap-2 border-t border-slate-100 px-4 py-3">
                  <input type="hidden" name="task_id" value={taskId} />
                  <label htmlFor="new-item" className="sr-only">
                    New checklist item
                  </label>
                  <input id="new-item" name="body" maxLength={300} required className={inputCls} placeholder="Add a step, e.g. Get maker-checker signature" />
                  <SubmitButton variant="secondary" pendingText="Adding…">
                    Add
                  </SubmitButton>
                </form>
              )}
            </section>
          )}

          {/* Evidence */}
          <section aria-labelledby="files-h" className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-xs">
            <div className="px-4 py-3">
              <h2 id="files-h" className="flex items-center gap-2 font-semibold text-slate-900">
                <Paperclip aria-hidden className="size-4 text-slate-500" /> Evidence &amp; files{" "}
                <span className="font-normal tabular-nums text-slate-500">{files?.length ?? 0}</span>
              </h2>
              <p className="text-sm text-slate-500">Proof of completion for audit: signed forms, screenshots, reports.</p>
            </div>
            {(files?.length ?? 0) > 0 && (
              <ul className="divide-y divide-slate-100 border-t border-slate-100">
                {files!.map((f) => (
                  <li key={f.id} className="flex items-center gap-3 px-4 py-2.5">
                    <FileText aria-hidden className="size-5 shrink-0 text-slate-400" />
                    <a href={`/tasks/${taskId}/files/${f.id}`} target="_blank" rel="noopener" className="min-w-0 flex-1 truncate text-[15px] font-medium text-blue-700 hover:underline">
                      {f.file_name}
                    </a>
                    <span className="shrink-0 text-xs text-slate-500">
                      {fileSize(f.size_bytes)} · {formatDateTime(f.created_at)}
                    </span>
                    {(f.uploaded_by === person.id || canManage) && (
                      <form action={deleteEvidence}>
                        <input type="hidden" name="task_id" value={taskId} />
                        <input type="hidden" name="file_id" value={f.id} />
                        <SubmitButtonIcon label={`Remove ${f.file_name}`} />
                      </form>
                    )}
                  </li>
                ))}
              </ul>
            )}
            {canUpdate && !closed && (
              <form action={uploadEvidence} className="flex flex-col gap-2 border-t border-slate-100 px-4 py-3 sm:flex-row sm:items-center">
                <input type="hidden" name="task_id" value={taskId} />
                <label htmlFor="file" className="sr-only">
                  Choose a file
                </label>
                <input
                  id="file"
                  name="file"
                  type="file"
                  required
                  accept=".pdf,.png,.jpg,.jpeg,.webp,.heic,.csv,.txt,.doc,.docx,.xls,.xlsx"
                  className="block w-full text-sm text-slate-700 file:mr-3 file:rounded-lg file:border-0 file:bg-slate-100 file:px-3 file:py-2 file:text-sm file:font-medium file:text-slate-800 hover:file:bg-slate-200"
                />
                <SubmitButton variant="secondary" pendingText="Uploading…">
                  Upload
                </SubmitButton>
              </form>
            )}
            {canUpdate && !closed && <p className="px-4 pb-3 text-xs text-slate-500">PDF, image, Word, Excel, CSV or text · up to 4 MB.</p>}
          </section>

          {/* Sub-tasks */}
          {((subtasks?.length ?? 0) > 0 || canUpdate) && !closed && (
            <section aria-labelledby="sub-h" className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-xs">
              <div className="flex items-center justify-between px-4 py-3">
                <h2 id="sub-h" className="font-semibold text-slate-900">
                  Sub-tasks{" "}
                  <span className="font-normal tabular-nums text-slate-500">
                    {(subtasks ?? []).filter((s) => s.status === "done").length}/{subtasks?.length ?? 0} done
                  </span>
                </h2>
                {canUpdate && (
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
          <section id="activity" aria-labelledby="activity-h" className="scroll-mt-20 rounded-xl border border-slate-200 bg-white shadow-xs p-4 sm:p-5">
            <h2 id="activity-h" className="font-semibold text-slate-900">
              Activity timeline
            </h2>
            <p className="mb-4 text-sm text-slate-500">Every change, update, file and comment on this task, newest first.</p>
            <form action={addComment} className="mb-5 space-y-2">
              <input type="hidden" name="task_id" value={taskId} />
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

            <TaskTimeline
              taskId={taskId}
              updates={updates ?? []}
              comments={comments ?? []}
              events={events ?? []}
              names={names}
              filter={activityFilter}
            />
          </section>
        </div>

        {/* Side panel */}
        <aside className="space-y-6">
          <section className="rounded-xl border border-slate-200 bg-white shadow-xs p-4">
            <dl className="space-y-3 text-sm">
              {(
                [
                  ["Assigned to", task.assignee_name],
                  ["Assigned by", task.assigned_by_name],
                  ["Unit", task.unit_name],
                  ["Sign-off", task.requires_approval ? "Required" : "Not needed"],
                  ["Due date", formatDate(task.due_date)],
                  ["Priority", PRIORITY_LABEL[task.priority]],
                  ["Created", task.created_at ? formatDateTime(task.created_at) : "—"],
                  ...(task.submitted_at ? [["Submitted", formatDateTime(task.submitted_at)] as const] : []),
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
            <section aria-labelledby="manage-h" className="rounded-xl border border-slate-200 bg-white shadow-xs p-4">
              <h2 id="manage-h" className="mb-3 text-sm font-semibold text-slate-900">
                Manage task
              </h2>
              {closed ? (
                <form action={manageTask}>
                  <input type="hidden" name="task_id" value={taskId} />
                  <input type="hidden" name="intent" value="reopen" />
                  <SubmitButton variant="secondary">Reopen task</SubmitButton>
                </form>
              ) : (
                <>
                  <form action={manageTask} className="space-y-3">
                    <input type="hidden" name="task_id" value={taskId} />
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
                    <input type="hidden" name="task_id" value={taskId} />
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
