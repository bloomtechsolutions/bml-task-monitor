import Link from "next/link";
import { getViewer } from "@/lib/auth";
import { Nav } from "@/components/nav";
import { ROLE_LABEL } from "@/lib/format";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const viewer = await getViewer();
  const { profile } = viewer;
  const canSeeTeam = viewer.isHead || viewer.isManager;

  return (
    <div className="min-h-dvh pb-20 sm:pb-0">
      <header className="sticky top-0 z-10 border-b border-slate-200 bg-white/95 backdrop-blur">
        <div className="mx-auto flex h-14 max-w-6xl items-center justify-between gap-4 px-4">
          <Link href="/" className="flex items-baseline gap-2">
            <span className="text-[11px] font-semibold uppercase tracking-[0.14em] text-red-700">Retail</span>
            <span className="font-semibold tracking-tight text-slate-900">Task Monitor</span>
          </Link>
          <Nav showTeam={canSeeTeam} showAdmin={viewer.isHead} canAssign={viewer.isMember} />
          <div className="flex items-center gap-3">
            <div className="hidden text-right leading-tight md:block">
              <p className="text-sm font-medium text-slate-900">{profile.full_name ?? profile.email}</p>
              <p className="text-xs text-slate-500">{ROLE_LABEL[profile.role]}</p>
            </div>
            <form action="/auth/signout" method="post">
              <button type="submit" className="rounded-md px-2 py-2 text-sm text-slate-600 hover:bg-slate-100 hover:text-slate-900">
                Sign out
              </button>
            </form>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-4 py-6">
        {!viewer.isMember ? (
          <div className="mx-auto max-w-md rounded-lg border border-slate-200 bg-white p-6 text-center">
            <h1 className="text-lg font-semibold text-slate-900">Waiting for access</h1>
            <p className="mt-2 text-sm text-slate-600">
              You&apos;re signed in as <strong>{profile.email}</strong>, but you haven&apos;t been added to a unit yet. The
              Head of Retail Banking will place you in your unit, then your tasks will appear here.
            </p>
          </div>
        ) : (
          children
        )}
      </main>
    </div>
  );
}
