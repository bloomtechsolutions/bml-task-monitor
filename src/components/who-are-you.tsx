import Link from "next/link";
import { UserRound } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { PersonPicker } from "@/components/person-picker";

/** Shown until this browser has picked a name under "I am…". */
export async function WhoAreYou({ purpose }: { purpose: string }) {
  const { data: people } = await createClient().from("profiles").select("id, full_name").eq("is_active", true).order("full_name");
  return (
    <div className="mx-auto mt-10 max-w-md rounded-2xl border border-slate-200 bg-white p-6 shadow-xs">
      <span aria-hidden className="mb-4 grid size-11 place-items-center rounded-full bg-blue-50 text-blue-600">
        <UserRound className="size-5" />
      </span>
      <h1 className="text-lg font-semibold text-slate-900">Who are you?</h1>
      <p className="mt-1 mb-4 text-sm text-slate-600">Pick your name {purpose}. This device will remember it.</p>
      <PersonPicker people={(people ?? []).map((p) => ({ id: p.id, name: p.full_name ?? "Unnamed" }))} currentId={null} />
      <p className="mt-4 text-sm text-slate-600">
        Not on the list? Add yourself on{" "}
        <Link href="/admin" className="font-medium text-blue-700 underline">
          People &amp; units
        </Link>
        , or see the whole{" "}
        <Link href="/team" className="font-medium text-blue-700 underline">
          team overview
        </Link>
        .
      </p>
    </div>
  );
}
