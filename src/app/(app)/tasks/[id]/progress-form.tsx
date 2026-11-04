"use client";

import { useState } from "react";
import type { Enums } from "@/lib/database.types";
import { STATUS_LABEL } from "@/lib/format";
import { postUpdate } from "@/app/actions";
import { SubmitButton } from "@/components/submit-button";
import { inputCls, labelCls } from "@/components/ui";

const CHOICES: Enums<"task_status">[] = ["not_started", "in_progress", "blocked", "done"];

export function ProgressForm({
  taskId,
  status,
  progress,
  needsSignOff = false,
}: {
  taskId: string;
  status: Enums<"task_status">;
  progress: number;
  needsSignOff?: boolean;
}) {
  const [s, setS] = useState<Enums<"task_status">>(status === "submitted" ? "done" : status);
  const [p, setP] = useState(progress);
  const effectiveProgress = s === "done" ? 100 : p;

  return (
    <form action={postUpdate} className="space-y-4">
      <input type="hidden" name="task_id" value={taskId} />

      <fieldset>
        <legend className={labelCls}>Status</legend>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          {CHOICES.map((c) => (
            <label
              key={c}
              className={`flex min-h-11 cursor-pointer items-center justify-center rounded-md border px-2 text-sm font-medium has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-slate-400 ${
                s === c ? "border-blue-600 bg-blue-600 text-white" : "border-slate-300 bg-white text-slate-700 hover:bg-slate-50"
              }`}
            >
              <input type="radio" name="status" value={c} checked={s === c} onChange={() => setS(c)} className="sr-only" />
              {c === "done" && needsSignOff ? "Done – submit" : STATUS_LABEL[c]}
            </label>
          ))}
        </div>
      </fieldset>

      <div>
        <label htmlFor="progress" className={labelCls}>
          Progress <span className="tabular-nums font-semibold">{effectiveProgress}%</span>
        </label>
        <input
          id="progress"
          name="progress"
          type="range"
          min={0}
          max={100}
          step={5}
          value={effectiveProgress}
          disabled={s === "done"}
          onChange={(e) => setP(Number(e.target.value))}
          className="h-11 w-full accent-blue-600"
        />
        {s === "done" && <input type="hidden" name="progress" value={100} />}
      </div>

      <div>
        <label htmlFor="note" className={labelCls}>
          Update note{" "}
          <span className="font-normal text-slate-500">{s === "blocked" ? "(required — what's blocking you?)" : "(optional)"}</span>
        </label>
        <textarea
          id="note"
          name="note"
          rows={3}
          maxLength={2000}
          required={s === "blocked"}
          className={inputCls}
          placeholder={s === "blocked" ? "e.g. Waiting for IT to grant access to the report" : "What did you do? What's next?"}
        />
      </div>

      {s === "done" && needsSignOff && status !== "submitted" && (
        <p className="text-sm text-slate-600">This task needs sign-off. It will go to the person who assigned it for approval.</p>
      )}
      <div className="flex justify-end">
        <SubmitButton pendingText="Saving update…">
          {s === "done" && status !== "done" && status !== "submitted" ? (needsSignOff ? "Submit for sign-off" : "Mark as done") : "Save update"}
        </SubmitButton>
      </div>
    </form>
  );
}
