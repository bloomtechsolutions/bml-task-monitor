import Link from "next/link";
import {
  AlertTriangle, ArrowDownRight, ArrowRightLeft, ArrowUpRight, Ban, Building2, CalendarClock, CheckCircle2, Clock, Flag, Hourglass,
  IdCard, ListChecks, MessageSquare, Minus, Paperclip, Plane, PlusCircle, RotateCcw, ShieldCheck, Undo2, type LucideIcon,
} from "lucide-react";
import type { Profile } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { taskScope } from "@/lib/permissions";
import { addDays, dueLabel, formatDate, todayMV, PRIORITY_LABEL } from "@/lib/format";
import { StatusBadge } from "@/components/ui";
import type { Enums, Json, Tables } from "@/lib/database.types";

type Task = Tables<"task_overview">;
type Feed = "all" | "new" | "problems" | "done";
type Item = {
  key: string; at: string; actor: string; icon: LucideIcon; tone: string; verb: React.ReactNode; task: Task;
  note?: string | null; cat: ("important" | "done" | "problems")[];
};

const TZ = "Indian/Maldives";
const PENDING = new Set(["not_started", "in_progress", "blocked", "submitted"]);
const mvDay = (iso: string | null) => (iso ? new Intl.DateTimeFormat("en-CA", { timeZone: TZ }).format(new Date(iso)) : null);

function ago(iso: string | null): string {
  if (!iso) return "";
  const h = Math.round((Date.now() - Date.parse(iso)) / 3_600_000);
  if (h < 1) return "under an hour";
  if (h < 24) return `${h} hour${h === 1 ? "" : "s"}`;
  const d = Math.round(h / 24);
  return `${d} day${d === 1 ? "" : "s"}`;
}

function Delta({ now, prev, goodUp = true }: { now: number; prev: number; goodUp?: boolean }) {
  const diff = now - prev;
  if (diff === 0) {
    return (
      <span className="inline-flex items-center gap-0.5 text-xs text-slate-500">
        <Minus aria-hidden className="size-3" /> same as last week
      </span>
    );
  }
  const good = diff > 0 === goodUp;
  const Icon = diff > 0 ? ArrowUpRight : ArrowDownRight;
  return (
    <span className={`inline-flex items-center gap-0.5 text-xs font-medium ${good ? "text-emerald-700" : "text-red-700"}`}>
      <Icon aria-hidden className="size-3.5" />
      {Math.abs(diff)} vs last week
    </span>
  );
}

function Kpi({ href, icon: Icon, label, value, tone, foot }: { href: string; icon: LucideIcon; label: string; value: string | number; tone: string; foot: React.ReactNode }) {
  return (
    <Link href={href} className="rounded-xl border border-slate-200 bg-white px-4 py-3.5 shadow-xs transition-colors hover:border-slate-300">
      <p className="flex items-center gap-1.5 truncate text-sm text-slate-600">
        <Icon aria-hidden className={`size-4 shrink-0 ${tone}`} /> {label}
      </p>
      <p className={`mt-1.5 text-[28px] leading-none font-semibold tabular-nums ${tone}`}>{value}</p>
      <p className="mt-2 min-h-4 text-xs text-slate-500">{foot}</p>
    </Link>
  );
}

function Card({ title, action, children, id }: { title: string; action?: React.ReactNode; children: React.ReactNode; id?: string }) {
  return (
    <section aria-labelledby={id} className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-xs">
      <div className="flex items-center justify-between gap-2 px-5 pt-4 pb-3">
        <h2 id={id} className="font-semibold text-slate-900">
          {title}
        </h2>
        {action}
      </div>
      {children}
    </section>
  );
}

