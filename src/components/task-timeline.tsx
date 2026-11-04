import Link from "next/link";
import {
  ArrowRightLeft, CheckCircle2, CheckSquare, CircleDot, Flag, GitBranch, History, ListPlus, MessageSquare, Paperclip, PlusCircle,
  RotateCcw, ShieldCheck, Square, Trash2, Undo2, XCircle, type LucideIcon,
} from "lucide-react";
import type { Enums, Json } from "@/lib/database.types";
import { formatDate, PRIORITY_LABEL, STATUS_LABEL } from "@/lib/format";

export type RawUpdate = {
  id: string; created_at: string; author_id: string | null; note: string | null;
  old_status: Enums<"task_status"> | null; new_status: Enums<"task_status"> | null;
  old_progress: number | null; new_progress: number | null; old_due_date: string | null; new_due_date: string | null;
};
export type RawComment = { id: string; created_at: string; author_id: string | null; body: string };
export type RawEvent = { id: string; created_at: string; actor_id: string | null; kind: string; detail: Json };

type Item = {
  key: string;
  at: string;
  actor: string;
  icon: LucideIcon;
  tone: string;
  text: React.ReactNode;
  note?: string | null;
  comment?: string;
  type: "comment" | "change";
};

const TZ = "Indian/Maldives";
const time = (iso: string) => new Date(iso).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", timeZone: TZ });
const dayKey = (iso: string) => new Intl.DateTimeFormat("en-CA", { timeZone: TZ }).format(new Date(iso));

function dayLabel(key: string): string {
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: TZ }).format(new Date());
  const y = new Date(Date.now() - 86_400_000);
  const yesterday = new Intl.DateTimeFormat("en-CA", { timeZone: TZ }).format(y);
  if (key === today) return "Today";
  if (key === yesterday) return "Yesterday";
  return new Date(`${key}T00:00:00Z`).toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });
}

const q = (s: unknown) => <span className="font-medium text-slate-800">“{String(s ?? "")}”</span>;

function fromUpdate(u: RawUpdate, name: (id: string | null) => string): Item {
  const base = { key: `u-${u.id}`, at: u.created_at, actor: name(u.author_id), note: u.note, type: "change" as const };
  const statusChanged = u.new_status && u.new_status !== u.old_status;
  const extra: string[] = [];
  if (u.new_progress !== null && u.new_progress !== u.old_progress && !["done", "submitted"].includes(u.new_status ?? "")) {
    extra.push(`progress ${u.old_progress ?? 0}% → ${u.new_progress}%`);
  }
  if (u.new_due_date && u.new_due_date !== u.old_due_date) extra.push(`due date ${formatDate(u.old_due_date)} → ${formatDate(u.new_due_date)}`);
  const tail = extra.length ? <span className="text-slate-500"> · {extra.join(" · ")}</span> : null;

  if (statusChanged) {
    const from = u.old_status, to = u.new_status!;
    if (to === "submitted") return { ...base, icon: ShieldCheck, tone: "bg-violet-100 text-violet-700", text: <>submitted the task for sign-off{tail}</> };
    if (from === "submitted" && to === "done") return { ...base, icon: CheckCircle2, tone: "bg-emerald-100 text-emerald-700", text: <>approved and closed the task{tail}</> };
    if (from === "submitted") return { ...base, icon: Undo2, tone: "bg-amber-100 text-amber-800", text: <>sent the task back for changes{tail}</> };
    if (to === "done") return { ...base, icon: CheckCircle2, tone: "bg-emerald-100 text-emerald-700", text: <>marked the task done{tail}</> };
    if (to === "cancelled") return { ...base, icon: XCircle, tone: "bg-slate-200 text-slate-700", text: <>cancelled the task{tail}</> };
    if (from === "cancelled" || from === "done") return { ...base, icon: RotateCcw, tone: "bg-sky-100 text-sky-700", text: <>reopened the task{tail}</> };
    if (to === "blocked") return { ...base, icon: Flag, tone: "bg-amber-100 text-amber-800", text: <>marked the task blocked{tail}</> };
    return {
      ...base, icon: CircleDot, tone: "bg-sky-100 text-sky-700",
      text: <>changed status from {STATUS_LABEL[from ?? "not_started"]} to <span className="font-medium text-slate-800">{STATUS_LABEL[to]}</span>{tail}</>,
    };
  }
  if (extra.length) return { ...base, icon: History, tone: "bg-slate-100 text-slate-600", text: <>updated {extra.join(" · ")}</> };
  return { ...base, icon: History, tone: "bg-slate-100 text-slate-600", text: <>posted an update</> };
}

