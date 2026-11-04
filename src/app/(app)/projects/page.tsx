import Link from "next/link";
import { FolderKanban } from "lucide-react";
import { requirePerson } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { isHead, isLead } from "@/lib/permissions";
import { formatDate } from "@/lib/format";
import { saveProject } from "@/app/feature-actions";
import { PageHeader, Notice, EmptyState, ProgressBar } from "@/components/ui";
import { SubmitButton } from "@/components/submit-button";
import { ProjectFields, PROJECT_STATUS_LABEL } from "@/components/project-fields";

export const metadata = { title: "Projects · Task Monitor" };

export default async function ProjectsPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const [me, sp] = await Promise.all([requirePerson(), searchParams]);
  const supabase = createClient();
  const [{ data: projects }, { data: units }, { data: people }, { data: tasks }] = await Promise.all([
    supabase.from("projects").select("*").order("status").order("target_date", { nullsFirst: false }),
    supabase.from("units").select("id, name").eq("is_active", true).order("name"),
    supabase.from("profiles").select("id, full_name, unit_id").eq("is_active", true).order("full_name"),
    supabase.from("task_overview").select("project_id, status, is_overdue, assignee_id").not("project_id", "is", null).neq("status", "cancelled"),
  ]);

  const mineIn = new Set((tasks ?? []).filter((t) => t.assignee_id === me.id).map((t) => t.project_id));
  const visible = (projects ?? []).filter((p) => isHead(me) || p.unit_id === me.unit_id || mineIn.has(p.id));
  const stats = new Map<string, { total: number; done: number; overdue: number }>();
  for (const t of tasks ?? []) {
    const s = stats.get(t.project_id!) ?? { total: 0, done: 0, overdue: 0 };
    s.total++;
    if (t.status === "done") s.done++;
    if (t.is_overdue) s.overdue++;
    stats.set(t.project_id!, s);
  }
  const unitName = new Map((units ?? []).map((u) => [u.id, u.name]));
  const personName = new Map((people ?? []).map((p) => [p.id, p.full_name]));
  const owners = (people ?? []).filter((p) => isHead(me) || p.unit_id === me.unit_id);

  return (
    <>
      <PageHeader title="Projects" subtitle="Group related tasks under an initiative and see overall progress." />
      {sp.error && <Notice tone="error">{sp.error}</Notice>}

      {isLead(me) && (
        <details className="mb-6 overflow-hidden rounded-xl border border-slate-200 bg-white shadow-xs" open={visible.length === 0}>
          <summary className="cursor-pointer px-5 py-3.5 font-semibold text-slate-900">+ New project</summary>
          <form action={saveProject} className="space-y-4 border-t border-slate-100 p-5">
            <ProjectFields units={units ?? []} people={owners} showUnit={isHead(me)} />
            <div className="flex justify-end">
              <SubmitButton pendingText="Creating…">Create project</SubmitButton>
            </div>
          </form>
        </details>
      )}

      {visible.length === 0 ? (
        <EmptyState title="No projects yet" body={isLead(me) ? "Create one above, then add tasks to it." : "Your manager hasn't set up any projects for your unit."} />
      ) : (
        <ul className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {visible.map((p) => {
            const s = stats.get(p.id) ?? { total: 0, done: 0, overdue: 0 };
            const pct = s.total ? Math.round((s.done / s.total) * 100) : 0;
            return (
              <li key={p.id}>
                <Link href={`/projects/${p.id}`} className="block h-full rounded-xl border border-slate-200 bg-white p-5 shadow-xs hover:border-slate-300">
                  <div className="flex items-start gap-3">
                    <span aria-hidden className="grid size-9 shrink-0 place-items-center rounded-lg bg-blue-50 text-blue-600">
                      <FolderKanban className="size-[18px]" />
                    </span>
                    <span className="min-w-0">
                      <span className="block font-semibold text-slate-900">{p.title}</span>
                      <span className="block text-sm text-slate-500">
                        {unitName.get(p.unit_id)} · {PROJECT_STATUS_LABEL[p.status]}
                      </span>
                    </span>
                  </div>
                  <div className="mt-4">
                    <ProgressBar value={pct} />
                  </div>
                  <p className="mt-2 text-sm text-slate-600">
                    {s.done}/{s.total} tasks done
                    {s.overdue > 0 && <span className="font-medium text-red-700"> · {s.overdue} overdue</span>}
                  </p>
                  <p className="mt-1 text-xs text-slate-500">
                    {personName.get(p.owner_id ?? "") ?? "No owner"}
                    {p.target_date && ` · target ${formatDate(p.target_date)}`}
                  </p>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </>
  );
}
