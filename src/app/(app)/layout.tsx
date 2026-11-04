import Link from "next/link";
import { getPerson } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { Nav } from "@/components/nav";
import { PersonPicker } from "@/components/person-picker";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const [person, { data: people }] = await Promise.all([
    getPerson(),
    createClient().from("profiles").select("id, full_name").eq("is_active", true).order("full_name"),
  ]);
  const options = (people ?? []).map((p) => ({ id: p.id, name: p.full_name ?? "Unnamed" }));

  return (
    <div className="min-h-dvh pb-20 sm:pb-0">
      <header className="sticky top-0 z-10 border-b border-slate-200 bg-white/95 backdrop-blur">
        <div className="mx-auto flex h-14 max-w-6xl items-center justify-between gap-3 px-4">
          <Link href="/" className="flex shrink-0 items-baseline gap-2">
            <span className="text-[11px] font-semibold uppercase tracking-[0.14em] text-red-700">Retail</span>
            <span className="font-semibold tracking-tight text-slate-900">Task Monitor</span>
          </Link>
          <Nav />
          <PersonPicker people={options} currentId={person?.id ?? null} compact />
        </div>
      </header>
      <main className="mx-auto max-w-6xl px-4 py-6">{children}</main>
    </div>
  );
}
