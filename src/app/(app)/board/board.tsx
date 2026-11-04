"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useRef, useState, useTransition } from "react";
import { ListChecks, Paperclip } from "lucide-react";
import type { Enums, Tables } from "@/lib/database.types";
import { dueLabel, STATUS_LABEL } from "@/lib/format";
import { moveTask } from "@/app/actions";
import { DueText, PriorityTag } from "@/components/ui";

type Task = Tables<"task_overview">;
type Status = Enums<"task_status">;

const COLUMNS: { status: Status; tone: string }[] = [
  { status: "not_started", tone: "bg-slate-400" },
  { status: "in_progress", tone: "bg-sky-500" },
  { status: "blocked", tone: "bg-amber-500" },
  { status: "submitted", tone: "bg-violet-500" },
  { status: "done", tone: "bg-emerald-500" },
];

export function Board({ tasks, meId, showAssignee }: { tasks: Task[]; meId: string; showAssignee: boolean }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [over, setOver] = useState<Status | null>(null);
  const [blockFor, setBlockFor] = useState<Task | null>(null);
  const dialogRef = useRef<HTMLDialogElement>(null);
  const noteRef = useRef<HTMLTextAreaElement>(null);

  function move(task: Task, status: Status, note = "") {
    if (!task.id || task.status === status) return;
    if (status === "blocked" && !note) {
      setBlockFor(task);
      dialogRef.current?.showModal();
      setTimeout(() => noteRef.current?.focus(), 0);
      return;
    }
    setError(null);
    startTransition(async () => {
      const res = await moveTask(task.id!, status, note);
      if (res.error) setError(res.error);
      router.refresh();
    });
  }

  return (
    <>
      {error && (
        <p role="alert" className="mb-4 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-900">
          {error}
        </p>
      )}
      <div aria-busy={pending} className={`relative -mx-4 flex snap-x gap-3 overflow-x-auto px-4 pb-4 md:mx-0 md:px-0 ${pending ? "opacity-70" : ""}`}>
        {COLUMNS.map((col) => {
          const cards = tasks.filter((t) => t.status === col.status);
          return (
            <section
              key={col.status}
              aria-label={STATUS_LABEL[col.status]}
              onDragOver={(e) => {
                e.preventDefault();
                setOver(col.status);
              }}
              onDragLeave={() => setOver((o) => (o === col.status ? null : o))}
              onDrop={(e) => {
                e.preventDefault();
                setOver(null);
                const t = tasks.find((x) => x.id === e.dataTransfer.getData("text/plain"));
                if (t) move(t, col.status);
              }}
              className={`flex w-[78vw] max-w-[300px] shrink-0 snap-start flex-col rounded-xl border bg-slate-100/70 md:w-auto md:max-w-none md:min-w-[200px] md:flex-1 md:shrink ${
                over === col.status ? "border-blue-400 ring-2 ring-blue-200" : "border-slate-200"
              }`}
            >
              <h2 className="flex items-center gap-2 px-3 py-2.5 text-sm font-semibold text-slate-800">
                <span aria-hidden className={`size-2.5 rounded-full ${col.tone}`} />
                {STATUS_LABEL[col.status]}
                <span className="ml-auto font-normal tabular-nums text-slate-500">{cards.length}</span>
              </h2>
              <ul className="flex min-h-24 flex-1 flex-col gap-2 px-2 pb-2">
                {cards.map((t) => (
                  <li
                    key={t.id}
                    draggable
                    onDragStart={(e) => e.dataTransfer.setData("text/plain", t.id ?? "")}
                    className={`cursor-grab rounded-lg border bg-white p-3 shadow-xs active:cursor-grabbing ${
                      t.is_overdue ? "border-red-200 border-l-[3px] border-l-red-500" : "border-slate-200"
                    }`}
                  >
                    <Link href={`/tasks/${t.id}`} className="block font-medium leading-snug text-slate-900 hover:text-blue-700">
                      {t.title}
                    </Link>
                    <div className="mt-2 flex flex-wrap items-center gap-x-2.5 gap-y-1">
                      <DueText label={dueLabel(t.due_date, t.status)} overdue={t.is_overdue === true} />
                      {t.priority && t.priority !== "medium" && t.priority !== "low" && <PriorityTag priority={t.priority} />}
                      {(t.checklist_total ?? 0) > 0 && (
                        <span className="inline-flex items-center gap-0.5 text-xs tabular-nums text-slate-500">
                          <ListChecks aria-hidden className="size-3" />
                          {t.checklist_done}/{t.checklist_total}
                        </span>
                      )}
                      {(t.attachment_count ?? 0) > 0 && (
                        <span className="inline-flex items-center gap-0.5 text-xs text-slate-500">
                          <Paperclip aria-hidden className="size-3" />
                          {t.attachment_count}
                        </span>
                      )}
                    </div>
                    <p className="mt-1.5 truncate text-xs text-slate-500">
                      {showAssignee ? (t.assignee_id === meId ? "Me" : t.assignee_name) : t.assigned_by_name ? `From ${t.assigned_by_name}` : ""}
                    </p>
                    <label className="mt-2 block">
                      <span className="sr-only">Move “{t.title}” to</span>
                      <select
                        value=""
                        onChange={(e) => move(t, e.target.value as Status)}
                        className="w-full rounded-md border border-slate-200 bg-white py-1 pr-6 pl-2 text-xs text-slate-600"
                      >
                        <option value="" disabled>
                          Move to…
                        </option>
                        {COLUMNS.filter((c) => c.status !== t.status).map((c) => (
                          <option key={c.status} value={c.status}>
                            {STATUS_LABEL[c.status]}
                          </option>
                        ))}
                      </select>
                    </label>
                  </li>
                ))}
              </ul>
            </section>
          );
        })}
      </div>

      <dialog ref={dialogRef} className="m-auto w-[min(92vw,420px)] rounded-xl p-0 shadow-xl backdrop:bg-slate-900/30" onClose={() => setBlockFor(null)}>
        <form
          method="dialog"
          className="space-y-3 p-5"
          onSubmit={(e) => {
            const note = noteRef.current?.value.trim() ?? "";
            if (!note) {
              e.preventDefault();
              return;
            }
            if (blockFor) move(blockFor, "blocked", note);
            if (noteRef.current) noteRef.current.value = "";
          }}
        >
          <h2 className="font-semibold text-slate-900">What&apos;s blocking “{blockFor?.title}”?</h2>
          <textarea ref={noteRef} required rows={3} maxLength={2000} className="block w-full rounded-lg border border-slate-300 px-3 py-2 text-[15px]" />
          <div className="flex justify-end gap-2">
            <button type="button" onClick={() => dialogRef.current?.close()} className="min-h-10 rounded-lg px-4 text-sm font-medium text-slate-700 hover:bg-slate-100">
              Cancel
            </button>
            <button type="submit" className="min-h-10 rounded-lg bg-blue-600 px-4 text-sm font-medium text-white hover:bg-blue-700">
              Mark blocked
            </button>
          </div>
        </form>
      </dialog>
    </>
  );
}
