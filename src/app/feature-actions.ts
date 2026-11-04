"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requirePerson } from "@/lib/auth";
import { canAssignTo, isHead, isLead } from "@/lib/permissions";
import { FREQUENCIES, LEAVE_KINDS, PROJECT_STATUSES, TASK_PRIORITIES } from "@/lib/database.types";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const DATE = /^\d{4}-\d{2}-\d{2}$/;

function str(fd: FormData, key: string): string {
  const v = fd.get(key);
  return typeof v === "string" ? v.trim() : "";
}
function oneOf<T extends string>(value: string, allowed: readonly T[]): T | null {
  return (allowed as readonly string[]).includes(value) ? (value as T) : null;
}
function back(path: string, params: Record<string, string>): never {
  redirect(`${path}${path.includes("?") ? "&" : "?"}${new URLSearchParams(params).toString()}`);
}
function int(fd: FormData, key: string, min: number, max: number, fallback: number): number {
  const n = Number(str(fd, key));
  return Number.isInteger(n) && n >= min && n <= max ? n : fallback;
}

async function requireLead(path: string) {
  const me = await requirePerson();
  if (!isLead(me)) back(path, { error: "Only managers and the Head of Retail can do this." });
  return me;
}

/** Managers work inside their own unit; the Head can choose any unit. */
function resolveUnit(me: Awaited<ReturnType<typeof requirePerson>>, chosen: string): string | null {
  if (isHead(me)) return UUID.test(chosen) ? chosen : me.unit_id;
  return me.unit_id;
}

// ---------- Notifications ----------
export async function openNotification(formData: FormData) {
  const me = await requirePerson();
  const id = str(formData, "id");
  if (!UUID.test(id)) redirect("/notifications");
  const supabase = createClient();
  const { data } = await supabase.from("notifications").select("task_id").eq("id", id).eq("recipient_id", me.id).maybeSingle();
  await supabase.from("notifications").update({ read_at: new Date().toISOString() }).eq("id", id).eq("recipient_id", me.id).is("read_at", null);
  revalidatePath("/", "layout");
  redirect(data?.task_id ? `/tasks/${data.task_id}` : "/notifications");
}

export async function markAllRead() {
  const me = await requirePerson();
  await createClient().from("notifications").update({ read_at: new Date().toISOString() }).eq("recipient_id", me.id).is("read_at", null);
  revalidatePath("/", "layout");
}

// ---------- Templates ----------
export async function saveTemplate(formData: FormData) {
  const me = await requireLead("/templates");
  const id = str(formData, "id");
  const name = str(formData, "name").slice(0, 120);
  const title = str(formData, "title").slice(0, 200);
  if (name.length < 2) back("/templates", { error: "Give the template a name." });
  if (title.length < 3) back("/templates", { error: "Give the task a title of at least 3 characters." });
  const checklist = str(formData, "checklist")
    .split(/\r?\n/)
    .map((l) => l.replace(/^[-*•\s]+/, "").trim().slice(0, 300))
    .filter(Boolean)
    .slice(0, 50);

  const row = {
    name,
    title,
    description: str(formData, "description").slice(0, 4000) || null,
    priority: oneOf(str(formData, "priority"), TASK_PRIORITIES) ?? "medium",
    due_in_days: int(formData, "due_in_days", 0, 365, 7),
    requires_approval: formData.get("requires_approval") === "on",
    checklist,
    unit_id: isHead(me) ? (UUID.test(str(formData, "unit_id")) ? str(formData, "unit_id") : null) : me.unit_id,
  };

  const supabase = createClient();
  if (UUID.test(id)) {
    const { data: existing } = await supabase.from("task_templates").select("unit_id").eq("id", id).maybeSingle();
    if (!existing || (!isHead(me) && existing.unit_id !== me.unit_id)) back("/templates", { error: "You can only edit your unit's templates." });
    const { error } = await supabase.from("task_templates").update(row).eq("id", id);
    if (error) back("/templates", { error: error.message });
  } else {
    const { error } = await supabase.from("task_templates").insert({ ...row, created_by: me.id });
    if (error) back("/templates", { error: error.message });
  }
  revalidatePath("/templates");
  back("/templates", { saved: name });
}

export async function deleteTemplate(formData: FormData) {
  const me = await requireLead("/templates");
  const id = str(formData, "id");
  const supabase = createClient();
  const { data: t } = await supabase.from("task_templates").select("unit_id, name").eq("id", id).maybeSingle();
  if (!t || (!isHead(me) && t.unit_id !== me.unit_id)) back("/templates", { error: "You can only delete your unit's templates." });
  await supabase.from("task_templates").delete().eq("id", id);
  revalidatePath("/templates");
  back("/templates", { deleted: t!.name });
}

