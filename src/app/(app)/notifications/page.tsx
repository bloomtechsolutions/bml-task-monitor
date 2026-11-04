import { Bell, CheckCheck } from "lucide-react";
import { requirePerson } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { formatDateTime } from "@/lib/format";
import { markAllRead, openNotification } from "@/app/feature-actions";
import { PageHeader, EmptyState } from "@/components/ui";
import { SubmitButton } from "@/components/submit-button";

export const metadata = { title: "Notifications · Task Monitor" };

const TEXT: Record<string, (actor: string, title: string) => string> = {
  assigned: (a, t) => `${a} assigned you “${t}”`,
  submitted: (a, t) => `${a} finished “${t}” and needs your sign-off`,
  approved: (a, t) => `${a} approved “${t}”`,
  returned: (a, t) => `${a} sent “${t}” back for changes`,
  completed: (a, t) => `${a} completed “${t}”`,
  blocked: (a, t) => `${a} is blocked on “${t}”`,
  comment: (a, t) => `${a} commented on “${t}”`,
  due_soon: (_a, t) => `“${t}” is due tomorrow`,
  due_today: (_a, t) => `“${t}” is due today`,
  overdue: (_a, t) => `“${t}” is overdue`,
  overdue_assigned: (a, t) => `“${t}” (${a}) is overdue`,
  escalated: (a, t) => `Escalation: “${t}” assigned to ${a} is overdue`,
  digest: () => "Your weekly summary",
};

const TONE: Record<string, string> = {
  overdue: "bg-red-500", overdue_assigned: "bg-red-500", escalated: "bg-red-600", blocked: "bg-amber-500",
  submitted: "bg-violet-500", returned: "bg-amber-500", approved: "bg-emerald-500", completed: "bg-emerald-500",
};

export default async function NotificationsPage() {
  const me = await requirePerson();
  const supabase = createClient();
  const { data: rows } = await supabase
    .from("notifications")
    .select("id, kind, body, sent_at, read_at, task_id, actor_id")
    .eq("recipient_id", me.id)
    .order("sent_at", { ascending: false })
    .limit(100);

  const taskIds = [...new Set((rows ?? []).map((r) => r.task_id).filter((x): x is string => !!x))];
  const actorIds = [...new Set((rows ?? []).map((r) => r.actor_id).filter((x): x is string => !!x))];
  const [{ data: tasks }, { data: actors }] = await Promise.all([
    taskIds.length ? supabase.from("tasks").select("id, title").in("id", taskIds) : Promise.resolve({ data: [] as { id: string; title: string }[] }),
    actorIds.length ? supabase.from("profiles").select("id, full_name").in("id", actorIds) : Promise.resolve({ data: [] as { id: string; full_name: string | null }[] }),
  ]);
  const titles = new Map((tasks ?? []).map((t) => [t.id, t.title]));
  const names = new Map((actors ?? []).map((a) => [a.id, a.full_name ?? "Someone"]));
  const unread = (rows ?? []).filter((r) => !r.read_at).length;

  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader
        title="Notifications"
        subtitle={unread ? `${unread} unread` : "You're up to date."}
        action={
          unread > 0 ? (
            <form action={markAllRead}>
              <SubmitButton variant="secondary" pendingText="Marking…">
                <CheckCheck aria-hidden className="mr-1.5 size-4" /> Mark all as read
              </SubmitButton>
            </form>
          ) : undefined
        }
      />
      {(rows ?? []).length === 0 ? (
        <EmptyState title="No notifications yet" body="You'll hear about new assignments, sign-offs, comments, due dates and escalations here." />
      ) : (
        <ul className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-xs">
          {rows!.map((n) => {
            const text = (TEXT[n.kind] ?? (() => n.kind))(names.get(n.actor_id ?? "") ?? "Someone", titles.get(n.task_id ?? "") ?? "a task");
            return (
              <li key={n.id} className="border-b border-slate-100 last:border-b-0">
                <form action={openNotification}>
                  <input type="hidden" name="id" value={n.id} />
                  <button type="submit" className={`flex w-full items-start gap-3 px-4 py-3 text-left hover:bg-slate-50 ${n.read_at ? "" : "bg-blue-50/50"}`}>
                    <span aria-hidden className="relative mt-0.5 grid size-8 shrink-0 place-items-center rounded-full bg-slate-100 text-slate-500">
                      <Bell className="size-4" />
                      <span className={`absolute -top-0.5 -right-0.5 size-2.5 rounded-full ring-2 ring-white ${TONE[n.kind] ?? "bg-blue-500"}`} />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className={`block text-[15px] ${n.read_at ? "text-slate-700" : "font-medium text-slate-900"}`}>{text}</span>
                      {n.body && <span className="mt-0.5 block text-sm text-slate-600">{n.body}</span>}
                      <span className="mt-0.5 block text-xs text-slate-400">{formatDateTime(n.sent_at)}</span>
                    </span>
                    {!n.read_at && <span className="sr-only">Unread</span>}
                  </button>
                </form>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
