import "server-only";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/database.types";
import { env } from "@/lib/env";

// No login: every request uses the public (anon) role. Access is open by owner decision.
export function createClient() {
  return createSupabaseClient<Database>(env.supabaseUrl, env.supabaseKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
