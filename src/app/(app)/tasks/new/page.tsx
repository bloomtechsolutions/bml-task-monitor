import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { getViewer } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { addDays, todayMV, PRIORITY_LABEL } from "@/lib/format";
import { TASK_PRIORITIES } from "@/lib/database.types";
import { createTask } from "@/app/actions";
import { PageHeader, Notice, inputCls, labelCls } from "@/components/ui";
import { SubmitButton } from "@/components/submit-button";

export default async function NewTaskPage({ searchParams }: { searchParams: Promise<{ error?: string; parent?: string }> }) {
  const viewer = await getViewer();
  const { error, parent: parentId } = await searchParams;
  const supabase = await createClient();

  const [{ data: units }, { data: people }, parentRes] = await Promise.all([
    supabase.from("units").select("id, name, code").eq("is_active", true).order("name"),
    supabase
      .from("profiles")
      .select("id, full_name, email, unit_id, designation")
      .eq("is_active", true)
      .not("unit_id", "is", null)
      .order("full_name"),
    parentId
      ? supabase.from("task_overview").select("id, title, assignee_id").eq("id", parentId).maybeSingle()
      : Promise.resolve({ data: null }),
  ]);
  const parent = parentRes.data;

  // Who can this viewer assign to? (RLS enforces the same rule on insert.)
  const assignable = (people ?? []).filter((p) => {
    if (viewer.isHead) return true;
    if (viewer.isManager) return p.unit_id === viewer.profile.unit_id;
    return p.id === viewer.profile.id;
  });
  const byUnit = (units ?? [])
    .map((u) => ({ unit: u, people: assignable.filter((p) => p.unit_id === u.id) }))
    .filter((g) => g.people.length > 0);
  const selfOnly = !viewer.isHead && !viewer.isManager;
  const defaultAssignee = parent?.assignee_id ?? (selfOnly ? viewer.profile.id : "");
  const today = todayMV();

  return (
    <div className="mx-auto max-w-2xl">
      <Link href={parent ? `/tasks/${parent.id}` : "/"} className="mb-3 inline-flex items-center gap-1 text-sm text-slate-600 hover:text-slate-900">
        <ArrowLeft aria-hidden className="size-4" /> Back
      </Link>
      <PageHeader
        title={parent ? "Add sub-task" : selfOnly ? "Add a task for yourself" : "Assign a task"}
        subtitle={parent ? `Part of: ${parent.title}` : selfOnly ? "Track your own work alongside what's assigned to you." : undefined}
      />
      {error && <Notice tone="error">{error}</Notice>}

      <form action={createTask} className="space-y-5 rounded-lg border border-slate-200 bg-white p-4 sm:p-6">
        {parent?.id && <input type="hidden" name="parent_task_id" value={parent.id} />}

        <div>
          <label htmlFor="title" className={labelCls}>
            What needs to be done?
          </label>
          <input id="title" name="title" required minLength={3} maxLength={200} className={inputCls} placeholder="e.g. Submit October KYC exception report" autoFocus />
        </div>

        <div>
          <label htmlFor="description" className={labelCls}>
            Details <span className="font-normal text-slate-500">(optional)</span>
          </label>
          <textarea id="description" name="description" rows={4} maxLength={4000} className={inputCls} placeholder="Context, expected output, links…" />
        </div>

        <div className="grid gap-5 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <label htmlFor="assignee_id" className={labelCls}>
              Assign to
            </label>
            {selfOnly ? (
              <>
                <input type="hidden" name="assignee_id" value={viewer.profile.id} />
                <p className="rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-[15px] text-slate-700">
                  You ({viewer.profile.full_name ?? viewer.profile.email})
                </p>
              </>
            ) : byUnit.length === 0 ? (
              <p className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
                Nobody has been placed in a unit yet. Add people on the People page first.
              </p>
            ) : (
              <select id="assignee_id" name="assignee_id" required defaultValue={defaultAssignee} className={inputCls}>
                <option value="" disabled>
                  Choose a person…
                </option>
                {byUnit.map(({ unit, people }) => (
                  <optgroup key={unit.id} label={unit.name}>
                    {people.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.full_name ?? p.email}
                        {p.designation ? ` — ${p.designation}` : ""}
                        {p.id === viewer.profile.id ? " (me)" : ""}
                      </option>
                    ))}
                  </optgroup>
                ))}
              </select>
            )}
          </div>

          <div>
            <label htmlFor="due_date" className={labelCls}>
              Due date
            </label>
            <input id="due_date" name="due_date" type="date" required min={today} defaultValue={addDays(today, 7)} className={inputCls} />
          </div>

          <div>
            <label htmlFor="priority" className={labelCls}>
              Priority
            </label>
            <select id="priority" name="priority" defaultValue="medium" className={inputCls}>
              {TASK_PRIORITIES.map((p) => (
                <option key={p} value={p}>
                  {PRIORITY_LABEL[p]}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="flex flex-col-reverse gap-2 border-t border-slate-100 pt-4 sm:flex-row sm:justify-end">
          <Link href={parent ? `/tasks/${parent.id}` : "/"} className="inline-flex min-h-10 items-center justify-center rounded-md px-4 text-sm font-medium text-slate-700 hover:bg-slate-100">
            Cancel
          </Link>
          <SubmitButton pendingText="Assigning…">{parent ? "Add sub-task" : selfOnly ? "Add task" : "Assign task"}</SubmitButton>
        </div>
      </form>
    </div>
  );
}