// ---------- Recurring tasks ----------
export async function saveRecurringRule(formData: FormData) {
  const me = await requireLead("/recurring");
  const id = str(formData, "id");
  const title = str(formData, "title").slice(0, 200);
  const assigneeId = str(formData, "assignee_id");
  const frequency = oneOf(str(formData, "frequency"), FREQUENCIES);
  const firstDue = str(formData, "first_due");
  if (title.length < 3) back("/recurring", { error: "Give the task a title of at least 3 characters." });
  if (!frequency) back("/recurring", { error: "Choose how often it repeats." });
  if (!DATE.test(firstDue)) back("/recurring", { error: "Choose the first due date." });

  const supabase = createClient();
  const { data: assignee } = await supabase.from("profiles").select("id, unit_id, is_active").eq("id", assigneeId).maybeSingle();
  if (!assignee?.is_active) back("/recurring", { error: "Choose who does it." });
  if (!canAssignTo(me, assignee!)) back("/recurring", { error: "You can only set up recurring work for people in your unit." });
  const unitId = assignee!.unit_id ?? me.unit_id;
  if (!unitId) back("/recurring", { error: "That person has no unit yet." });

  const templateId = str(formData, "template_id");
  const day = Number(firstDue.slice(8, 10));
  const row = {
    title,
    description: str(formData, "description").slice(0, 4000) || null,
    assignee_id: assigneeId,
    unit_id: unitId!,
    frequency: frequency!,
    next_due_date: firstDue,
    day_of_month: frequency === "monthly" || frequency === "quarterly" ? day : null,
    day_of_week: frequency === "weekly" ? new Date(`${firstDue}T00:00:00Z`).getUTCDay() : null,
    lead_days: int(formData, "lead_days", 0, 60, frequency === "daily" ? 0 : 3),
    priority: oneOf(str(formData, "priority"), TASK_PRIORITIES) ?? "medium",
    requires_approval: assigneeId !== me.id && formData.get("requires_approval") === "on",
    template_id: UUID.test(templateId) ? templateId : null,
  };

  if (UUID.test(id)) {
    const { data: existing } = await supabase.from("recurrence_rules").select("unit_id").eq("id", id).maybeSingle();
    if (!existing || (!isHead(me) && existing.unit_id !== me.unit_id)) back("/recurring", { error: "You can only edit your unit's recurring tasks." });
    const { error } = await supabase.from("recurrence_rules").update(row).eq("id", id);
    if (error) back("/recurring", { error: error.message });
  } else {
    const { error } = await supabase.from("recurrence_rules").insert({ ...row, created_by: me.id });
    if (error) back("/recurring", { error: error.message });
  }
  // Create anything already inside the lead window, so people see it straight away.
  await supabase.rpc("generate_recurring_tasks");
  revalidatePath("/", "layout");
  back("/recurring", { saved: title });
}

export async function toggleRecurringRule(formData: FormData) {
  const me = await requireLead("/recurring");
  const id = str(formData, "id");
  const supabase = createClient();
  const { data: r } = await supabase.from("recurrence_rules").select("unit_id, is_active").eq("id", id).maybeSingle();
  if (!r || (!isHead(me) && r.unit_id !== me.unit_id)) back("/recurring", { error: "You can only change your unit's recurring tasks." });
  await supabase.from("recurrence_rules").update({ is_active: !r!.is_active }).eq("id", id);
  if (!r!.is_active) await supabase.rpc("generate_recurring_tasks");
  revalidatePath("/recurring");
}

export async function deleteRecurringRule(formData: FormData) {
  const me = await requireLead("/recurring");
  const id = str(formData, "id");
  const supabase = createClient();
  const { data: r } = await supabase.from("recurrence_rules").select("unit_id").eq("id", id).maybeSingle();
  if (!r || (!isHead(me) && r.unit_id !== me.unit_id)) back("/recurring", { error: "You can only delete your unit's recurring tasks." });
  await supabase.from("recurrence_rules").delete().eq("id", id);
  revalidatePath("/recurring");
  back("/recurring", { deleted: "1" });
}