export async function LeaderDashboard({ me, unitName, feed: feedParam }: { me: Profile; unitName: string | null; feed?: string }) {
  const supabase = createClient();
  const today = todayMV();
  const since14 = new Date(Date.now() - 14 * 86_400_000).toISOString();
  const scope = taskScope(me);

  let tq = supabase.from("task_overview").select("*").order("updated_at", { ascending: false }).limit(3000);
  if (scope) tq = tq.or(scope);
  const [{ data: taskRows }, { data: events }, { data: updates }, { data: comments }, { data: people }, { data: away }, { data: units }] =
    await Promise.all([
      tq,
      supabase.from("task_events").select("id, task_id, actor_id, kind, detail, created_at").gte("created_at", since14).order("created_at", { ascending: false }).limit(600),
      supabase.from("task_updates").select("id, task_id, author_id, note, created_at, old_status, new_status, old_progress, new_progress, old_due_date, new_due_date").gte("created_at", since14).order("created_at", { ascending: false }).limit(600),
      supabase.from("task_comments").select("id, task_id, author_id, body, created_at").gte("created_at", since14).order("created_at", { ascending: false }).limit(300),
      supabase.from("profiles").select("id, full_name, unit_id, is_active"),
      supabase.from("leave").select("profile_id, start_date, end_date, kind").lte("start_date", addDays(today, 7)).gte("end_date", today).order("start_date"),
      supabase.from("units").select("id, name, code").eq("is_active", true).order("name"),
    ]);

  const tasks = new Map((taskRows ?? []).filter((t) => t.id).map((t) => [t.id!, t]));
  const name = new Map((people ?? []).map((p) => [p.id, p.full_name ?? "Someone"]));
  const who = (id: string | null) => (id ? name.get(id) ?? "Former member" : "System");
  const all = [...tasks.values()];
  const pending = all.filter((t) => PENDING.has(t.status ?? ""));

  // ---- Week at a glance (last 7 days vs the 7 before) ----
  const w0 = addDays(today, -6), p0 = addDays(today, -13), p1 = addDays(today, -7);
  const inRange = (d: string | null, a: string, b: string) => !!d && d >= a && d <= b;
  const finished = (t: Task) => (t.status === "done" ? mvDay(t.submitted_at ?? t.completed_at) : null);
  const doneNow = all.filter((t) => inRange(finished(t), w0, today));
  const donePrev = all.filter((t) => inRange(finished(t), p0, p1));
  const newNow = all.filter((t) => inRange(mvDay(t.created_at), w0, today)).length;
  const newPrev = all.filter((t) => inRange(mvDay(t.created_at), p0, p1)).length;
  const onTimeNow = doneNow.filter((t) => t.due_date && finished(t)! <= t.due_date).length;
  const overdue = pending.filter((t) => t.is_overdue);
  const newlyOverdue = overdue.filter((t) => inRange(t.due_date, w0, addDays(today, -1))).length;
  const blocked = pending.filter((t) => t.status === "blocked");
  const awaiting = pending.filter((t) => t.status === "submitted").sort((a, b) => (a.submitted_at ?? "").localeCompare(b.submitted_at ?? ""));

  // ---- Activity feed ----
  const items: Item[] = [];
  for (const e of events ?? []) {
    const t = tasks.get(e.task_id);
    if (!t) continue;
    const d = (e.detail && typeof e.detail === "object" && !Array.isArray(e.detail) ? e.detail : {}) as Record<string, Json>;
    const base = { key: `e${e.id}`, at: e.created_at, actor: who(e.actor_id), task: t };
    if (e.kind === "created") {
      items.push({ ...base, actor: d.recurring ? "Recurring schedule" : base.actor, icon: PlusCircle, tone: "bg-blue-100 text-blue-700", cat: ["important"],
        verb: <>assigned it to <b className="font-medium text-slate-800">{who(d.assignee_id as string)}</b></> });
    } else if (e.kind === "reassigned") {
      items.push({ ...base, icon: ArrowRightLeft, tone: "bg-indigo-100 text-indigo-700", cat: ["important"],
        verb: <>reassigned from {who(d.from as string)} to <b className="font-medium text-slate-800">{who(d.to as string)}</b></> });
    } else if (e.kind === "priority") {
      const up = ["high", "urgent"].includes(String(d.to));
      items.push({ ...base, icon: Flag, tone: "bg-orange-100 text-orange-700", cat: up ? ["important"] : [],
        verb: <>changed priority to <b className="font-medium text-slate-800">{PRIORITY_LABEL[d.to as Enums<"task_priority">] ?? String(d.to)}</b></> });
    } else if (e.kind === "file_added") {
      items.push({ ...base, icon: Paperclip, tone: "bg-violet-100 text-violet-700", cat: [], verb: <>attached evidence “{String(d.name)}”</> });
    } else if (e.kind === "checklist_done") {
      items.push({ ...base, icon: ListChecks, tone: "bg-emerald-50 text-emerald-700", cat: [], verb: <>ticked off “{String(d.body)}”</> });
    }
  }
  for (const u of updates ?? []) {
    const t = tasks.get(u.task_id);
    if (!t) continue;
    const base = { key: `u${u.id}`, at: u.created_at, actor: who(u.author_id), task: t, note: u.note };
    const from = u.old_status, to = u.new_status;
    if (to && to !== from) {
      if (to === "done" && from === "submitted") items.push({ ...base, icon: CheckCircle2, tone: "bg-emerald-100 text-emerald-700", cat: ["important", "done"], verb: <>approved and closed</> });
      else if (to === "done") items.push({ ...base, icon: CheckCircle2, tone: "bg-emerald-100 text-emerald-700", cat: ["important", "done"], verb: <>completed</> });
      else if (to === "submitted") items.push({ ...base, icon: ShieldCheck, tone: "bg-violet-100 text-violet-700", cat: ["important"], verb: <>submitted for sign-off</> });
      else if (from === "submitted") items.push({ ...base, icon: Undo2, tone: "bg-amber-100 text-amber-800", cat: ["important", "problems"], verb: <>sent back for changes</> });
      else if (to === "blocked") items.push({ ...base, icon: AlertTriangle, tone: "bg-amber-100 text-amber-800", cat: ["important", "problems"], verb: <>flagged as blocked</> });
      else if (to === "cancelled") items.push({ ...base, icon: Ban, tone: "bg-slate-200 text-slate-700", cat: ["important"], verb: <>cancelled</> });
      else if (from === "done" || from === "cancelled") items.push({ ...base, icon: RotateCcw, tone: "bg-sky-100 text-sky-700", cat: ["important"], verb: <>reopened</> });
      else items.push({ ...base, icon: Clock, tone: "bg-sky-100 text-sky-700", cat: [], verb: <>started work{u.new_progress ? ` (${u.new_progress}%)` : ""}</> });
    } else if (u.new_due_date && u.old_due_date && u.new_due_date !== u.old_due_date) {
      const later = u.new_due_date > u.old_due_date;
      items.push({ ...base, icon: CalendarClock, tone: later ? "bg-red-50 text-red-700" : "bg-slate-100 text-slate-600", cat: later ? ["important", "problems"] : ["important"],
        verb: <>moved the due date {later ? "back" : "forward"}: {formatDate(u.old_due_date)} → <b className="font-medium text-slate-800">{formatDate(u.new_due_date)}</b></> });
    } else if (u.new_progress !== null && u.new_progress !== u.old_progress) {
      items.push({ ...base, icon: Clock, tone: "bg-slate-100 text-slate-600", cat: [], verb: <>moved progress to {u.new_progress}%</> });
    } else if (u.note) {
      items.push({ ...base, icon: MessageSquare, tone: "bg-slate-100 text-slate-600", cat: [], verb: <>posted an update</> });
    }
  }
  for (const c of comments ?? []) {
    const t = tasks.get(c.task_id);
    if (t) items.push({ key: `c${c.id}`, at: c.created_at, actor: who(c.author_id), task: t, note: c.body, icon: MessageSquare, tone: "bg-blue-50 text-blue-700", cat: [], verb: <>commented</> });
  }
  items.sort((a, b) => b.at.localeCompare(a.at));

  // One row per task: its latest change, newest first (no duplicates).
  const latest = new Map<string, Item>();
  for (const it of items) if (it.task.id && !latest.has(it.task.id)) latest.set(it.task.id, it);
  const since = addDays(today, -13);
  // Also every open task (and anything finished recently) even if nobody has touched it in 14 days.
  for (const t of all) {
    if (!t.id || latest.has(t.id)) continue;
    const open = PENDING.has(t.status ?? "");
    const recentDone = t.status === "done" && (finished(t) ?? "") >= since;
    if (!open && !recentDone) continue;
    latest.set(t.id, {
      key: `t${t.id}`, at: t.updated_at ?? t.created_at ?? new Date(0).toISOString(), actor: "", task: t, cat: [],
      icon: Clock, tone: "bg-slate-100 text-slate-500", verb: <>No updates yet</>,
    });
  }
  const rows = [...latest.values()].sort((a, b) => b.at.localeCompare(a.at));
  const isNew = (t: Task) => (mvDay(t.created_at) ?? "") >= since;
  const isProblem = (r: Item) => !!r.task.is_overdue || r.task.status === "blocked" || r.cat.includes("problems");
  const isDone = (t: Task) => t.status === "done";
  const feed: Feed = feedParam === "new" || feedParam === "problems" || feedParam === "done" ? feedParam : "all";
  const counts = {
    all: rows.length,
    new: rows.filter((r) => isNew(r.task)).length,
    problems: rows.filter(isProblem).length,
    done: rows.filter((r) => isDone(r.task)).length,
  };
  const shown = rows
    .filter((r) => feed === "all" || (feed === "new" ? isNew(r.task) : feed === "problems" ? isProblem(r) : isDone(r.task)))
    .slice(0, 40);

  // ---- Needs attention ----
  const attention = [
    ...overdue.sort((a, b) => (b.days_overdue ?? 0) - (a.days_overdue ?? 0)).map((t) => ({ t, why: `${t.days_overdue} day${t.days_overdue === 1 ? "" : "s"} overdue`, tone: "text-red-700", icon: AlertTriangle })),
    ...blocked.filter((t) => !t.is_overdue).map((t) => ({ t, why: "Blocked", tone: "text-amber-700", icon: AlertTriangle })),
    ...awaiting.map((t) => ({ t, why: `Waiting for sign-off ${ago(t.submitted_at)}`, tone: "text-violet-700", icon: Hourglass })),
  ];

  // ---- Unit health ----
  const visibleUnits = (units ?? []).filter((u) => !me.unit_id || me.role === "head" || u.id === me.unit_id);
  const health = visibleUnits
    .map((u) => {
      const ts = all.filter((t) => t.unit_id === u.id);
      const p = ts.filter((t) => PENDING.has(t.status ?? ""));
      const od = p.filter((t) => t.is_overdue).length;
      const bl = p.filter((t) => t.status === "blocked").length;
      const done30 = ts.filter((t) => inRange(finished(t), addDays(today, -29), today));
      const ontime = done30.filter((t) => t.due_date && finished(t)! <= t.due_date).length;
      const state = od > 0 && od / Math.max(p.length, 1) >= 0.2 ? "red" : od > 0 || bl > 0 ? "amber" : "green";
      return { u, pending: p.length, overdue: od, blocked: bl, done7: ts.filter((t) => inRange(finished(t), w0, today)).length, ontime: done30.length ? Math.round((ontime / done30.length) * 100) : null, state };
    })
    .filter((x) => x.pending + x.done7 > 0 || visibleUnits.length <= 6);

  const upcoming = pending.filter((t) => !t.is_overdue && t.status !== "submitted" && (t.due_date ?? "") <= addDays(today, 7)).sort((a, b) => (a.due_date ?? "").localeCompare(b.due_date ?? ""));
  const scopeIds = new Set((people ?? []).filter((p) => p.is_active && (me.role === "head" || p.unit_id === me.unit_id)).map((p) => p.id));
  const awayNow = (away ?? []).filter((l) => scopeIds.has(l.profile_id));
  const mine = pending.filter((t) => t.assignee_id === me.id);
  const hour = Number(new Intl.DateTimeFormat("en-GB", { timeZone: TZ, hour: "numeric", hourCycle: "h23" }).format(new Date()));
  const scopeName = me.role === "head" ? "Retail Banking" : unitName ?? "your unit";
  const onTimePct = doneNow.length ? Math.round((onTimeNow / doneNow.length) * 100) : null;

  const headline =
    overdue.length + blocked.length + awaiting.length === 0
      ? `Everything in ${scopeName} is on track.`
      : [overdue.length && `${overdue.length} overdue`, blocked.length && `${blocked.length} blocked`, awaiting.length && `${awaiting.length} waiting for sign-off`]
          .filter(Boolean)
          .join(", ") + ` across ${scopeName}.`;

  return (
    <>
      <section className="mt-6 mb-7">
        <h1 className="text-2xl font-semibold tracking-tight text-slate-900 sm:text-[28px]">
          {hour < 12 ? "Good morning" : hour < 17 ? "Good afternoon" : "Good evening"}, {me.full_name?.split(" ")[0]}!
        </h1>
        <p className="mt-2 text-[15px] text-slate-600">{headline}</p>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          {me.designation && (
            <span className="inline-flex items-center gap-1.5 rounded-full bg-blue-50 px-2.5 py-1 text-xs font-medium text-blue-700 ring-1 ring-blue-200">
              <IdCard aria-hidden className="size-3.5" /> {me.designation}
            </span>
          )}
          <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-medium text-emerald-700 ring-1 ring-emerald-200">
            <Building2 aria-hidden className="size-3.5" /> {me.role === "head" ? "All units" : unitName ?? "My unit"}
          </span>
          <Link href="/tasks" className="inline-flex items-center gap-1.5 rounded-full bg-white px-2.5 py-1 text-xs font-medium text-slate-700 ring-1 ring-slate-200 hover:bg-slate-50">
            <ListChecks aria-hidden className="size-3.5" /> My own tasks: {mine.length} open{mine.some((t) => t.is_overdue) ? `, ${mine.filter((t) => t.is_overdue).length} overdue` : ""}
          </Link>
        </div>
      </section>

      <section aria-label="This week" className="mb-7 grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-4 xl:grid-cols-6">
        <Kpi href="/team" icon={ListChecks} label="Pending" value={pending.length} tone="text-blue-600" foot={`${pending.filter((t) => t.status === "in_progress").length} in progress`} />
        <Kpi href="/team?group=status#pending-h" icon={AlertTriangle} label="Overdue" value={overdue.length} tone={overdue.length ? "text-red-600" : "text-slate-900"} foot={newlyOverdue ? `${newlyOverdue} became overdue this week` : "none new this week"} />
        <Kpi href="/team?group=status#pending-h" icon={AlertTriangle} label="Blocked" value={blocked.length} tone={blocked.length ? "text-amber-600" : "text-slate-900"} foot={blocked.length ? "needs unblocking" : "nothing stuck"} />
        <Kpi href="/team?group=status#pending-h" icon={Hourglass} label="For sign-off" value={awaiting.length} tone={awaiting.length ? "text-violet-600" : "text-slate-900"} foot={awaiting[0] ? `oldest waiting ${ago(awaiting[0].submitted_at)}` : "nothing waiting"} />
        <Kpi href="/reports" icon={CheckCircle2} label="Done this week" value={doneNow.length} tone="text-emerald-600" foot={<Delta now={doneNow.length} prev={donePrev.length} />} />
        <Kpi href="/reports" icon={PlusCircle} label="New this week" value={newNow} tone="text-slate-900" foot={<Delta now={newNow} prev={newPrev} goodUp={false} />} />
      </section>

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-[minmax(0,1fr)_400px]">
        <Card
          id="feed-h"
          title="What's happening"
          action={<span className="text-xs text-slate-500">Open tasks and recent changes, newest first{onTimePct !== null ? ` · ${onTimePct}% finished on time this week` : ""}</span>}
        >
          <nav aria-label="Filter tasks" className="flex flex-wrap gap-1.5 px-5 pb-3">
            {(
              [
                ["all", "All"],
                ["new", "New"],
                ["problems", "Problems"],
                ["done", "Completed"],
              ] as const
            ).map(([f, label]) => (
              <Link
                key={f}
                href={f === "all" ? "/" : `/?feed=${f}`}
                scroll={false}
                aria-current={feed === f ? "true" : undefined}
                className={`rounded-full px-3 py-1 text-sm font-medium ${feed === f ? "bg-blue-600 text-white" : "bg-slate-100 text-slate-700 hover:bg-slate-200"}`}
              >
                {label} <span className="tabular-nums opacity-75">{counts[f]}</span>
              </Link>
            ))}
          </nav>
          {shown.length === 0 ? (
            <p className="border-t border-slate-100 px-5 py-10 text-center text-sm text-slate-500">
              {feed === "problems" ? "No problems right now." : "No task activity in the last 14 days yet."}
            </p>
          ) : (
            <ul className="divide-y divide-slate-100 border-t border-slate-100">
              {shown.map((r) => {
                const t = r.task;
                const Icon = r.icon;
                return (
                  <li key={t.id}>
                    <Link href={`/tasks/${t.id}`} className="group flex flex-col gap-2 px-5 py-3 hover:bg-slate-50 sm:flex-row sm:items-start sm:gap-4">
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-[15px] font-medium text-slate-900 group-hover:text-blue-700">{t.title}</p>
                        <p className="mt-0.5 truncate text-xs text-slate-500">
                          {t.assignee_name} · {t.unit_code} · created {formatDate(mvDay(t.created_at))}
                        </p>
                        <p className="mt-1.5 flex items-center gap-1.5 text-sm text-slate-600">
                          <span aria-hidden className={`grid size-5 shrink-0 place-items-center rounded-full ${r.tone}`}>
                            <Icon className="size-3" />
                          </span>
                          <span className="min-w-0 truncate">
                            {r.actor && <span className="font-medium text-slate-800">{r.actor} </span>}
                            {r.verb}
                          </span>
                          {r.actor && <span className="shrink-0 text-xs text-slate-400">· {ago(r.at)} ago</span>}
                        </p>
                      </div>
                      <div className="flex shrink-0 items-center gap-2 sm:flex-col sm:items-end">
                        {t.status && <StatusBadge status={t.status} />}
                        {t.status !== "done" && t.status !== "cancelled" && (
                          <span className={`text-xs ${t.is_overdue ? "font-semibold text-red-700" : "text-slate-500"}`}>{dueLabel(t.due_date, t.status)}</span>
                        )}
                      </div>
                    </Link>
                  </li>
                );
              })}
            </ul>
          )}
        </Card>

        <div className="space-y-6">
          <Card id="attn-h" title={`Needs attention${attention.length ? ` (${attention.length})` : ""}`} action={<Link href="/team?group=status#pending-h" className="text-sm font-medium text-blue-700 hover:underline">All</Link>}>
            {attention.length === 0 ? (
              <p className="border-t border-slate-100 px-5 py-6 text-sm text-emerald-800">Nothing overdue, blocked or waiting for sign-off.</p>
            ) : (
              <ul className="divide-y divide-slate-100 border-t border-slate-100">
                {attention.slice(0, 7).map(({ t, why, tone, icon: Icon }) => (
                  <li key={t.id}>
                    <Link href={`/tasks/${t.id}`} className="flex items-start gap-2.5 px-5 py-2.5 hover:bg-slate-50">
                      <Icon aria-hidden className={`mt-0.5 size-4 shrink-0 ${tone}`} />
                      <span className="min-w-0">
                        <span className="block truncate text-sm font-medium text-slate-900">{t.title}</span>
                        <span className="block truncate text-xs text-slate-500">
                          <span className={`font-medium ${tone}`}>{why}</span> · {t.assignee_name} · {t.unit_code}
                        </span>
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </Card>

          <Card id="units-h" title="Unit health" action={<Link href="/team" className="text-sm font-medium text-blue-700 hover:underline">Team overview</Link>}>
            {health.length === 0 ? (
              <p className="border-t border-slate-100 px-5 py-6 text-sm text-slate-500">No units yet.</p>
            ) : (
              <table className="w-full border-t border-slate-100 text-sm">
                <thead className="text-xs text-slate-500">
                  <tr>
                    <th scope="col" className="px-4 py-2 text-left font-medium sm:px-5">Unit</th>
                    <th scope="col" className="px-2 py-2 text-right font-medium">Pending</th>
                    <th scope="col" className="px-2 py-2 text-right font-medium">Overdue</th>
                    <th scope="col" className="px-4 py-2 text-right font-medium whitespace-nowrap sm:px-5">On time</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {health.map((h) => (
                    <tr key={h.u.id}>
                      <td className="px-4 py-2.5 sm:px-5">
                        <Link href={`/team?unit=${h.u.id}`} className="flex items-center gap-2 font-medium text-slate-900 hover:underline">
                          <span
                            aria-label={h.state === "red" ? "Needs attention" : h.state === "amber" ? "Watch" : "On track"}
                            className={`size-2.5 shrink-0 rounded-full ${h.state === "red" ? "bg-red-500" : h.state === "amber" ? "bg-amber-500" : "bg-emerald-500"}`}
                          />
                          <span className="truncate">{h.u.name}</span>
                        </Link>
                      </td>
                      <td className="px-2 py-2.5 text-right tabular-nums">{h.pending}</td>
                      <td className={`px-2 py-2.5 text-right tabular-nums ${h.overdue ? "font-semibold text-red-700" : "text-slate-400"}`}>{h.overdue}</td>
                      <td className="px-4 py-2.5 text-right tabular-nums text-slate-600 sm:px-5">{h.ontime === null ? "—" : `${h.ontime}%`}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
            <p className="flex flex-wrap gap-x-3 gap-y-1 border-t border-slate-100 px-5 py-2 text-xs text-slate-500">
              <span className="inline-flex items-center gap-1"><span aria-hidden className="size-2 rounded-full bg-emerald-500" /> On track</span>
              <span className="inline-flex items-center gap-1"><span aria-hidden className="size-2 rounded-full bg-amber-500" /> Something overdue or blocked</span>
              <span className="inline-flex items-center gap-1"><span aria-hidden className="size-2 rounded-full bg-red-500" /> 20%+ overdue</span>
            </p>
          </Card>

          <Card id="due-h" title="Due in the next 7 days" action={<Link href="/calendar?view=team" className="text-sm font-medium text-blue-700 hover:underline">Calendar</Link>}>
            {upcoming.length === 0 ? (
              <p className="border-t border-slate-100 px-5 py-6 text-sm text-slate-500">Nothing due this week.</p>
            ) : (
              <ul className="divide-y divide-slate-100 border-t border-slate-100">
                {upcoming.slice(0, 6).map((t) => (
                  <li key={t.id}>
                    <Link href={`/tasks/${t.id}`} className="flex items-center justify-between gap-3 px-5 py-2.5 hover:bg-slate-50">
                      <span className="min-w-0">
                        <span className="block truncate text-sm font-medium text-slate-900">{t.title}</span>
                        <span className="block truncate text-xs text-slate-500">
                          {t.assignee_name} · {t.progress ?? 0}% done
                        </span>
                      </span>
                      <span className="shrink-0 text-xs font-medium text-slate-600">{dueLabel(t.due_date, t.status)}</span>
                    </Link>
                  </li>
                ))}
                {upcoming.length > 6 && <li className="px-5 py-2 text-xs text-slate-500">+{upcoming.length - 6} more on the calendar</li>}
              </ul>
            )}
          </Card>

          {awayNow.length > 0 && (
            <Card id="away-h" title="Away this week" action={<Link href="/leave" className="text-sm font-medium text-blue-700 hover:underline">Leave</Link>}>
              <ul className="divide-y divide-slate-100 border-t border-slate-100">
                {awayNow.slice(0, 6).map((l, i) => (
                  <li key={i} className="flex items-center gap-2.5 px-5 py-2.5 text-sm">
                    <Plane aria-hidden className={`size-4 ${l.start_date <= today ? "text-amber-600" : "text-slate-400"}`} />
                    <span className="min-w-0 flex-1 truncate font-medium text-slate-900">{who(l.profile_id)}</span>
                    <span className="shrink-0 text-xs text-slate-500">
                      {l.start_date <= today ? "Away now" : `From ${formatDate(l.start_date)}`} · until {formatDate(l.end_date)}
                    </span>
                  </li>
                ))}
              </ul>
            </Card>
          )}
        </div>
      </div>
    </>
  );
}
