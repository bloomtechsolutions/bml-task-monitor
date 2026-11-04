import { redirect } from "next/navigation";
import Link from "next/link";
import { FileStack, Trash2 } from "lucide-react";
import { requirePerson } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { isHead, isLead } from "@/lib/permissions";
import { PRIORITY_LABEL } from "@/lib/format";
import { TASK_PRIORITIES, type Tables } from "@/lib/database.types";
import { deleteTemplate, saveTemplate } from "@/app/feature-actions";
import { PageHeader, Notice, EmptyState, inputCls, labelCls } from "@/components/ui";
import { SubmitButton } from "@/components/submit-button";

export const metadata = { title: "Templates · Task Monitor" };

function Fields({ t, units, showUnit }: { t?: Tables<"task_templates">; units: { id: string; name: string }[]; showUnit: boolean }) {
  const items = Array.isArray(t?.checklist) ? (t!.checklist as string[]) : [];
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <label>
        <span className={labelCls}>Template name</span>
        <input name="name" required minLength={2} maxLength={120} defaultValue={t?.name ?? ""} className={inputCls} placeholder="e.g. Branch cash audit" />
      </label>
      <label>
        <span className={labelCls}>Task title</span>
        <input name="title" required minLength={3} maxLength={200} defaultValue={t?.title ?? ""} className={inputCls} placeholder="e.g. Monthly branch cash audit" />
      </label>
      <label className="sm:col-span-2">
        <span className={labelCls}>Details</span>
        <textarea name="description" rows={2} maxLength={4000} defaultValue={t?.description ?? ""} className={inputCls} />
      </label>
      <label className="sm:col-span-2">
        <span className={labelCls}>Checklist (one step per line)</span>
        <textarea name="checklist" rows={5} defaultValue={items.join("\n")} className={inputCls} placeholder={"Count vault cash\nTally with GL\nDual-sign the register\nUpload signed copy"} />
      </label>
      <label>
        <span className={labelCls}>Due in (days)</span>
        <input type="number" name="due_in_days" min={0} max={365} defaultValue={t?.due_in_days ?? 7} className={inputCls} />
      </label>
      <label>
        <span className={labelCls}>Priority</span>
        <select name="priority" defaultValue={t?.priority ?? "medium"} className={inputCls}>
          {TASK_PRIORITIES.map((p) => (
            <option key={p} value={p}>
              {PRIORITY_LABEL[p]}
            </option>
          ))}
        </select>
      </label>
      {showUnit && (
        <label>
          <span className={labelCls}>Unit</span>
          <select name="unit_id" defaultValue={t?.unit_id ?? ""} className={inputCls}>
            <option value="">All units</option>
            {units.map((u) => (
              <option key={u.id} value={u.id}>
                {u.name}
              </option>
            ))}
          </select>
        </label>
      )}
      <label className="flex items-center gap-3 self-end rounded-lg bg-slate-50 px-3 py-2.5">
        <input type="checkbox" name="requires_approval" defaultChecked={t ? t.requires_approval : true} className="size-4 accent-blue-600" />
        <span className="text-sm font-medium text-slate-900">Needs sign-off</span>
      </label>
    </div>
  );
}

export default async function TemplatesPage({ searchParams }: { searchParams: Promise<{ error?: string; saved?: string; deleted?: string }> }) {
  const [me, sp] = await Promise.all([requirePerson(), searchParams]);
  if (!isLead(me)) redirect("/");
  const supabase = createClient();
  const [{ data: templates }, { data: units }] = await Promise.all([
    supabase.from("task_templates").select("*").order("name"),
    supabase.from("units").select("id, name").eq("is_active", true).order("name"),
  ]);
  const visible = (templates ?? []).filter((t) => isHead(me) || !t.unit_id || t.unit_id === me.unit_id);
  const unitName = new Map((units ?? []).map((u) => [u.id, u.name]));

  return (
    <>
      <PageHeader title="Templates" subtitle="Reusable tasks with a ready-made checklist. Use them when assigning, or for recurring work." />
      {sp.error && <Notice tone="error">{sp.error}</Notice>}
      {sp.saved && <Notice tone="success">Saved template “{sp.saved}”.</Notice>}
      {sp.deleted && <Notice tone="success">Deleted template “{sp.deleted}”.</Notice>}

      <details className="mb-6 overflow-hidden rounded-xl border border-slate-200 bg-white shadow-xs" open={visible.length === 0}>
        <summary className="cursor-pointer px-5 py-3.5 font-semibold text-slate-900">+ New template</summary>
        <form action={saveTemplate} className="space-y-4 border-t border-slate-100 p-5">
          <Fields units={units ?? []} showUnit={isHead(me)} />
          <div className="flex justify-end">
            <SubmitButton pendingText="Saving…">Save template</SubmitButton>
          </div>
        </form>
      </details>

      {visible.length === 0 ? (
        <EmptyState title="No templates yet" body="Create one for work your team repeats, like account-opening reviews or branch audits." />
      ) : (
        <ul className="space-y-3">
          {visible.map((t) => {
            const items = Array.isArray(t.checklist) ? (t.checklist as string[]) : [];
            const editable = isHead(me) || t.unit_id === me.unit_id;
            return (
              <li key={t.id} className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-xs">
                <details>
                  <summary className="flex cursor-pointer items-center gap-3 px-5 py-4">
                    <span aria-hidden className="grid size-9 shrink-0 place-items-center rounded-lg bg-violet-50 text-violet-600">
                      <FileStack className="size-[18px]" />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block font-medium text-slate-900">{t.name}</span>
                      <span className="block text-sm text-slate-500">
                        {items.length} checklist step{items.length === 1 ? "" : "s"} · due in {t.due_in_days} days · {t.unit_id ? unitName.get(t.unit_id) : "All units"}
                      </span>
                    </span>
                    <Link href={`/tasks/new?template=${t.id}`} className="shrink-0 rounded-lg bg-blue-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-blue-700">
                      Use
                    </Link>
                  </summary>
                  {editable && (
                    <div className="border-t border-slate-100 p-5">
                      <form action={saveTemplate} className="space-y-4">
                        <input type="hidden" name="id" value={t.id} />
                        <Fields t={t} units={units ?? []} showUnit={isHead(me)} />
                        <div className="flex justify-end">
                          <SubmitButton variant="secondary">Save changes</SubmitButton>
                        </div>
                      </form>
                      <form action={deleteTemplate} className="mt-3 border-t border-slate-100 pt-3">
                        <input type="hidden" name="id" value={t.id} />
                        <SubmitButton variant="danger" confirmMessage={`Delete the “${t.name}” template?`}>
                          <Trash2 aria-hidden className="mr-1 size-4" /> Delete template
                        </SubmitButton>
                      </form>
                    </div>
                  )}
                </details>
              </li>
            );
          })}
        </ul>
      )}
    </>
  );
}
