import { redirect } from "next/navigation";
import { requirePerson } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { isHead } from "@/lib/permissions";
import { saveSettings } from "@/app/feature-actions";
import { PageHeader, Notice, inputCls, labelCls } from "@/components/ui";
import { SubmitButton } from "@/components/submit-button";

export const metadata = { title: "Settings · Task Monitor" };

export default async function SettingsPage({ searchParams }: { searchParams: Promise<{ error?: string; saved?: string }> }) {
  const [me, sp] = await Promise.all([requirePerson(), searchParams]);
  if (!isHead(me)) redirect("/");
  const { data } = await createClient().from("app_settings").select("key, value");
  const get = (k: string) => data?.find((r) => r.key === k)?.value;
  const emailOn = !!process.env.RESEND_API_KEY && !!process.env.DIGEST_FROM;

  return (
    <div className="mx-auto max-w-2xl">
      <PageHeader title="Settings" subtitle="How reminders, escalations and workload warnings behave." />
      {sp.error && <Notice tone="error">{sp.error}</Notice>}
      {sp.saved && <Notice tone="success">Settings saved.</Notice>}

      <form action={saveSettings} className="space-y-6 rounded-xl border border-slate-200 bg-white p-5 shadow-xs">
        <section className="space-y-2">
          <h2 className="font-semibold text-slate-900">Reminders &amp; escalation</h2>
          <p className="text-sm text-slate-600">
            Every morning at 08:00 people get reminders for tasks due today and tomorrow, and for overdue tasks. The person who assigned an overdue
            task is told too.
          </p>
          <label className="block max-w-xs">
            <span className={labelCls}>Escalate to the unit manager after (days overdue)</span>
            <input type="number" name="escalation_days" min={1} max={30} defaultValue={Number(get("escalation_days") ?? 2)} className={inputCls} />
          </label>
          <p className="text-sm text-slate-500">The Head of Retail is alerted at twice this number of days.</p>
        </section>

        <section className="space-y-2 border-t border-slate-100 pt-5">
          <h2 className="font-semibold text-slate-900">Workload</h2>
          <label className="block max-w-xs">
            <span className={labelCls}>Flag someone as overloaded at (open tasks)</span>
            <input type="number" name="overload_threshold" min={1} max={100} defaultValue={Number(get("overload_threshold") ?? 8)} className={inputCls} />
          </label>
        </section>

        <section className="space-y-2 border-t border-slate-100 pt-5">
          <h2 className="font-semibold text-slate-900">Weekly digest</h2>
          <label className="flex items-start gap-3">
            <input type="checkbox" name="digest_enabled" defaultChecked={get("digest_enabled") !== false} className="mt-0.5 size-4 accent-blue-600" />
            <span className="text-sm text-slate-700">
              Every Sunday at 07:30, send each person a summary of their open, overdue and due-this-week tasks, and what&apos;s waiting for their
              sign-off.
            </span>
          </label>
          <p className={`rounded-md px-3 py-2 text-sm ${emailOn ? "bg-emerald-50 text-emerald-900" : "bg-slate-50 text-slate-700"}`}>
            {emailOn
              ? "Email is on: digests also go to each person's email address."
              : "Digests appear in the app's notifications. To email them as well, add RESEND_API_KEY and DIGEST_FROM in Vercel."}
          </p>
        </section>

        <div className="flex justify-end border-t border-slate-100 pt-5">
          <SubmitButton pendingText="Saving…">Save settings</SubmitButton>
        </div>
      </form>
    </div>
  );
}
