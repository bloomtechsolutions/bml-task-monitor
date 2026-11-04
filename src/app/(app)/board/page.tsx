import Link from "next/link";
import { requirePerson } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { isLead, scopedOr } from "@/lib/permissions";
import { PageHeader, Notice } from "@/components/ui";
import { Board } from "./board";

export const metadata = { title: "Board" };

export default async function BoardPage({ searchParams }: { searchParams: Promise<{ view?: string }> }) {
  const [me, sp] = await Promise.all([requirePerson(), searchParams]);
  const view = sp.view === "team" && isLead(me) ? "team" : "mine";
  const since = new Date(Date.now() - 14 * 86_400_000).toISOString();

  let q = createClient()
    .from("task_overview")
    .select("*")
    .neq("status", "cancelled")
    .order("due_date")
    .limit(400);
  const recent = `status.neq.done,completed_at.gte.${since}`;
  q = view === "mine" ? q.eq("assignee_id", me.id).or(recent) : q.or(scopedOr(me, recent)!);
  const { data, error } = await q;

  return (
    <>
      <PageHeader
        title="Board"
        subtitle="Drag a card to change its status, or use the menu on each card."
        action={
          isLead(me) ? (
            <div role="tablist" aria-label="Board view" className="inline-flex rounded-lg border border-slate-300 bg-white p-0.5">
              {(
                [
                  ["mine", "My tasks"],
                  ["team", me.role === "head" ? "Everyone" : "My unit"],
                ] as const
              ).map(([v, label]) => (
                <Link
                  key={v}
                  role="tab"
                  aria-selected={view === v}
                  href={v === "mine" ? "/board" : "/board?view=team"}
                  className={`rounded-md px-3 py-1.5 text-sm font-medium ${view === v ? "bg-blue-600 text-white" : "text-slate-700 hover:bg-slate-100"}`}
                >
                  {label}
                </Link>
              ))}
            </div>
          ) : undefined
        }
      />
      {error && <Notice tone="error">Couldn&apos;t load tasks.</Notice>}
      <Board tasks={data ?? []} meId={me.id} showAssignee={view === "team"} />
    </>
  );
}
