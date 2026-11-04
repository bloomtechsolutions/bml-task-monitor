import { requirePerson } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { AppShell } from "@/components/app-shell";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const me = await requirePerson();
  const { count } = await createClient()
    .from("notifications")
    .select("id", { count: "exact", head: true })
    .eq("recipient_id", me.id)
    .is("read_at", null);

  return (
    <AppShell
      unread={count ?? 0}
      person={{ id: me.id, name: me.full_name ?? "Unnamed", subtitle: me.designation, role: me.role }}
    >
      {children}
    </AppShell>
  );
}
