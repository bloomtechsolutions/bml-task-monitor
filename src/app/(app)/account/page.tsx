import { requirePerson } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { changePassword } from "@/app/auth-actions";
import { ROLE_LABEL } from "@/lib/format";
import { PageHeader, Notice, inputCls, labelCls } from "@/components/ui";
import { SubmitButton } from "@/components/submit-button";

export const metadata = { title: "Account" };

export default async function AccountPage({ searchParams }: { searchParams: Promise<{ first?: string; error?: string; saved?: string }> }) {
  const [me, sp] = await Promise.all([requirePerson(), searchParams]);
  const { data: unit } = me.unit_id ? await createClient().from("units").select("name").eq("id", me.unit_id).maybeSingle() : { data: null };

  return (
    <div className="mx-auto max-w-xl">
      <PageHeader title="Account" subtitle="Your details and password." />
      {sp.first && !sp.saved && (
        <Notice tone="info">
          You signed in with a temporary password. <strong>Set your own password</strong> to continue.
        </Notice>
      )}
      {sp.error && <Notice tone="error">{sp.error}</Notice>}
      {sp.saved && <Notice tone="success">Password changed. You&apos;re all set.</Notice>}

      <section className="mb-6 rounded-xl border border-slate-200 bg-white p-5 shadow-xs">
        <dl className="grid gap-3 text-sm sm:grid-cols-2">
          {(
            [
              ["Name", me.full_name],
              ["Staff number", me.staff_no],
              ["Role", ROLE_LABEL[me.role]],
              ["Unit", unit?.name ?? "—"],
              ["Designation", me.designation],
              ["Email", me.email],
            ] as const
          ).map(([k, v]) => (
            <div key={k}>
              <dt className="text-slate-500">{k}</dt>
              <dd className="font-medium text-slate-900">{v || "—"}</dd>
            </div>
          ))}
        </dl>
        <p className="mt-4 text-xs text-slate-500">To change these details, ask the Head of Retail.</p>
      </section>

      <form action={changePassword} className="space-y-4 rounded-xl border border-slate-200 bg-white p-5 shadow-xs">
        <h2 className="font-semibold text-slate-900">Change password</h2>
        <input type="text" name="username" autoComplete="username" defaultValue={me.staff_no ?? ""} hidden readOnly />
        <div>
          <label htmlFor="current" className={labelCls}>
            {sp.first ? "Temporary password" : "Current password"}
          </label>
          <input id="current" name="current" type="password" required autoComplete="current-password" className={inputCls} />
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label htmlFor="new" className={labelCls}>
              New password
            </label>
            <input id="new" name="new" type="password" required minLength={8} autoComplete="new-password" className={inputCls} />
          </div>
          <div>
            <label htmlFor="confirm" className={labelCls}>
              Repeat new password
            </label>
            <input id="confirm" name="confirm" type="password" required minLength={8} autoComplete="new-password" className={inputCls} />
          </div>
        </div>
        <p className="text-xs text-slate-500">At least 8 characters, with letters and numbers. Changing it signs you out on other devices.</p>
        <div className="flex justify-end">
          <SubmitButton pendingText="Saving…">Change password</SubmitButton>
        </div>
      </form>
    </div>
  );
}
