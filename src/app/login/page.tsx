import { LayoutGrid } from "lucide-react";
import { login } from "@/app/auth-actions";
import { SubmitButton } from "@/components/submit-button";
import { inputCls, labelCls } from "@/components/ui";

export const metadata = { title: "Sign in · Task Monitor" };

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ error?: string; next?: string; staff_no?: string }> }) {
  const sp = await searchParams;
  return (
    <main className="grid min-h-dvh place-items-center px-4 py-10">
      <div className="w-full max-w-sm">
        <div className="mb-6 flex items-center gap-3">
          <span aria-hidden className="grid size-10 place-items-center rounded-lg bg-blue-600 text-white">
            <LayoutGrid className="size-5" />
          </span>
          <span className="leading-tight">
            <span className="block text-lg font-semibold text-slate-900">
              Task <span className="text-blue-600">Monitor</span>
            </span>
            <span className="block text-sm text-slate-500">Retail Banking</span>
          </span>
        </div>

        <form action={login} className="space-y-4 rounded-2xl border border-slate-200 bg-white p-6 shadow-xs">
          <div>
            <h1 className="text-lg font-semibold text-slate-900">Sign in</h1>
            <p className="mt-0.5 text-sm text-slate-600">Use your staff number and password.</p>
          </div>
          {sp.error && (
            <p role="alert" className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-900">
              {sp.error}
            </p>
          )}
          {sp.next && <input type="hidden" name="next" value={sp.next} />}
          <div>
            <label htmlFor="staff_no" className={labelCls}>
              Staff number
            </label>
            <input
              id="staff_no"
              name="staff_no"
              required
              autoComplete="username"
              inputMode="numeric"
              defaultValue={sp.staff_no ?? ""}
              autoFocus={!sp.staff_no}
              className={inputCls}
            />
          </div>
          <div>
            <label htmlFor="password" className={labelCls}>
              Password
            </label>
            <input id="password" name="password" type="password" required autoComplete="current-password" autoFocus={!!sp.staff_no} className={inputCls} />
          </div>
          <SubmitButton pendingText="Signing in…" full>
            Sign in
          </SubmitButton>
          <p className="text-xs text-slate-500">Forgot your password? Ask the Head of Retail to reset it for you.</p>
        </form>
      </div>
    </main>
  );
}
