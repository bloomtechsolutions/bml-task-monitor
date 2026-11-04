import "server-only";
import { cache } from "react";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { SESSION_COOKIE, SESSION_MAX_AGE, signSession, verifySession } from "@/lib/session";
import type { Tables } from "@/lib/database.types";

export type Profile = Tables<"profiles">;

/** The signed-in person, or null. Checks the cookie signature, expiry, account status and session version. */
export const getPerson = cache(async (): Promise<Profile | null> => {
  const session = await verifySession((await cookies()).get(SESSION_COOKIE)?.value);
  if (!session) return null;
  const { data } = await createClient().from("profiles").select("*").eq("id", session.id).maybeSingle();
  if (!data || !data.is_active || data.session_version !== session.version) return null;
  return data;
});

/** For pages and actions: the signed-in person, or a redirect to sign-in. */
export async function requirePerson(): Promise<Profile> {
  const me = await getPerson();
  if (!me) redirect("/login");
  return me;
}

export async function startSession(profileId: string, version: number, mustChange: boolean) {
  (await cookies()).set(SESSION_COOKIE, await signSession({ id: profileId, version, mustChange }), {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: SESSION_MAX_AGE,
  });
}

export async function endSession() {
  (await cookies()).delete(SESSION_COOKIE);
}
