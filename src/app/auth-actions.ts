"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { endSession, getPerson, startSession } from "@/lib/auth";

function str(fd: FormData, key: string): string {
  const v = fd.get(key);
  return typeof v === "string" ? v.trim() : "";
}

/** Only same-site relative paths, so a crafted link can't bounce people elsewhere after sign-in. */
function safeNext(raw: string): string {
  return raw.startsWith("/") && !raw.startsWith("//") && !raw.startsWith("/login") ? raw : "/";
}

export async function login(formData: FormData) {
  const staffNo = str(formData, "staff_no");
  const password = typeof formData.get("password") === "string" ? (formData.get("password") as string) : "";
  const next = safeNext(str(formData, "next"));
  const fail = (error: string): never =>
    redirect(`/login?${new URLSearchParams({ error, staff_no: staffNo, ...(next !== "/" ? { next } : {}) })}`);

  if (!staffNo || !password) fail("Enter your staff number and password.");

  const { data, error } = await createClient().rpc("auth_login", { p_staff_no: staffNo, p_password: password });
  if (error) {
    const m = error.message.match(/locked_until:(\d\d:\d\d)/);
    fail(m ? `Too many wrong attempts. Try again after ${m[1]}.` : "Sign-in is unavailable right now. Try again shortly.");
  }
  const row = data?.[0];
  if (!row) fail("Staff number or password is wrong.");

  await startSession(row!.profile_id, row!.session_version, row!.must_change);
  redirect(row!.must_change ? "/account?first=1" : next);
}

export async function logout() {
  await endSession();
  redirect("/login");
}

export async function changePassword(formData: FormData) {
  const me = await getPerson();
  if (!me) redirect("/login");
  const current = String(formData.get("current") ?? "");
  const next = String(formData.get("new") ?? "");
  const confirm = String(formData.get("confirm") ?? "");
  const back = (params: Record<string, string>): never => redirect(`/account?${new URLSearchParams(params)}`);

  if (next.length < 8) back({ error: "Use at least 8 characters for your new password." });
  if (!/[A-Za-z]/.test(next) || !/\d/.test(next)) back({ error: "Use both letters and numbers in your new password." });
  if (next !== confirm) back({ error: "The two new passwords don't match." });
  if (next === current) back({ error: "Choose a password different from the current one." });

  const supabase = createClient();
  const { data: ok } = await supabase.rpc("auth_check_password", { p_profile_id: me.id, p_password: current });
  if (!ok) back({ error: "Your current password is wrong." });

  const { data: version, error } = await supabase.rpc("auth_set_password", { p_profile_id: me.id, p_password: next, p_temporary: false });
  if (error || typeof version !== "number") back({ error: error?.message ?? "Couldn't change the password." });

  await startSession(me.id, version as number, false);
  back({ saved: "1" });
}
