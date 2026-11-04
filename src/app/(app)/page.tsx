import Link from "next/link";
import {
  AlertTriangle,
  ArrowRight,
  BarChart3,
  Building2,
  CalendarClock,
  CheckCircle2,
  Hourglass,
  IdCard,
  ListChecks,
  Plus,
  SquareArrowOutUpRight,
  Users,
} from "lucide-react";
import { requirePerson } from "@/lib/auth";
import { isLead, scopedOr } from "@/lib/permissions";
import { LeaderDashboard } from "./leader-dashboard";
import { createClient } from "@/lib/supabase/server";
import { addDays, todayMV } from "@/lib/format";
import { Notice } from "@/components/ui";
import { TaskListItem, type TaskRow } from "@/components/task-row";

const TZ = "Indian/Maldives";

function greeting(): string {
  const hour = Number(new Intl.DateTimeFormat("en-GB", { timeZone: TZ, hour: "numeric", hourCycle: "h23" }).format(new Date()));
  return hour < 12 ? "Good morning" : hour < 17 ? "Good afternoon" : "Good evening";
}

const TONES = {
  blue: { icon: "text-blue-600", value: "text-blue-600" },
  red: { icon: "text-red-600", value: "text-red-600" },
  amber: { icon: "text-amber-600", value: "text-amber-600" },
  green: { icon: "text-emerald-600", value: "text-emerald-600" },
} as const;

function StatCard({
  href,
  icon: Icon,
  label,
  value,
  hint,
  tone,
}: {
  href: string;
  icon: typeof ListChecks;
  label: string;
  value: number;
  hint: string;
  tone: keyof typeof TONES;
}) {
  const t = TONES[tone];
  return (
    <Link
      href={href}
      className="group rounded-xl border border-slate-200 bg-white px-5 py-4 shadow-xs transition-colors hover:border-slate-300"
    >
      <p className="flex items-center gap-2 text-[15px] text-slate-700">
        <Icon aria-hidden className={`size-[18px] ${t.icon}`} />
        {label}
      </p>
      <p className={`mt-2 text-3xl font-semibold tabular-nums ${t.value}`}>{value}</p>
      <p className="mt-1 text-sm text-slate-500">{hint}</p>
    </Link>
  );
}

function QuickLink({ href, icon: Icon, title, body, tone }: { href: string; icon: typeof ListChecks; title: string; body: string; tone: string }) {
  return (
    <Link href={href} className="group flex items-center gap-3 rounded-lg bg-slate-50 px-3 py-3 hover:bg-slate-100">
      <span aria-hidden className={`grid size-9 shrink-0 place-items-center rounded-lg ${tone}`}>
        <Icon className="size-[18px]" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-[15px] font-medium text-slate-900">{title}</span>
        <span className="block truncate text-sm text-slate-500">{body}</span>
      </span>
      <ArrowRight aria-hidden className="size-4 shrink-0 text-slate-400 group-hover:translate-x-0.5 group-hover:text-slate-700" />
    </Link>
  );
}

const rank = (t: TaskRow) => (t.is_overdue ? 0 : t.status === "blocked" ? 1 : t.priority === "urgent" ? 2 : t.priority === "high" ? 3 : 4);

