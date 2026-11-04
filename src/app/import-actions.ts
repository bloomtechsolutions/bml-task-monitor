"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requirePerson } from "@/lib/auth";
import { isHead } from "@/lib/permissions";
import { checkRows, readSheet, tempPassword, toImportRows, unitCode, MAX_ROWS, type CheckedRow, type ImportRow } from "@/lib/staff-import";

export type PreviewState = { error?: string; rows?: CheckedRow[]; fileName?: string; createUnits?: boolean };
export type ResultRow = { line: number; full_name: string; staff_no: string; action: "created" | "updated" | "failed"; password?: string; error?: string };
export type CommitState = { error?: string; results?: ResultRow[]; unitsCreated?: string[] };

async function context() {
  const supabase = createClient();
  const [{ data: units }, { data: people }] = await Promise.all([
    supabase.from("units").select("id, name, code"),
    supabase.from("profiles").select("id, staff_no, email"),
  ]);
  return { supabase, units: units ?? [], people: people ?? [] };
}

export async function previewImport(_prev: PreviewState, formData: FormData): Promise<PreviewState> {
  const me = await requirePerson();
  if (!isHead(me)) return { error: "Only the Head of Retail can import staff." };
  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) return { error: "Choose the Excel file to upload." };
  if (file.size > 3 * 1024 * 1024) return { error: "That file is over 3 MB. Remove extra sheets or images and try again." };

  const sheet = await readSheet(file);
  if (sheet.error) return { error: sheet.error };
  const parsed = toImportRows(sheet.rows!);
  if (parsed.error) return { error: parsed.error };

  const createUnits = formData.get("create_units") === "on";
  const { units, people } = await context();
  return { rows: checkRows(parsed.rows!, units, people, createUnits), fileName: file.name, createUnits };
}

export async function commitImport(_prev: CommitState, formData: FormData): Promise<CommitState> {
  const me = await requirePerson();
  if (!isHead(me)) return { error: "Only the Head of Retail can import staff." };

  let rows: ImportRow[];
  try {
    rows = (JSON.parse(String(formData.get("rows") ?? "[]")) as ImportRow[]).slice(0, MAX_ROWS);
  } catch {
    return { error: "The preview expired. Upload the file again." };
  }
  const createUnits = formData.get("create_units") === "1";
  const autoPasswords = formData.get("auto_passwords") === "on";

  // Re-validate against the current database: things may have changed since the preview.
  const { supabase, units, people } = await context();
  const checked = checkRows(rows, units, people, createUnits);
  const byStaff = new Map(people.filter((p) => p.staff_no).map((p) => [p.staff_no!.toLowerCase(), p.id]));

  // 1. Units that don't exist yet
  const unitIds = new Map(units.flatMap((u) => [[u.name.toLowerCase(), u.id], [u.code.toLowerCase(), u.id]] as [string, string][]));
  const taken = new Set(units.map((u) => u.code.toUpperCase()));
  const unitsCreated: string[] = [];
  for (const name of [...new Set(checked.filter((r) => r.new_unit && r.action !== "skip").map((r) => r.unit.trim()))]) {
    if (unitIds.has(name.toLowerCase())) continue;
    const { data, error } = await supabase.from("units").insert({ name, code: unitCode(name, taken) }).select("id").single();
    if (data) {
      unitIds.set(name.toLowerCase(), data.id);
      unitsCreated.push(name);
    } else if (error) {
      return { error: `Couldn't create unit “${name}”: ${error.message}` };
    }
  }

  // 2. People
  const results: ResultRow[] = [];
  for (const r of checked) {
    const base = { line: r.line, full_name: r.full_name, staff_no: r.staff_no };
    if (r.action === "skip") {
      results.push({ ...base, action: "failed", error: r.errors.join("; ") });
      continue;
    }
    const unit_id = r.unit ? unitIds.get(r.unit.toLowerCase()) ?? null : null;
    const fields = {
      full_name: r.full_name,
      staff_no: r.staff_no,
      designation: r.designation || null,
      unit_id,
      role: r.role,
      ...(r.email ? { email: r.email } : {}),
    };
    const existingId = byStaff.get(r.staff_no.toLowerCase());

    if (existingId) {
      // Never let an import take the Head's own access away.
      const patch = existingId === me.id ? { ...fields, role: "head" as const } : fields;
      const { error } = await supabase.from("profiles").update({ ...patch, is_active: true }).eq("id", existingId);
      if (error) {
        results.push({ ...base, action: "failed", error: error.message });
        continue;
      }
      let password: string | undefined;
      if (r.password) {
        await supabase.rpc("auth_set_password", { p_profile_id: existingId, p_password: r.password, p_temporary: true });
        password = r.password;
      }
      results.push({ ...base, action: "updated", password });
    } else {
      const { data, error } = await supabase.from("profiles").insert(fields).select("id").single();
      if (error || !data) {
        results.push({ ...base, action: "failed", error: error?.message ?? "Couldn't add" });
        continue;
      }
      const password = r.password || (autoPasswords ? tempPassword() : undefined);
      if (password) await supabase.rpc("auth_set_password", { p_profile_id: data.id, p_password: password, p_temporary: true });
      results.push({ ...base, action: "created", password });
    }
  }

  // Rows already rejected at the preview stage, so the summary shows everyone who wasn't imported.
  try {
    const skipped = JSON.parse(String(formData.get("skipped") ?? "[]")) as { line: number; full_name: string; staff_no: string; error: string }[];
    for (const r of skipped.slice(0, MAX_ROWS)) {
      results.push({ line: Number(r.line), full_name: String(r.full_name ?? ""), staff_no: String(r.staff_no ?? ""), action: "failed", error: String(r.error ?? "") });
    }
  } catch {}
  results.sort((a, b) => a.line - b.line);

  revalidatePath("/", "layout");
  return { results, unitsCreated };
}