function fromEvent(e: RawEvent, name: (id: string | null) => string): Item | null {
  const d = (e.detail && typeof e.detail === "object" && !Array.isArray(e.detail) ? e.detail : {}) as Record<string, Json>;
  const base = { key: `e-${e.id}`, at: e.created_at, actor: e.actor_id ? name(e.actor_id) : "System", type: "change" as const };
  switch (e.kind) {
    case "created":
      return {
        ...base, icon: PlusCircle, tone: "bg-blue-100 text-blue-700",
        text: d.recurring ? (
          <>created this task from a recurring schedule for <span className="font-medium text-slate-800">{name(d.assignee_id as string)}</span></>
        ) : (
          <>
            created the task and assigned it to <span className="font-medium text-slate-800">{name(d.assignee_id as string)}</span>
            {d.due_date ? <span className="text-slate-500"> · due {formatDate(String(d.due_date))}</span> : null}
            {d.requires_approval ? <span className="text-slate-500"> · needs sign-off</span> : null}
          </>
        ),
      };
    case "reassigned":
      return {
        ...base, icon: ArrowRightLeft, tone: "bg-indigo-100 text-indigo-700",
        text: <>reassigned the task from {name(d.from as string)} to <span className="font-medium text-slate-800">{name(d.to as string)}</span></>,
      };
    case "priority":
      return {
        ...base, icon: Flag, tone: "bg-orange-100 text-orange-700",
        text: <>changed priority from {PRIORITY_LABEL[d.from as Enums<"task_priority">] ?? d.from} to <span className="font-medium text-slate-800">{PRIORITY_LABEL[d.to as Enums<"task_priority">] ?? d.to}</span></>,
      };
    case "checklist_added": {
      const items = Array.isArray(d.items) ? d.items : [];
      return {
        ...base, icon: ListPlus, tone: "bg-emerald-50 text-emerald-700",
        text: items.length === 1 ? <>added checklist step {q(items[0])}</> : <>added {items.length} checklist steps: {items.map(String).join(", ")}</>,
      };
    }
    case "checklist_done":
      return { ...base, icon: CheckSquare, tone: "bg-emerald-100 text-emerald-700", text: <>ticked off {q(d.body)}</> };
    case "checklist_undone":
      return { ...base, icon: Square, tone: "bg-slate-100 text-slate-600", text: <>unticked {q(d.body)}</> };
    case "checklist_removed":
      return { ...base, icon: Trash2, tone: "bg-slate-100 text-slate-600", text: <>removed checklist step {q(d.body)}</> };
    case "file_added":
      return { ...base, icon: Paperclip, tone: "bg-violet-100 text-violet-700", text: <>attached {q(d.name)}</> };
    case "file_removed":
      return { ...base, icon: Trash2, tone: "bg-slate-100 text-slate-600", text: <>removed file {q(d.name)}</> };
    case "subtask_added":
      return {
        ...base, icon: GitBranch, tone: "bg-blue-50 text-blue-700",
        text: (
          <>
            added sub-task{" "}
            {d.task_id ? (
              <Link href={`/tasks/${d.task_id}`} className="font-medium text-blue-700 hover:underline">
                “{String(d.title)}”
              </Link>
            ) : (
              q(d.title)
            )}
          </>
        ),
      };
    default:
      return null;
  }
}

