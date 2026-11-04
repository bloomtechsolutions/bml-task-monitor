import { redirect } from "next/navigation";
import { getViewer } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { ROLE_LABEL } from "@/lib/format";
import { USER_ROLES } from "@/lib/database.types";
import { updateProfile } from "@/app/actions";
import { PageHeader, Notice, EmptyState, inputCls } from "@/components/ui";
import { SubmitButton } from "@/components/submit-button";

export default async function AdminPage({ searchParams }: { searchParams: Promise<{ saved?: string; error?: string; q?: string }> }) {
  const viewer = await getViewer();
  if (!viewer.isHead) redirect("/");
  const sp = await searchParams;
  const q = (sp.q ?? "").trim().toLowerCase();

  const supabase = await createClient();
  const [{ data: units }, { data: profiles, error }] = await Promise.all([
    supabase.from("units").select("id, name").order("name"),
    supabase.from("profiles").select("*").order("created_at", { ascending: false }),
  ]);

  const list = (profiles ?? []).filter(
    (p) => !q || (p.full_name ?? "").toLowerCase().includes(q) || p.email.toLowerCase().includes(q) || (p.staff_no ?? "").includes(q),
  );
  const pending = list.filter((p) => p.is_active && p.role !== "head" && !p.unit_id);
  const placed = list.filter((p) => !pending.includes(p));
  const savedName = sp.saved ? (profiles ?? []).find((p) => p.id === sp.saved) : null;

  const renderPerson = (p: (typeof list)[number]) => (
    <li key={p.id} className={`px-4 py-4 ${!p.is_active ? "bg-slate-50 opacity-70" : ""}`}>
      <form action={updateProfile} className="grid gap-3 sm:grid-cols-12 sm:items-end">
        <input type="hidden" name="id" value={p.id} />
        <div className="sm:col-span-12">
          <p className="text-sm text-slate-500">
            {p.email}
            {!p.is_active && <span className="ml-2 rounded bg-slate-200 px-1.5 py-0.5 text-xs text-slate-700">Inactive</span>}
            {p.id === viewer.profile.id && <span className="ml-2 rounded bg-slate-900 px-1.5 py-0.5 text-xs text-white">You</span>}
          </p>
        </div>
        <label className="sm:col-span-3">
          <span className="mb-1 block text-xs font-medium text-slate-600">Full name</span>
          <input name="full_name" defaultValue={p.full_name ?? ""} className={inputCls} />
        </label>
        <label className="sm:col-span-2">
          <span className="mb-1 block text-xs font-medium text-slate-600">Staff no.</span>
          <input name="staff_no" defaultValue={p.staff_no ?? ""} inputMode="numeric" className={inputCls} />
        </label>
        <label className="sm:col-span-2">
          <span className="mb-1 block text-xs font-medium text-slate-600">Designation</span>
          <input name="designation" defaultValue={p.designation ?? ""} className={inputCls} />
        </label>
        <label className="sm:col-span-2">
          <span className="mb-1 block text-xs font-medium text-slate-600">Unit</span>
          <select name="unit_id" defaultValue={p.unit_id ?? ""} className={inputCls}>
            <option value="">— None —</option>
            {(units ?? []).map((u) => (
              <option key={u.id} value={u.id}>
                {u.name}
              </option>
            ))}
          </select>
        </label>
        <label className="sm:col-span-2">
          <span className="mb-1 block text-xs font-medium text-slate-600">Role</span>
          <select name="role" defaultValue={p.role} className={inputCls}>
            {USER_ROLES.map((r) => (
              <option key={r} value={r}>
                {ROLE_LABEL[r]}
              </option>
            ))}
          </select>
        </label>
        <label className="sm:col-span-1">
          <span className="mb-1 block text-xs font-medium text-slate-600">Access</span>
          <select name="is_active" defaultValue={p.is_active ? "true" : "false"} className={inputCls}>
            <option value="true">Active</option>
            <option value="false">Off</option>
          </select>
        </label>
        <div className="sm:col-span-12 sm:flex sm:justify-end">
          <SubmitButton variant="secondary">Save {p.full_name?.split(" ")[0] ?? "person"}</SubmitButton>
        </div>
      </form>
    </li>
  );

  return (
    <>
      <PageHeader title="People" subtitle="Staff appear here after they sign in for the first time. Place them in a unit to give them access." />
      {sp.error && <Notice tone="error">{sp.error}</Notice>}
      {savedName && <Notice tone="success">Saved {savedName.full_name ?? savedName.email}.</Notice>}
      {error && <Notice tone="error">Couldn&apos;t load people.</Notice>}

      <form role="search" className="mb-4 sm:w-80">
        <label htmlFor="q" className="sr-only">
          Search people
        </label>
        <input id="q" name="q" type="search" defaultValue={sp.q ?? ""} placeholder="Search name, email or staff no…" className={inputCls} />
      </form>

      {pending.length > 0 && (
        <section aria-labelledby="pending-h" className="mb-6 overflow-hidden rounded-lg border border-amber-300 bg-white">
          <h2 id="pending-h" className="bg-amber-50 px-4 py-2.5 text-sm font-semibold text-amber-900">
            Waiting for a unit <span className="font-normal tabular-nums">{pending.length}</span>
          </h2>
          <ul className="divide-y divide-slate-100">{pending.map(renderPerson)}</ul>
        </section>
      )}

      {placed.length === 0 && pending.length === 0 ? (
        <EmptyState title={q ? "No one matches that search" : "No one has signed in yet"} body="Share the app link with your team. Each person signs in with their work email, then appears here." />
      ) : (
        placed.length > 0 && (
          <section aria-labelledby="placed-h" className="overflow-hidden rounded-lg border border-slate-200 bg-white">
            <h2 id="placed-h" className="px-4 py-2.5 text-sm font-semibold text-slate-800">
              Team <span className="font-normal tabular-nums text-slate-500">{placed.length}</span>
            </h2>
            <ul className="divide-y divide-slate-100 border-t border-slate-100">{placed.map(renderPerson)}</ul>
          </section>
        )
      )}
    </>
  );
}