export default async function DashboardPage({ searchParams }: { searchParams: Promise<{ feed?: string }> }) {
  const [person, sp] = await Promise.all([requirePerson(), searchParams]);

  // Heads and unit managers get the "what's happening" front page; staff get their personal dashboard.
  if (isLead(person)) {
    const { data: u } = person.unit_id ? await createClient().from("units").select("name").eq("id", person.unit_id).maybeSingle() : { data: null };
    return <LeaderDashboard me={person} unitName={u?.name ?? null} feed={sp.feed} />;
  }

  const supabase = createClient();
  const since = new Date(Date.now() - 30 * 86_400_000).toISOString();
  const [{ data: mine, error }, { data: delegated }, { data: unit }] = await Promise.all([
    supabase
      .from("task_overview")
      .select("*")
      .eq("assignee_id", person.id)
      .neq("status", "cancelled")
      .or(`status.neq.done,completed_at.gte.${since}`)
      .order("due_date")
      .limit(500),
    // Work I follow up on: tasks I assigned, plus (for managers/head) anything in scope waiting for sign-off.
    supabase
      .from("task_overview")
      .select("*")
      .neq("assignee_id", person.id)
      .in("status", ["not_started", "in_progress", "blocked", "submitted"])
      .or(scopedOr(person, `assigned_by.eq.${person.id},status.eq.submitted`) ?? `assigned_by.eq.${person.id},status.eq.submitted`)
      .order("due_date")
      .limit(500),
    person.unit_id
      ? supabase.from("units").select("name").eq("id", person.unit_id).maybeSingle()
      : Promise.resolve({ data: null }),
  ]);

  const weekEnd = addDays(todayMV(), 7);
  const tasks = mine ?? [];
  const open = tasks.filter((t) => t.status !== "done" && t.status !== "submitted");
  const overdue = open.filter((t) => t.is_overdue);
  const dueWeek = open.filter((t) => !t.is_overdue && (t.due_date ?? "") <= weekEnd);
  const done30 = tasks.filter((t) => t.status === "done");

  const priority = [...open]
    .filter((t) => t.is_overdue || t.status === "blocked" || (t.due_date ?? "") <= weekEnd || t.priority === "urgent" || t.priority === "high")
    .sort((a, b) => rank(a) - rank(b) || (a.due_date ?? "").localeCompare(b.due_date ?? ""))
    .slice(0, 6);

  const awaiting = (delegated ?? []).filter((t) => t.status === "submitted");
  const waiting = [...awaiting, ...(delegated ?? []).filter((t) => t.assigned_by === person.id && (t.is_overdue || t.status === "blocked"))];
  const firstName = person.full_name?.split(" ")[0] ?? "there";

  return (
    <>
      <section className="mt-6 mb-8">
        <h1 className="text-2xl font-semibold tracking-tight text-slate-900 sm:text-[28px]">
          {greeting()}, {firstName}!
        </h1>
        <p className="mt-2 text-[15px] text-slate-600">
          {overdue.length
            ? `You have ${overdue.length} overdue task${overdue.length === 1 ? "" : "s"}. Let's clear ${overdue.length === 1 ? "it" : "them"} first.`
            : open.length
              ? "Here's where your work stands today."
              : "You're all caught up. Nice work."}
        </p>
        <div className="mt-3 flex flex-wrap gap-2">
          {person.designation && (
            <span className="inline-flex items-center gap-1.5 rounded-full bg-blue-50 px-2.5 py-1 text-xs font-medium text-blue-700 ring-1 ring-blue-200">
              <IdCard aria-hidden className="size-3.5" />
              {person.designation}
            </span>
          )}
          <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-medium text-emerald-700 ring-1 ring-emerald-200">
            <Building2 aria-hidden className="size-3.5" />
            {unit?.name ?? "Retail Banking"}
          </span>
        </div>
      </section>

      {error && <Notice tone="error">Couldn&apos;t load your tasks. Refresh to try again.</Notice>}

      <section aria-label="Summary" className="mb-6 grid grid-cols-2 gap-3 sm:gap-4 xl:grid-cols-4">
        <StatCard href="/tasks" icon={ListChecks} label="Open tasks" value={open.length} hint="Assigned to you" tone="blue" />
        <StatCard href="/tasks" icon={AlertTriangle} label="Overdue" value={overdue.length} hint="Need attention now" tone="red" />
        <StatCard href="/tasks" icon={CalendarClock} label="Due this week" value={dueWeek.length} hint="Next 7 days" tone="amber" />
        <StatCard href="/tasks" icon={CheckCircle2} label="Completed" value={done30.length} hint="Last 30 days" tone="green" />
      </section>



      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_380px]">
        <section aria-labelledby="priority-h" className="flex min-h-[420px] flex-col overflow-hidden rounded-xl border border-slate-200 bg-white shadow-xs">
          <div className="flex items-start justify-between gap-3 px-6 pt-6 pb-4">
            <div>
              <h2 id="priority-h" className="text-[17px] font-semibold text-slate-900">
                Priority tasks
              </h2>
              <p className="mt-0.5 text-sm text-slate-500">
                {priority.length ? "Overdue, blocked, urgent and due soon" : "Nothing urgent right now"}
              </p>
            </div>
            <Link href="/tasks" className="inline-flex items-center gap-1.5 text-[15px] font-medium text-slate-800 hover:text-blue-700">
              View all
              <SquareArrowOutUpRight aria-hidden className="size-4" />
            </Link>
          </div>
          {priority.length ? (
            <ul className="divide-y divide-slate-100 border-t border-slate-100">
              {priority.map((t) => (
                <TaskListItem key={t.id} task={t} showPerson="assigner" />
              ))}
            </ul>
          ) : (
            <div className="flex flex-1 flex-col items-center justify-center px-6 pb-10 text-center">
              <span aria-hidden className="mb-4 grid size-16 place-items-center rounded-full bg-slate-100 text-slate-500">
                <CheckCircle2 className="size-7" />
              </span>
              <p className="text-[17px] font-medium text-slate-900">You&apos;re all caught up</p>
              <p className="mt-1 text-[15px] text-slate-600">No overdue, blocked or due-soon tasks on your list.</p>
              <Link
                href="/tasks/new"
                className="mt-5 inline-flex min-h-10 items-center gap-2 rounded-lg bg-blue-600 px-4 text-[15px] font-medium text-white hover:bg-blue-700"
              >
                <Plus aria-hidden className="size-4" />
                Assign a task
              </Link>
            </div>
          )}
        </section>

        <div className="space-y-6">
          <section aria-labelledby="links-h" className="rounded-xl border border-slate-200 bg-white p-6 shadow-xs">
            <h2 id="links-h" className="mb-5 text-[17px] font-semibold text-slate-900">
              Quick links
            </h2>
            <div className="space-y-2">
              <QuickLink href="/tasks/new" icon={Plus} title="Add a task" body="Track something you need to do" tone="bg-blue-100 text-blue-700" />
              <QuickLink href="/board" icon={BarChart3} title="My board" body="Move your tasks between stages" tone="bg-violet-100 text-violet-700" />
              <QuickLink href="/leave" icon={Users} title="Leave" body="Record time away" tone="bg-emerald-100 text-emerald-700" />
            </div>
          </section>

          {waiting.length ? (
            <section aria-labelledby="waiting-h" className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-xs">
              <div className="flex items-center justify-between px-6 pt-6 pb-3">
                <h2 id="waiting-h" className="text-[17px] font-semibold text-slate-900">
                  Needs your follow-up <span className="ml-1 font-normal tabular-nums text-slate-500">{waiting.length}</span>
                </h2>
                <Link href={awaiting.length ? "/board" : "/tasks?view=assigned"} className="text-sm font-medium text-blue-700 hover:underline">
                  See all
                </Link>
              </div>
              <p className="-mt-1 px-6 pb-3 text-sm text-slate-500">
                {awaiting.length ? `${awaiting.length} waiting for your sign-off · ` : ""}overdue or blocked work you assigned
              </p>
              <ul className="divide-y divide-slate-100 border-t border-slate-100">
                {waiting.slice(0, 4).map((t) => (
                  <TaskListItem key={t.id} task={t} showPerson="assignee" compact />
                ))}
              </ul>
            </section>
          ) : (
            <section className="flex flex-col items-center rounded-xl border border-dashed border-slate-300 px-6 py-10 text-center">
              <span aria-hidden className="mb-3 grid size-11 place-items-center rounded-full bg-blue-50 text-blue-600">
                <Hourglass className="size-5" />
              </span>
              <p className="font-medium text-slate-900">Nothing waiting on others</p>
              <p className="mt-1 text-sm text-slate-500">
                {(delegated ?? []).length
                  ? `${delegated!.length} task${delegated!.length === 1 ? "" : "s"} you follow ${delegated!.length === 1 ? "is" : "are"} on track.`
                  : "Tasks you assign will be tracked here."}
              </p>
            </section>
          )}
        </div>
      </div>
    </>
  );
}