export function TaskTimeline({
  updates, comments, events, names, filter, taskId,
}: {
  updates: RawUpdate[];
  comments: RawComment[];
  events: RawEvent[];
  names: Map<string, string>;
  filter: "all" | "comments" | "changes";
  taskId: string;
}) {
  const name = (id: string | null) => (id ? names.get(id) ?? "Former member" : "Someone");
  const all: Item[] = [
    ...updates.map((u) => fromUpdate(u, name)),
    ...comments.map((c): Item => ({
      key: `c-${c.id}`, at: c.created_at, actor: name(c.author_id), icon: MessageSquare, tone: "bg-blue-50 text-blue-700",
      text: <>commented</>, comment: c.body, type: "comment",
    })),
    ...events.map((e) => fromEvent(e, name)).filter((x): x is Item => x !== null),
  ].sort((a, b) => b.at.localeCompare(a.at));
  const items = all.filter((i) => filter === "all" || (filter === "comments" ? i.type === "comment" : i.type === "change"));

  const days: { key: string; items: Item[] }[] = [];
  for (const it of items) {
    const k = dayKey(it.at);
    if (days.at(-1)?.key !== k) days.push({ key: k, items: [] });
    days.at(-1)!.items.push(it);
  }
  const counts = { all: all.length, comments: all.filter((i) => i.type === "comment").length, changes: all.filter((i) => i.type === "change").length };

  return (
    <>
      <nav aria-label="Filter activity" className="mb-4 flex gap-1.5">
        {(["all", "changes", "comments"] as const).map((f) => (
          <Link
            key={f}
            href={f === "all" ? `/tasks/${taskId}#activity` : `/tasks/${taskId}?activity=${f}#activity`}
            aria-current={filter === f ? "true" : undefined}
            className={`rounded-full px-3 py-1 text-sm font-medium ${filter === f ? "bg-blue-600 text-white" : "bg-slate-100 text-slate-700 hover:bg-slate-200"}`}
          >
            {f === "all" ? "All" : f === "changes" ? "Changes" : "Comments"} <span className="tabular-nums opacity-75">{counts[f]}</span>
          </Link>
        ))}
      </nav>

      {items.length === 0 ? (
        <p className="text-sm text-slate-500">Nothing here yet.</p>
      ) : (
        <div className="space-y-5">
          {days.map((day) => (
            <section key={day.key} aria-label={dayLabel(day.key)}>
              <h3 className="mb-2 text-xs font-semibold tracking-wide text-slate-500 uppercase">{dayLabel(day.key)}</h3>
              <ol className="relative ml-3.5 border-l border-slate-200">
                {day.items.map((it) => {
                  const Icon = it.icon;
                  return (
                    <li key={it.key} className="relative pb-4 pl-6 last:pb-0">
                      <span aria-hidden className={`absolute -left-3.5 top-0 grid size-7 place-items-center rounded-full ring-4 ring-white ${it.tone}`}>
                        <Icon className="size-3.5" />
                      </span>
                      <p className="pt-1 text-sm leading-snug text-slate-600">
                        <strong className="font-medium text-slate-900">{it.actor}</strong> {it.text}
                        <time dateTime={it.at} className="ml-2 text-xs whitespace-nowrap text-slate-400">
                          {time(it.at)}
                        </time>
                      </p>
                      {it.comment && (
                        <p className="mt-1.5 whitespace-pre-wrap rounded-lg border border-slate-200 bg-white px-3 py-2 text-[15px] text-slate-800">{it.comment}</p>
                      )}
                      {it.note && <p className="mt-1.5 whitespace-pre-wrap rounded-lg bg-slate-50 px-3 py-2 text-[15px] text-slate-800">{it.note}</p>}
                    </li>
                  );
                })}
              </ol>
            </section>
          ))}
        </div>
      )}
    </>
  );
}
