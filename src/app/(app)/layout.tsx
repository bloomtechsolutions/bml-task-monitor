import { getPerson } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { AppShell } from "@/components/app-shell";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const [person, { data: people }] = await Promise.all([
    getPerson(),
    createClient().from("profiles").select("id, full_name").eq("is_active", true).order("full_name"),
  ]);
  const options = (people ?? []).map((p) => ({ id: p.id, name: p.full_name ?? "Unnamed" }));

  return (
    <AppShell
      people={options}
      person={person ? { id: person.id, name: person.full_name ?? "Unnamed", subtitle: person.designation } : null}
    >
      {children}
    </AppShell>
  );
}
