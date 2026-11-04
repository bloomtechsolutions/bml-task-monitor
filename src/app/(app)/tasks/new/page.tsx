import Link from "next/link";
import { ArrowLeft, FileStack } from "lucide-react";
import { requirePerson } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { canAssignTo, canViewTask, isHead } from "@/lib/permissions";
import { addDays, formatDate, todayMV, PRIORITY_LABEL } from "@/lib/format";
import { TASK_PRIORITIES } from "@/lib/database.types";
import { createTask } from "@/app/actions";
import { PageHeader, Notice, inputCls, labelCls } from "@/components/ui";
import { SubmitButton } from "@/components/submit-button";

export const metadata = { title: "Assign a task · Task Monitor" };

const UUID = /^[0-9a-f-]{36}$/i;

export default async function NewTaskPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; parent?: string; template?: string; project?: string }>;
}) {
  const [me, sp] = await Promise.all([requirePerson(), searchParams]);
  const supabase = createClient();
  const today = todayMV();

  const [{ data: units }, { data: people }, { data: openRows }, { data: leave }, { data: templates }, { data: projects }, parentRes] =
    await Promise.all([
      supabase.from("units").select("id, name").eq("is_active", true).order("name"),
      supabase.from("profiles").select("id, full_name, unit_id, designation").eq("is_active", true).order("full_name"),
      supabase.from("tasks").select("assignee_id").in("status", ["not_started", "in_progress", "blocked"]).limit(5000),
      supabase.from("leave").select("profile_id, start_date, end_date").gte("end_date", today).lte("start_date", addDays(today, 30)),
      supabase.from("task_templates").select("*").order("name"),
      supabase.from("projects").select("id, title, unit_id, status").in("status", ["planning", "active", "on_hold"]).order("title"),
      sp.parent && UUID.test(sp.parent)
        ? supabase.from("task_overview").select("id, title, assignee_id, assigned_by, unit_id, project_id").eq("id", sp.parent).maybeSingle()
        : Promise.resolve({ data: null }),
    ]);
  const parent = parentRes.data && canViewTask(me, parentRes.data) ? parentRes.data : null;

  const myTemplates = (templates ?? []).filter((t) => isHead(me) || !t.unit_id || t.unit_id === me.unit_id);
  const template = myTemplates.find((t) => t.id === sp.template) ?? null;
  const myProjects = (projects ?? []).filter((p) => isHead(me) || p.unit_id === me.unit_id);

  const openCount = new Map<string, number>();
  for (const r of openRows ?? []) openCount.set(r.assignee_id, (openCount.get(r.assignee_id) ?? 0) + 1);
  const leaveBy = new Map<string, { start_date: string; end_date: string }>();
  for (const l of leave ?? []) if (!leaveBy.has(l.profile_id)) leaveBy.set(l.profile_id, l);

  const assignable = (people ?? []).filter((p) => canAssignTo(me, p));
  const groups = [
    ...(units ?? []).map((u) => ({ key: u.id, label: u.name, people: assignable.filter((p) => p.unit_id === u.id) })),
    { key: "none", label: "No unit", people: assignable.filter((p) => !p.unit_id) },
  ].filter((g) => g.people.length > 0);

  const defaultAssignee = parent?.assignee_id ?? (me.role === "staff" ? me.id : "");
  const backHref = parent ? `/tasks/${parent.id}` : "/tasks";

  return (
    <div className="mx-auto max-w-2xl">
      <Link href={backHref} className="mb-3 inline-flex items-center gap-1 text-sm text-slate-600 hover:text-slate-900">
        <ArrowLeft aria-hidden className="size-4" /> Back
      </Link>
      <PageHeader
        title={parent ? "Add sub-task" : me.role === "staff" ? "Add a task for yourself" : "Assign a task"}
        subtitle={parent ? `Part of: ${parent.title}` : undefined}
      />
      {sp.error && <Notice tone="error">{sp.error}</Notice>}

      {myTemplates.length > 0 && !parent && (
        <form className="mb-4 flex flex-col gap-2 rounded-xl border border-slate-200 bg-white p-4 shadow-xs sm:flex-row sm:items-end">
          <label className="flex-1">
            <span className={labelCls}>
              <FileStack aria-hidden className="mr-1 inline size-4 text-slate-500" />
              Start from a template
            </span>
            <select name="template" defaultValue={template?.id ?? ""} className={inputCls}>
              <option value="">Blank task</option>
              {myTemplates.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </select>
          </label>
          <button type="submit" className="inline-flex min-h-10 items-center justify-center rounded-lg border border-slate-300 bg-white px-4 text-sm font-medium text-slate-800 hover:bg-slate-50">
            Use template
          </button>
        </form>
      )}

      {groups.length === 0 ? (
        <Notice tone="info">
          No one is on the team list yet.{" "}
          <Link href="/admin" className="font-medium underline">
            Add people first
          </Link>
          .
        </Notice>
      ) : (
        <form key={template?.id ?? "blank"} action={createTask} className="space-y-5 rounded-xl border border-slate-200 bg-white p-4 shadow-xs sm:p-6">
          {parent?.id && <input type="hidden" name="parent_task_id" value={parent.id} />}

          <div>
            <label htmlFor="title" className={labelCls}>
              What needs to be done?
            </label>
            <input
              id="title"
              name="title"
              required
              minLength={3}
              maxLength={200}
              defaultValue={template?.title ?? ""}
              className={inputCls}
              placeholder="e.g. Submit October KYC exception report"
            />
          </div>

          <div>
            <label htmlFor="description" className={labelCls}>
              Details <span className="font-normal text-slate-500">(optional)</span>
            </label>
            <textarea
              id="description"
              name="description"
              rows={3}
              maxLength={4000}
              defaultValue={template?.description ?? ""}
              className={inputCls}
              placeholder="Context, expected output, links…"
            />
          </div>

          <div className="grid gap-5 sm:grid-cols-2">
            <div className="sm:col-span-2">
              <label htmlFor="assignee_id" className={labelCls}>
                Assign to
              </label>
              <select id="assignee_id" name="assignee_id" required defaultValue={defaultAssignee} className={inputCls}>
                <option value="" disabled>
                  Choose a person…
                </option>
                {groups.map((g) => (
                  <optgroup key={g.key} label={g.label}>
                    {g.people.map((p) => {
                      const l = leaveBy.get(p.id);
                      return (
                        <option key={p.id} value={p.id}>
                          {p.full_name ?? "Unnamed"}
                          {p.id === me.id ? " (me)" : ""} · {openCount.get(p.id) ?? 0} open
                          {l ? ` · on leave ${formatDate(l.start_date)}–${formatDate(l.end_date)}` : ""}
                        </option>
                      );
                    })}
                  </optgroup>
                ))}
              </select>
              <p className="mt-1 text-xs text-slate-500">Open task counts and upcoming leave are shown next to each name.</p>
            </div>

            <div>
              <label htmlFor="due_date" className={labelCls}>
                Due date
              </label>
              <input
                id="due_date"
                name="due_date"
                type="date"
                required
                min={today}
                defaultValue={addDays(today, template?.due_in_days ?? 7)}
                className={inputCls}
              />
            </div>

            <div>
              <label htmlFor="priority" className={labelCls}>
                Priority
              </label>
              <select id="priority" name="priority" defaultValue={template?.priority ?? "medium"} className={inputCls}>
                {TASK_PRIORITIES.map((p) => (
                  <option key={p} value={p}>
                    {PRIORITY_LABEL[p]}
                  </option>
                ))}
              </select>
            </div>

            {myProjects.length > 0 && (
              <div>
                <label htmlFor="project_id" className={labelCls}>
                  Project <span className="font-normal text-slate-500">(optional)</span>
                </label>
                <select id="project_id" name="project_id" defaultValue={parent?.project_id ?? sp.project ?? ""} className={inputCls}>
                  <option value="">None</option>
                  {myProjects.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.title}
                    </option>
                  ))}
                </select>
              </div>
            )}

            {isHead(me) && (
              <div>
                <label htmlFor="unit_id" className={labelCls}>
                  Unit <span className="font-normal text-slate-500">(optional)</span>
                </label>
                <select id="unit_id" name="unit_id" defaultValue={parent?.unit_id ?? ""} className={inputCls}>
                  <option value="">Same as the person&apos;s unit</option>
                  {(units ?? []).map((u) => (
                    <option key={u.id} value={u.id}>
                      {u.name}
                    </option>
                  ))}
                </select>
              </div>
            )}
          </div>

          <div>
            <label htmlFor="checklist" className={labelCls}>
              Checklist <span className="font-normal text-slate-500">(optional, one step per line)</span>
            </label>
            <textarea
              id="checklist"
              name="checklist"
              rows={3}
              defaultValue={Array.isArray(template?.checklist) ? (template.checklist as string[]).join("\n") : ""}
              className={inputCls}
              placeholder={"Pull the report from T24\nGet maker-checker signature\nUpload signed copy"}
            />
          </div>

          {me.role !== "staff" && (
            <label className="flex items-start gap-3 rounded-lg bg-slate-50 px-3 py-3">
              <input
                type="checkbox"
                name="requires_approval"
                defaultChecked={template ? template.requires_approval : true}
                className="mt-0.5 size-4 accent-blue-600"
              />
              <span className="text-sm">
                <span className="font-medium text-slate-900">Needs my sign-off</span>
                <span className="block text-slate-600">When they finish, the task comes to you to approve or send back.</span>
              </span>
            </label>
          )}

          <div className="flex flex-col-reverse gap-2 border-t border-slate-100 pt-4 sm:flex-row sm:justify-end">
            <Link href={backHref} className="inline-flex min-h-10 items-center justify-center rounded-lg px-4 text-sm font-medium text-slate-700 hover:bg-slate-100">
              Cancel
            </Link>
            <SubmitButton pendingText="Saving…">{parent ? "Add sub-task" : me.role === "staff" ? "Add task" : "Assign task"}</SubmitButton>
          </div>
        </form>
      )}
    </div>
  );
}
