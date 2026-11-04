import "server-only";
import { cache } from "react";
import { cookies } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import type { Tables } from "@/lib/database.types";

export type Profile = Tables<"profiles">;

/** Cookie holding the person picked under "I am…". A convenience, not a security boundary. */
export const PERSON_COOKIE = "tm_person";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** The person this browser says it is, or null if none chosen yet. */
export const getPerson = cache(async (): Promise<Profile | null> => {
  const id = (await cookies()).get(PERSON_COOKIE)?.value;
  if (!id || !UUID.test(id)) return null;
  const { data } = await createClient().from("profiles").select("*").eq("id", id).eq("is_active", true).maybeSingle();
  return data ?? null;
});
