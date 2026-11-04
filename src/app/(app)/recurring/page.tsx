import { redirect } from "next/navigation";
import { Repeat, Pause, Play, Trash2 } from "lucide-react";
import { requirePerson } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { canAssignTo, isHead, isLead } from "@/lib/permissions";
import { addDays, formatDate, todayMV, PRIORITY_LABEL } from "@/lib/format";
import { FREQUENCIES, TASK_PRIORITIES } from "@/lib/database.types";
import { deleteRecurringRule, saveRecurringRule, toggleRecurringRule } from "@/app/feature-actions";
import { PageHeader, Notice, EmptyState, inputCls, labelCls } from "@/components/ui";
import { SubmitButton } from "@/components/submit-button";

export const metadata = { title: "Recurring tasks · Task Monitor" };

const FREQ_LABEL = { daily: "Every working day (Sun–Thu)", weekly: "Every week", monthly: "Every month", quarterly: "Every quarter" } as const;
const FREQ_SHORT = { daily: "Daily", weekly: "Weekly", monthly: "Monthly", quarterly: "Quarterly" } as const;

export default async function RecurringPage({ searchParams }: { searchParams: Promise<{ error?: string; saved?: string; deleted?: string }> }) {
  const [me, sp] = await Promise.all([requirePerson(), searchParams]);
  if (!isLead(me)) redirect("/");
  const supabase = createClient();
  const [{ data: rules }, { data: people }, { data: templates }] = await Promise.all([
    supabase.from("recurrence_rules").select("*").order("is_active", { ascending: false }).order("next_due_date"),
    supabase.from("profiles").select("id, full_name, unit_id").eq("is_active", true).order("full_name"),
    supabase.from("task_templates").select("id, name, unit_id").order("name"),
  ]);
  const mine = (rules ?? []).filter((r) => isHead(me) || r.unit_id === me.unit_id);
  const assignable = (people ?? []).filter((p) => canAssignTo(me, p));
  const names = new Map((people ?? []).map((p) => [p.id, p.full_name]));
  const tpls = (templates ?? []).filter((t) => isHead(me) || !t.unit_id || t.unit_id === me.unit_id);

  return (
    <>
      <PageHeader title="Recurring tasks" subtitle="Routine work that creates itself on schedule: daily cash checks, monthly MIS, quarterly reviews." />
      {sp.error && <Notice tone="error">{sp.error}</Notice>}
      {sp.saved && <Notice tone="success">Saved “{sp.saved}”. Any task already due within its lead time has been created.</Notice>}
      {sp.deleted && <Notice tone="success">Recurring task removed. Tasks it already created are kept.</Notice>}

      <details className="mb-6 overflow-hidden rounded-xl border border-slate-200 bg-white shadow-xs" open={mine.length === 0}>
        <summary className="cursor-pointer px-5 py-3.5 font-semibold text-slate-900">+ New recurring task</summary>
        <form action={saveRecurringRule} className="grid gap-4 border-t border-slate-100 p-5 sm:grid-cols-2">
          <label className="sm:col-span-2">
            <span className={labelCls}>Task title</span>
            <input name="title" required minLength={3} maxLength={200} className={inputCls} placeholder="e.g. Monthly dormant account review" />
          </label>
          <label className="sm:col-span-2">
            <span className={labelCls}>Details (optional)</span>
            <textarea name="description" rows={2} maxLength={4000} className={inputCls} />
          </label>
          <label>
            <span className={labelCls}>Who does it</span>
            <select name="assignee_id" required defaultValue="" className={inputCls}>
              <option value="" disabled>
                Choose…
              </option>
              {assignable.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.full_name}
                </option>
              ))}
            </select>
          </label>
          <label>
            <span className={labelCls}>Repeats</span>
            <select name="frequency" required defaultValue="monthly" className={inputCls}>
              {FREQUENCIES.map((f) => (
                <option key={f} value={f}>
                  {FREQ_LABEL[f]}
                </option>
              ))}
            </select>
          </label>
          <label>
            <span className={labelCls}>First due date</span>
            <input type="date" name="first_due" required min={todayMV()} defaultValue={addDays(todayMV(), 7)} className={inputCls} />
            <span className="mt-1 block text-xs text-slate-500">Monthly and quarterly repeat on this day of the month.</span>
          </label>
          <label>
            <span className={labelCls}>Create it how many days before it&apos;s due</span>
            <input type="number" name="lead_days" min={0} max={60} defaultValue={3} className={inputCls} />
          </label>
          <label>
            <span className={labelCls}>Priority</span>
            <select name="priority" defaultValue="medium" className={inputCls}>
              {TASK_PRIORITIES.map((p) => (
                <option key={p} value={p}>
                  {PRIORITY_LABEL[p]}
                </option>
              ))}
            </select>
          </label>
          <label>
            <span className={labelCls}>Checklist from template (optional)</span>
            <select name="template_id" defaultValue="" className={inputCls}>
              <option value="">None</option>
              {tpls.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </select>
          </label>
          <label className="flex items-start gap-3 rounded-lg bg-slate-50 px-3 py-3 sm:col-span-2">
            <input type="checkbox" name="requires_approval" className="mt-0.5 size-4 accent-blue-600" />
            <span className="text-sm">
              <span className="font-medium text-slate-900">Needs my sign-off</span>
              <span className="block text-slate-600">Each time it&apos;s finished it comes to you to approve.</span>
            </span>
          </label>
          <div className="flex justify-end sm:col-span-2">
            <SubmitButton pendingText="Saving…">Create recurring task</SubmitButton>
          </div>
        </form>
      </details>

      {mine.length === 0 ? (
        <EmptyState title="No recurring tasks yet" body="Set one up above. The system creates each task automatically just after midnight." />
      ) : (
        <ul className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-xs">
          {mine.map((r) => (
            <li key={r.id} className={`flex flex-col gap-3 border-b border-slate-100 px-5 py-4 last:border-b-0 sm:flex-row sm:items-center ${r.is_active ? "" : "opacity-60"}`}>
              <span aria-hidden className="grid size-9 shrink-0 place-items-center rounded-lg bg-blue-50 text-blue-600">
                <Repeat className="size-[18px]" />
              </span>
              <div className="min-w-0 flex-1">
                <p className="font-medium text-slate-900">
                  {r.title} {!r.is_active && <span className="ml-1 rounded bg-slate-200 px-1.5 py-0.5 text-xs font-normal text-slate-700">Paused</span>}
                </p>
                <p className="text-sm text-slate-600">
                  {FREQ_SHORT[r.frequency]} · {names.get(r.assignee_id) ?? "—"} · next due {formatDate(r.next_due_date)} · created {r.lead_days} day
                  {r.lead_days === 1 ? "" : "s"} ahead{r.requires_approval ? " · needs sign-off" : ""}
                </p>
              </div>
              <div className="flex gap-2">
                <form action={toggleRecurringRule}>
                  <input type="hidden" name="id" value={r.id} />
                  <SubmitButton variant="secondary" pendingText="…">
                    {r.is_active ? <Pause aria-hidden className="mr-1 size-4" /> : <Play aria-hidden className="mr-1 size-4" />}
                    {r.is_active ? "Pause" : "Resume"}
                  </SubmitButton>
                </form>
                <form action={deleteRecurringRule}>
                  <input type="hidden" name="id" value={r.id} />
                  <SubmitButton variant="danger" confirmMessage={`Stop “${r.title}” for good? Tasks it already created are kept.`} pendingText="…">
                    <Trash2 aria-hidden className="size-4" />
                    <span className="sr-only">Delete</span>
                  </SubmitButton>
                </form>
              </div>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