// ---------- Projects ----------
export async function saveProject(formData: FormData) {
  const me = await requireLead("/projects");
  const id = str(formData, "id");
  const title = str(formData, "title").slice(0, 200);
  if (title.length < 3) back(UUID.test(id) ? `/projects/${id}` : "/projects", { error: "Give the project a title of at least 3 characters." });
  const unitId = resolveUnit(me, str(formData, "unit_id"));
  if (!unitId) back("/projects", { error: "Choose a unit for the project." });
  const ownerId = str(formData, "owner_id");
  const start = str(formData, "start_date");
  const target = str(formData, "target_date");

  const row = {
    title,
    description: str(formData, "description").slice(0, 4000) || null,
    unit_id: unitId!,
    owner_id: UUID.test(ownerId) ? ownerId : me.id,
    status: oneOf(str(formData, "status"), PROJECT_STATUSES) ?? "active",
    start_date: DATE.test(start) ? start : null,
    target_date: DATE.test(target) ? target : null,
  };

  const supabase = createClient();
  if (UUID.test(id)) {
    const { data: p } = await supabase.from("projects").select("unit_id").eq("id", id).maybeSingle();
    if (!p || (!isHead(me) && p.unit_id !== me.unit_id)) back("/projects", { error: "You can only edit your unit's projects." });
    const { error } = await supabase.from("projects").update(row).eq("id", id);
    if (error) back(`/projects/${id}`, { error: error.message });
    revalidatePath("/", "layout");
    back(`/projects/${id}`, { saved: "1" });
  }
  const { data, error } = await supabase.from("projects").insert({ ...row, created_by: me.id }).select("id").single();
  if (error || !data) back("/projects", { error: error?.message ?? "Couldn't create the project." });
  revalidatePath("/", "layout");
  redirect(`/projects/${data!.id}?saved=1`);
}

// ---------- Leave ----------
export async function addLeave(formData: FormData) {
  const me = await requirePerson();
  const profileId = str(formData, "profile_id") || me.id;
  const start = str(formData, "start_date");
  const end = str(formData, "end_date");
  if (!DATE.test(start) || !DATE.test(end)) back("/leave", { error: "Choose the first and last day of leave." });
  if (end < start) back("/leave", { error: "The last day can't be before the first day." });

  const supabase = createClient();
  if (profileId !== me.id) {
    const { data: p } = await supabase.from("profiles").select("id, unit_id").eq("id", profileId).maybeSingle();
    if (!p || !isLead(me) || !canAssignTo(me, p)) back("/leave", { error: "You can add leave for yourself, or for people in your unit if you're their manager." });
  }
  const { error } = await supabase.from("leave").insert({
    profile_id: profileId,
    start_date: start,
    end_date: end,
    kind: oneOf(str(formData, "kind"), LEAVE_KINDS) ?? "annual",
    note: str(formData, "note").slice(0, 200) || null,
    created_by: me.id,
  });
  if (error) back("/leave", { error: error.message });
  revalidatePath("/", "layout");
  back("/leave", { saved: "1" });
}

export async function deleteLeave(formData: FormData) {
  const me = await requirePerson();
  const id = str(formData, "id");
  const supabase = createClient();
  const { data: l } = await supabase.from("leave").select("profile_id, created_by").eq("id", id).maybeSingle();
  if (!l) back("/leave", { error: "Leave not found." });
  let allowed = l!.profile_id === me.id || l!.created_by === me.id || isHead(me);
  if (!allowed && isLead(me)) {
    const { data: p } = await supabase.from("profiles").select("id, unit_id").eq("id", l!.profile_id).maybeSingle();
    allowed = !!p && canAssignTo(me, p);
  }
  if (!allowed) back("/leave", { error: "You can't remove this leave." });
  await supabase.from("leave").delete().eq("id", id);
  revalidatePath("/", "layout");
  back("/leave", { removed: "1" });
}

// ---------- Settings (Head only) ----------
export async function saveSettings(formData: FormData) {
  const me = await requirePerson();
  if (!isHead(me)) back("/settings", { error: "Only the Head of Retail can change settings." });
  const rows = [
    { key: "escalation_days", value: int(formData, "escalation_days", 1, 30, 2) },
    { key: "overload_threshold", value: int(formData, "overload_threshold", 1, 100, 8) },
    { key: "digest_enabled", value: formData.get("digest_enabled") === "on" },
  ].map((r) => ({ ...r, updated_at: new Date().toISOString() }));
  const { error } = await createClient().from("app_settings").upsert(rows);
  if (error) back("/settings", { error: error.message });
  revalidatePath("/", "layout");
  back("/settings", { saved: "1" });
}
