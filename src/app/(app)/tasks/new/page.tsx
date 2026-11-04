import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { getPerson } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { addDays, todayMV, PRIORITY_LABEL } from "@/lib/format";
import { TASK_PRIORITIES } from "@/lib/database.types";
import { createTask } from "@/app/actions";
import { PageHeader, Notice, inputCls, labelCls } from "@/components/ui";
import { SubmitButton } from "@/components/submit-button";

export default async function NewTaskPage({ searchParams }: { searchParams: Promise<{ error?: string; parent?: string }> }) {
  const { error, parent: parentId } = await searchParams;
  const supabase = createClient();

  const [person, { data: units }, { data: people }, parentRes] = await Promise.all([
    getPerson(),
    supabase.from("units").select("id, name").eq("is_active", true).order("name"),
    supabase.from("profiles").select("id, full_name, unit_id, designation").eq("is_active", true).order("full_name"),
    parentId && /^[0-9a-f-]{36}$/i.test(parentId)
      ? supabase.from("task_overview").select("id, title, assignee_id, unit_id").eq("id", parentId).maybeSingle()
      : Promise.resolve({ data: null }),
  ]);
  const parent = parentRes.data;

  const groups = [
    ...(units ?? []).map((u) => ({ key: u.id, label: u.name, people: (people ?? []).filter((p) => p.unit_id === u.id) })),
    { key: "none", label: "No unit", people: (people ?? []).filter((p) => !p.unit_id) },
  ].filter((g) => g.people.length > 0);
  const today = todayMV();

  return (
    <div className="mx-auto max-w-2xl">
      <Link href={parent ? `/tasks/${parent.id}` : "/"} className="mb-3 inline-flex items-center gap-1 text-sm text-slate-600 hover:text-slate-900">
        <ArrowLeft aria-hidden className="size-4" /> Back
      </Link>
      <PageHeader title={parent ? "Add sub-task" : "Assign a task"} subtitle={parent ? `Part of: ${parent.title}` : undefined} />
      {error && <Notice tone="error">{error}</Notice>}
      {!person && (
        <Notice tone="info">
          Tip: choose your name under <strong>I am…</strong> at the top so the task shows who assigned it.
        </Notice>
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
        <form action={createTask} className="space-y-5 rounded-xl border border-slate-200 bg-white shadow-xs p-4 sm:p-6">
          {parent?.id && <input type="hidden" name="parent_task_id" value={parent.id} />}

          <div>
            <label htmlFor="title" className={labelCls}>
              What needs to be done?
            </label>
            <input id="title" name="title" required minLength={3} maxLength={200} className={inputCls} placeholder="e.g. Submit October KYC exception report" />
          </div>

          <div>
            <label htmlFor="description" className={labelCls}>
              Details <span className="font-normal text-slate-500">(optional)</span>
            </label>
            <textarea id="description" name="description" rows={4} maxLength={4000} className={inputCls} placeholder="Context, expected output, links…" />
          </div>

          <div className="grid gap-5 sm:grid-cols-2">
            <div>
              <label htmlFor="assignee_id" className={labelCls}>
                Assign to
              </label>
              <select id="assignee_id" name="assignee_id" required defaultValue={parent?.assignee_id ?? ""} className={inputCls}>
                <option value="" disabled>
                  Choose a person…
                </option>
                {groups.map((g) => (
                  <optgroup key={g.key} label={g.label}>
                    {g.people.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.full_name ?? "Unnamed"}
                        {p.designation ? ` — ${p.designation}` : ""}
                        {p.id === person?.id ? " (me)" : ""}
                      </option>
                    ))}
                  </optgroup>
                ))}
              </select>
            </div>

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
            <SubmitButton pendingText="Assigning…">{parent ? "Add sub-task" : "Assign task"}</SubmitButton>
          </div>
        </form>
      )}
    </div>
  );
}
