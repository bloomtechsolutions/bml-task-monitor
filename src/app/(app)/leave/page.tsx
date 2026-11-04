import { Plane, Trash2 } from "lucide-react";
import { requirePerson } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { canAssignTo, isHead, isLead } from "@/lib/permissions";
import { daysBetween, formatDate, todayMV } from "@/lib/format";
import { LEAVE_KINDS } from "@/lib/database.types";
import { addLeave, deleteLeave } from "@/app/feature-actions";
import { PageHeader, Notice, EmptyState, inputCls, labelCls } from "@/components/ui";
import { SubmitButton } from "@/components/submit-button";

export const metadata = { title: "Leave" };

const KIND_LABEL = { annual: "Annual", sick: "Sick", training: "Training", official: "Official duty", other: "Other" } as const;

export default async function LeavePage({ searchParams }: { searchParams: Promise<{ error?: string; saved?: string; removed?: string }> }) {
  const [me, sp] = await Promise.all([requirePerson(), searchParams]);
  const today = todayMV();
  const supabase = createClient();
  const [{ data: rows }, { data: people }, { data: open }] = await Promise.all([
    supabase.from("leave").select("*").gte("end_date", today).order("start_date").limit(300),
    supabase.from("profiles").select("id, full_name, unit_id").eq("is_active", true).order("full_name"),
    supabase.from("tasks").select("assignee_id, due_date").in("status", ["not_started", "in_progress", "blocked"]).limit(5000),
  ]);
  const byId = new Map((people ?? []).map((p) => [p.id, p]));
  const visible = (rows ?? []).filter((l) => isHead(me) || l.profile_id === me.id || (me.unit_id && byId.get(l.profile_id)?.unit_id === me.unit_id));
  const forWhom = isLead(me) ? (people ?? []).filter((p) => canAssignTo(me, p)) : [];
  const dueDuring = (pid: string, s: string, e: string) => (open ?? []).filter((t) => t.assignee_id === pid && t.due_date >= s && t.due_date <= e).length;
  const canRemove = (l: (typeof visible)[number]) =>
    l.profile_id === me.id || l.created_by === me.id || isHead(me) || (isLead(me) && canAssignTo(me, byId.get(l.profile_id) ?? { id: "", unit_id: null }));

  return (
    <>
      <PageHeader title="Leave" subtitle="Record time away so work isn't assigned to people who are out." />
      {sp.error && <Notice tone="error">{sp.error}</Notice>}
      {sp.saved && <Notice tone="success">Leave recorded.</Notice>}
      {sp.removed && <Notice tone="success">Leave removed.</Notice>}

      <form action={addLeave} className="mb-6 grid gap-4 rounded-xl border border-slate-200 bg-white p-5 shadow-xs sm:grid-cols-6 sm:items-end">
        {forWhom.length > 1 && (
          <label className="sm:col-span-2">
            <span className={labelCls}>Who</span>
            <select name="profile_id" defaultValue={me.id} className={inputCls}>
              {forWhom.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.full_name}
                  {p.id === me.id ? " (me)" : ""}
                </option>
              ))}
            </select>
          </label>
        )}
        <label className={forWhom.length > 1 ? "" : "sm:col-span-2"}>
          <span className={labelCls}>First day</span>
          <input type="date" name="start_date" required min={today} defaultValue={today} className={inputCls} />
        </label>
        <label>
          <span className={labelCls}>Last day</span>
          <input type="date" name="end_date" required min={today} defaultValue={today} className={inputCls} />
        </label>
        <label>
          <span className={labelCls}>Type</span>
          <select name="kind" defaultValue="annual" className={inputCls}>
            {LEAVE_KINDS.map((k) => (
              <option key={k} value={k}>
                {KIND_LABEL[k]}
              </option>
            ))}
          </select>
        </label>
        <label className={forWhom.length > 1 ? "sm:col-span-4" : "sm:col-span-2"}>
          <span className={labelCls}>Note (optional)</span>
          <input name="note" maxLength={200} className={inputCls} placeholder="e.g. Covering: Aishath" />
        </label>
        <div className="sm:col-span-2 sm:flex sm:justify-end">
          <SubmitButton pendingText="Saving…">Add leave</SubmitButton>
        </div>
      </form>

      {visible.length === 0 ? (
        <EmptyState title="No upcoming leave" body="Leave you or your team record will show here, on the calendar and in the assign form." />
      ) : (
        <ul className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-xs">
          {visible.map((l) => {
            const p = byId.get(l.profile_id);
            const current = l.start_date <= today;
            const clash = dueDuring(l.profile_id, l.start_date, l.end_date);
            return (
              <li key={l.id} className="flex items-center gap-3 border-b border-slate-100 px-5 py-3.5 last:border-b-0">
                <span aria-hidden className={`grid size-9 shrink-0 place-items-center rounded-lg ${current ? "bg-amber-100 text-amber-700" : "bg-slate-100 text-slate-500"}`}>
                  <Plane className="size-[18px]" />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="font-medium text-slate-900">
                    {p?.full_name ?? "—"} {current && <span className="ml-1 rounded bg-amber-100 px-1.5 py-0.5 text-xs font-normal text-amber-900">Away now</span>}
                  </p>
                  <p className="text-sm text-slate-600">
                    {KIND_LABEL[l.kind]} · {formatDate(l.start_date)}
                    {l.end_date !== l.start_date && ` – ${formatDate(l.end_date)}`} · {daysBetween(l.start_date, l.end_date) + 1} day
                    {l.end_date !== l.start_date ? "s" : ""}
                    {l.note && ` · ${l.note}`}
                  </p>
                  {clash > 0 && (
                    <p className="text-sm font-medium text-red-700">
                      {clash} open task{clash === 1 ? " is" : "s are"} due during this leave. Reassign or move the due date.
                    </p>
                  )}
                </div>
                {canRemove(l) && (
                  <form action={deleteLeave}>
                    <input type="hidden" name="id" value={l.id} />
                    <button type="submit" aria-label="Remove leave" className="grid size-9 place-items-center rounded-md text-slate-400 hover:bg-slate-100 hover:text-red-600">
                      <Trash2 className="size-4" />
                    </button>
                  </form>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </>
  );
}
