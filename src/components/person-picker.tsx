"use client";

import { useRef } from "react";
import { setPerson } from "@/app/actions";

type Option = { id: string; name: string };

/** "I am…" selector. Submits as soon as a name is picked. */
export function PersonPicker({ people, currentId, compact = false }: { people: Option[]; currentId: string | null; compact?: boolean }) {
  const formRef = useRef<HTMLFormElement>(null);
  return (
    <form ref={formRef} action={setPerson} className={compact ? "" : "w-full"}>
      <label htmlFor={compact ? "iam-compact" : "iam"} className={compact ? "sr-only" : "mb-1 block text-sm font-medium text-slate-800"}>
        I am
      </label>
      <select
        id={compact ? "iam-compact" : "iam"}
        name="person_id"
        defaultValue={currentId ?? ""}
        onChange={() => formRef.current?.requestSubmit()}
        className={
          compact
            ? "max-w-[11rem] rounded-md border border-slate-300 bg-white py-1.5 pl-2 pr-7 text-sm text-slate-800"
            : "block w-full rounded-md border border-slate-300 bg-white px-3 py-2.5 text-[15px] text-slate-900"
        }
      >
        <option value="">{compact ? "I am…" : "Choose your name…"}</option>
        {people.map((p) => (
          <option key={p.id} value={p.id}>
            {p.name}
          </option>
        ))}
      </select>
      <noscript>
        <button type="submit">Save</button>
      </noscript>
    </form>
  );
}
