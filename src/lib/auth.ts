import "server-only";
import { cache } from "react";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import type { Tables } from "@/lib/database.types";

export type Profile = Tables<"profiles">;

export type Viewer = {
  profile: Profile;
  isHead: boolean;
  isManager: boolean;
  /** Placed in a unit by the Head (or is the Head). Unplaced accounts see nothing. */
  isMember: boolean;
};

/** Current signed-in user's profile. Redirects to /login if not signed in. */
export const getViewer = cache(async (): Promise<Viewer> => {
  const supabase = await createClient();
  const { data: claims } = await supabase.auth.getClaims();
  const userId = claims?.claims?.sub;
  if (!userId) redirect("/login");

  const { data: profile } = await supabase.from("profiles").select("*").eq("id", userId).maybeSingle();
  if (!profile || !profile.is_active) redirect("/login?error=inactive");

  const isHead = profile.role === "head";
  return {
    profile,
    isHead,
    isManager: profile.role === "manager",
    isMember: isHead || profile.unit_id !== null,
  };
});

/** Can this viewer manage (edit, reassign, cancel) a task in the given unit? */
export function canManageTask(viewer: Viewer, task: { unit_id: string | null; assigned_by: string | null }) {
  if (viewer.isHead) return true;
  if (viewer.isManager && task.unit_id !== null && task.unit_id === viewer.profile.unit_id) return true;
  return task.assigned_by === viewer.profile.id;
}
