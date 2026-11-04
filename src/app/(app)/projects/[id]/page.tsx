import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, Plus } from "lucide-react";
import { requirePerson } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { isHead, isLead, scopedOr } from "@/lib/permissions";
import { formatDate } from "@/lib/format";
import { saveProject } from "@/app/feature-actions";
import { PageHeader, Notice, EmptyState, ProgressBar, ButtonLink } from "@/components/ui";
import { SubmitButton } from "@/components/submit-button";
import { TaskGroup } from "@/components/task-row";
import { ProjectFields, PROJECT_STATUS_LABEL } from "@/components/project-fields";

export default async function ProjectPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ error?: string; saved?: string }> }) {
  const [{ id }, sp, me] = await Promise.all([params, searchParams, requirePerson()]);
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const supabase = createClient();
  const { data: project } = await supabase.from("projects").select("*").eq("id", id).maybeSingle();
  if (!project) notFound();

  const scope = scopedOr(me);
  let tq = supabase.from("task_overview").select("*").eq("project_id", id).neq("status", "cancelled").order("due_date");
  if (scope) tq = tq.or(scope);
  const [{ data: tasks }, { data: units }, { data: people }] = await Promise.all([
    tq,
    supabase.from("units").select("id, name").order("name"),
    supabase.from("profiles").select("id, full_name, unit_id").eq("is_active", true).order("full_name"),
  ]);
  const canSee = isHead(me) || project.unit_id === me.unit_id || (tasks ?? []).length > 0;
  if (!canSee) notFound();
  const canEdit = isHead(me) || (isLead(me) && project.unit_id === me.unit_id);

  const all = tasks ?? [];
  const done = all.filter((t) => t.status === "done");
  const pct = all.length ? Math.round((done.length / all.length) * 100) : 0;
  const owner = (people ?? []).find((p) => p.id === project.owner_id);

  return (
    <div className="mx-auto max-w-5xl">
      <Link href="/projects" className="mb-3 inline-flex items-center gap-1 text-sm text-slate-600 hover:text-slate-900">
        <ArrowLeft aria-hidden className="size-4" /> Projects
      </Link>
      <PageHeader
        title={project.title}
        subtitle={[(units ?? []).find((u) => u.id === project.unit_id)?.name, PROJECT_STATUS_LABEL[project.status], owner?.full_name && `Owner: ${owner.full_name}`, project.target_date && `Target ${formatDate(project.target_date)}`].filter(Boolean).join(" · ")}
        action={
          <ButtonLink href={`/tasks/new?project=${project.id}`}>
            <Plus aria-hidden className="size-4" /> Add task
          </ButtonLink>
        }
      />
      {sp.saved && <Notice tone="success">Project saved.</Notice>}
      {sp.error && <Notice tone="error">{sp.error}</Notice>}
      {project.description && <p className="mb-5 max-w-3xl whitespace-pre-wrap text-[15px] text-slate-700">{project.description}</p>}

      <section className="mb-6 rounded-xl border border-slate-200 bg-white p-5 shadow-xs">
        <div className="max-w-md">
          <ProgressBar value={pct} />
        </div>
        <p className="mt-2 text-sm text-slate-600">
          {done.length} of {all.length} tasks done · {all.filter((t) => t.is_overdue).length} overdue · {all.filter((t) => t.status === "blocked").length} blocked
        </p>
      </section>

      {all.length === 0 ? (
        <EmptyState title="No tasks in this project yet" body="Add the first task to start tracking progress." />
      ) : (
        <>
          <TaskGroup title="Overdue" tasks={all.filter((t) => t.is_overdue)} showPerson="both" tone="danger" />
          <TaskGroup title="Open" tasks={all.filter((t) => !t.is_overdue && t.status !== "done")} showPerson="both" />
          <TaskGroup title="Done" tasks={done} showPerson="both" collapsed />
        </>
      )}

      {canEdit && (
        <details className="mt-6 overflow-hidden rounded-xl border border-slate-200 bg-white shadow-xs">
          <summary className="cursor-pointer px-5 py-3.5 font-semibold text-slate-900">Edit project</summary>
          <form action={saveProject} className="space-y-4 border-t border-slate-100 p-5">
            <input type="hidden" name="id" value={project.id} />
            <ProjectFields p={project} units={units ?? []} people={(people ?? []).filter((p) => isHead(me) || p.unit_id === me.unit_id)} showUnit={isHead(me)} />
            <div className="flex justify-end">
              <SubmitButton variant="secondary">Save project</SubmitButton>
            </div>
          </form>
        </details>
      )}
    </div>
  );
}
