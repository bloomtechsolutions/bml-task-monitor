import { getPerson } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { ROLE_LABEL } from "@/lib/format";
import { USER_ROLES, type Tables } from "@/lib/database.types";
import { addPerson, updateProfile } from "@/app/actions";
import { PageHeader, Notice, EmptyState, inputCls } from "@/components/ui";
import { SubmitButton } from "@/components/submit-button";

type Unit = { id: string; name: string };

function PersonFields({ p, units }: { p?: Tables<"profiles">; units: Unit[] }) {
  const field = "mb-1 block text-xs font-medium text-slate-600";
  return (
    <>
      <label className="sm:col-span-3">
        <span className={field}>Full name</span>
        <input name="full_name" required minLength={2} defaultValue={p?.full_name ?? ""} className={inputCls} />
      </label>
      <label className="sm:col-span-2">
        <span className={field}>Staff no.</span>
        <input name="staff_no" defaultValue={p?.staff_no ?? ""} inputMode="numeric" className={inputCls} />
      </label>
      <label className="sm:col-span-3">
        <span className={field}>Designation</span>
        <input name="designation" defaultValue={p?.designation ?? ""} className={inputCls} />
      </label>
      <label className="sm:col-span-2">
        <span className={field}>Unit</span>
        <select name="unit_id" defaultValue={p?.unit_id ?? ""} className={inputCls}>
          <option value="">— None —</option>
          {units.map((u) => (
            <option key={u.id} value={u.id}>
              {u.name}
            </option>
          ))}
        </select>
      </label>
      <label className="sm:col-span-2">
        <span className={field}>Role</span>
        <select name="role" defaultValue={p?.role ?? "staff"} className={inputCls}>
          {USER_ROLES.map((r) => (
            <option key={r} value={r}>
              {ROLE_LABEL[r]}
            </option>
          ))}
        </select>
      </label>
      <label className="sm:col-span-4">
        <span className={field}>
          Email <span className="font-normal text-slate-400">(optional, for reminders later)</span>
        </span>
        <input name="email" type="email" defaultValue={p?.email ?? ""} className={inputCls} />
      </label>
    </>
  );
}

export default async function AdminPage({ searchParams }: { searchParams: Promise<{ saved?: string; error?: string; q?: string }> }) {
  const sp = await searchParams;
  const q = (sp.q ?? "").trim().toLowerCase();
  const supabase = createClient();
  const [person, { data: units }, { data: profiles, error }] = await Promise.all([
    getPerson(),
    supabase.from("units").select("id, name").order("name"),
    supabase.from("profiles").select("*").order("full_name"),
  ]);

  const list = (profiles ?? []).filter(
    (p) => !q || (p.full_name ?? "").toLowerCase().includes(q) || (p.email ?? "").toLowerCase().includes(q) || (p.staff_no ?? "").includes(q),
  );
  const saved = sp.saved ? (profiles ?? []).find((p) => p.id === sp.saved) : null;

  return (
    <>
      <PageHeader title="People" subtitle="Everyone who can be assigned tasks. Anyone with the link can edit this list." />
      {sp.error && <Notice tone="error">{sp.error}</Notice>}
      {saved && <Notice tone="success">Saved {saved.full_name}.</Notice>}
      {error && <Notice tone="error">Couldn&apos;t load people.</Notice>}

      <details className="mb-6 overflow-hidden rounded-lg border border-slate-200 bg-white" open={(profiles ?? []).length <= 1}>
        <summary className="cursor-pointer px-4 py-3 text-sm font-semibold text-slate-900">+ Add a person</summary>
        <form action={addPerson} className="grid gap-3 border-t border-slate-100 p-4 sm:grid-cols-12 sm:items-end">
          <PersonFields units={units ?? []} />
          <div className="sm:col-span-12 sm:flex sm:justify-end">
            <SubmitButton pendingText="Adding…">Add person</SubmitButton>
          </div>
        </form>
      </details>

      <form role="search" className="mb-4 sm:w-80">
        <label htmlFor="q" className="sr-only">
          Search people
        </label>
        <input id="q" name="q" type="search" defaultValue={sp.q ?? ""} placeholder="Search name or staff no…" className={inputCls} />
      </form>

      {list.length === 0 ? (
        <EmptyState title={q ? "No one matches that search" : "No one on the list yet"} body="Add your team above." />
      ) : (
        <section aria-labelledby="team-h" className="overflow-hidden rounded-lg border border-slate-200 bg-white">
          <h2 id="team-h" className="px-4 py-2.5 text-sm font-semibold text-slate-800">
            Team <span className="font-normal tabular-nums text-slate-500">{list.length}</span>
          </h2>
          <ul className="divide-y divide-slate-100 border-t border-slate-100">
            {list.map((p) => (
              <li key={p.id} className={!p.is_active ? "bg-slate-50 opacity-70" : ""}>
                <details>
                  <summary className="flex cursor-pointer items-center justify-between gap-3 px-4 py-3">
                    <span>
                      <span className="font-medium text-slate-900">{p.full_name ?? "Unnamed"}</span>
                      {p.id === person?.id && <span className="ml-2 rounded bg-slate-900 px-1.5 py-0.5 text-xs text-white">You</span>}
                      {!p.is_active && <span className="ml-2 rounded bg-slate-200 px-1.5 py-0.5 text-xs text-slate-700">Inactive</span>}
                      <span className="block text-xs text-slate-500">
                        {[ROLE_LABEL[p.role], (units ?? []).find((u) => u.id === p.unit_id)?.name, p.staff_no].filter(Boolean).join(" · ")}
                      </span>
                    </span>
                    <span className="text-sm text-slate-500">Edit</span>
                  </summary>
                  <form action={updateProfile} className="grid gap-3 px-4 pb-4 sm:grid-cols-12 sm:items-end">
                    <input type="hidden" name="id" value={p.id} />
                    <PersonFields p={p} units={units ?? []} />
                    <label className="sm:col-span-2">
                      <span className="mb-1 block text-xs font-medium text-slate-600">Status</span>
                      <select name="is_active" defaultValue={p.is_active ? "true" : "false"} className={inputCls}>
                        <option value="true">Active</option>
                        <option value="false">Inactive</option>
                      </select>
                    </label>
                    <div className="sm:col-span-12 sm:flex sm:justify-end">
                      <SubmitButton variant="secondary">Save {p.full_name?.split(" ")[0] ?? "person"}</SubmitButton>
                    </div>
                  </form>
                </details>
              </li>
            ))}
          </ul>
        </section>
      )}
    </>
  );
}
