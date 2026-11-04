"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requirePerson, type Profile } from "@/lib/auth";
import { canApprove, canAssignTo, canManageTask, canViewTask, isHead } from "@/lib/permissions";
import { TASK_PRIORITIES, TASK_STATUSES, USER_ROLES, type Enums, type Json } from "@/lib/database.types";

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
/** Lines of a textarea → trimmed, non-empty checklist items. */
function lines(text: string, max = 30): string[] {
  return text
    .split(/\r?\n/)
    .map((l) => l.replace(/^[-*•\s]+/, "").trim().slice(0, 300))
    .filter(Boolean)
    .slice(0, max);
}

/** Append to a task's activity log. Never blocks the user's action if logging fails. */
async function logEvent(taskId: string, actorId: string, kind: string, detail: Record<string, unknown> = {}) {
  await createClient().from("task_events").insert({ task_id: taskId, actor_id: actorId, kind, detail: detail as Json });
}

async function loadTask(id: string) {
  if (!UUID.test(id)) redirect("/tasks");
  const { data } = await createClient()
    .from("tasks")
    .select("id, title, status, progress, priority, unit_id, assignee_id, assigned_by, requires_approval")
    .eq("id", id)
    .maybeSingle();
  if (!data) redirect("/tasks");
  return data;
}

// ---------- Create task ----------
export async function createTask(formData: FormData) {
  const me = await requirePerson();
  const title = str(formData, "title");
  const description = str(formData, "description");
  const assigneeId = str(formData, "assignee_id");
  const unitChoice = str(formData, "unit_id");
  const projectChoice = str(formData, "project_id");
  const dueDate = str(formData, "due_date");
  const priority = oneOf(str(formData, "priority"), TASK_PRIORITIES) ?? "medium";
  const parentId = str(formData, "parent_task_id");
  const checklist = lines(str(formData, "checklist"));

  const errorBack = (error: string): never => back("/tasks/new", { error, ...(parentId ? { parent: parentId } : {}) });

  if (title.length < 3 || title.length > 200) errorBack("Give the task a title of 3–200 characters.");
  if (!UUID.test(assigneeId)) errorBack("Choose who the task is for.");
  if (!DATE.test(dueDate)) errorBack("Choose a due date.");

  const supabase = createClient();
  const { data: assignee } = await supabase.from("profiles").select("id, unit_id, is_active").eq("id", assigneeId).maybeSingle();
  if (!assignee || !assignee.is_active) errorBack("That person isn't on the team list.");
  if (!canAssignTo(me, assignee!)) {
    errorBack(me.role === "staff" ? "You can only add tasks for yourself. Ask your manager to assign work to others." : "You can only assign tasks to people in your unit.");
  }

  let parent: { id: string; project_id: string | null; unit_id: string; assignee_id: string; assigned_by: string | null } | null = null;
  if (parentId) {
    if (!UUID.test(parentId)) errorBack("Parent task not found.");
    const { data } = await supabase.from("tasks").select("id, project_id, unit_id, assignee_id, assigned_by").eq("id", parentId).maybeSingle();
    if (!data || !canViewTask(me, data)) errorBack("Parent task not found.");
    parent = data;
  }

  const unitId = (UUID.test(unitChoice) && isHead(me) ? unitChoice : null) ?? assignee!.unit_id ?? parent?.unit_id ?? me.unit_id;
  if (!unitId) errorBack("This person has no unit. Choose which unit the task belongs to.");

  const requiresApproval = assigneeId !== me.id && formData.get("requires_approval") === "on";

  const { data: created, error } = await supabase
    .from("tasks")
    .insert({
      title,
      description: description || null,
      assignee_id: assigneeId,
      assigned_by: me.id,
      unit_id: unitId!,
      due_date: dueDate,
      priority,
      requires_approval: requiresApproval,
      parent_task_id: parent?.id ?? null,
      project_id: (UUID.test(projectChoice) ? projectChoice : null) ?? parent?.project_id ?? null,
    })
    .select("id")
    .single();
  if (error || !created) errorBack(error?.message ?? "Could not create the task.");

  if (checklist.length) {
    await supabase.from("task_checklist_items").insert(checklist.map((body, i) => ({ task_id: created!.id, body, position: i + 1 })));
    await logEvent(created!.id, me.id, "checklist_added", { items: checklist });
  }
  if (parent) await logEvent(parent.id, me.id, "subtask_added", { title, task_id: created!.id });

  revalidatePath("/", "layout");
  redirect(parent ? `/tasks/${parent.id}?saved=subtask` : `/tasks/${created!.id}?saved=created`);
}

// ---------- Status changes (shared by the task page and the board) ----------
type StatusResult = { ok: true; status: Enums<"task_status"> } | { ok: false; error: string };

async function applyStatus(
  me: Profile,
  task: Awaited<ReturnType<typeof loadTask>>,
  wanted: Enums<"task_status"> | null,
  progress: number | null,
  note: string,
): Promise<StatusResult> {
  const isAssignee = task.assignee_id === me.id;
  if (!isAssignee && !canManageTask(me, task)) return { ok: false, error: "Only the person doing the task or their manager can update it." };
  if (task.status === "cancelled") return { ok: false, error: "This task was cancelled. Reopen it first." };
  if (wanted === "blocked" && !note) return { ok: false, error: "Say what's blocking the task so your manager can help." };

  // "Done" on a task that needs sign-off becomes "Submitted" unless the approver is doing it.
  let status = wanted;
  if (status === "done" && task.requires_approval && !canApprove(me, task)) status = "submitted";
  if (status === "submitted" && !task.requires_approval) status = "done";
  if (task.status === "submitted" && status === "done" && !canApprove(me, task)) {
    return { ok: false, error: "This task is waiting for sign-off by the person who assigned it." };
  }

  const statusChanged = status !== null && status !== task.status;
  const progressChanged = progress !== null && progress !== task.progress;
  if (!statusChanged && !progressChanged && !note) return { ok: false, error: "Nothing changed. Change the status or add a note." };

  const { error } = await createClient().rpc("post_task_update", {
    p_task_id: task.id,
    p_note: note,
    p_actor: me.id,
    ...(statusChanged && status ? { p_status: status } : {}),
    ...(progressChanged && progress !== null ? { p_progress: progress } : {}),
  });
  if (error) return { ok: false, error: error.message };
  if (statusChanged && status === "done" && task.requires_approval) {
    await createClient().from("tasks").update({ approved_by: me.id }).eq("id", task.id);
  }
  return { ok: true, status: (status ?? task.status) as Enums<"task_status"> };
}

export async function postUpdate(formData: FormData) {
  const me = await requirePerson();
  const task = await loadTask(str(formData, "task_id"));
  const path = `/tasks/${task.id}`;
  // Progress is calculated by the database from status and checklist; it is never taken from the form.
  const res = await applyStatus(me, task, oneOf(str(formData, "status"), TASK_STATUSES), null, str(formData, "note").slice(0, 2000));
  if (!res.ok) back(path, { error: res.error });
  revalidatePath("/", "layout");
  back(path, { saved: res.status === "submitted" && task.status !== "submitted" ? "submitted" : "update" });
}

/** Board drag-and-drop. Returns an error message instead of redirecting. */
export async function moveTask(taskId: string, status: string, note: string): Promise<{ error?: string }> {
  const me = await requirePerson();
  const wanted = oneOf(status, TASK_STATUSES);
  if (!wanted || wanted === "cancelled") return { error: "That column isn't a valid status." };
  const task = await loadTask(taskId);
  const res = await applyStatus(me, task, wanted, null, note.trim().slice(0, 2000));
  if (!res.ok) return { error: res.error };
  revalidatePath("/", "layout");
  return {};
}

// ---------- Approval ----------
export async function reviewTask(formData: FormData) {
  const me = await requirePerson();
  const task = await loadTask(str(formData, "task_id"));
  const path = `/tasks/${task.id}`;
  const decision = str(formData, "decision");
  const note = str(formData, "note").slice(0, 2000);

  if (!canApprove(me, task)) back(path, { error: "Only the person who assigned this task (or their manager) can sign it off." });
  if (task.status !== "submitted") back(path, { error: "This task isn't waiting for sign-off." });
  if (decision === "return" && !note) back(path, { error: "Say what needs to change so they can fix it." });

  const supabase = createClient();
  const { error } = await supabase.rpc("post_task_update", {
    p_task_id: task.id,
    p_note: note,
    p_actor: me.id,
    p_status: decision === "approve" ? "done" : "in_progress",
  });
  if (error) back(path, { error: error.message });
  if (decision === "approve") await supabase.from("tasks").update({ approved_by: me.id }).eq("id", task.id);

  revalidatePath("/", "layout");
  back(path, { saved: decision === "approve" ? "approved" : "returned" });
}

// ---------- Comment ----------
export async function addComment(formData: FormData) {
  const me = await requirePerson();
  const task = await loadTask(str(formData, "task_id"));
  const path = `/tasks/${task.id}`;
  if (!canViewTask(me, task)) redirect("/tasks");
  const body = str(formData, "body").slice(0, 4000);
  if (!body) back(path, { error: "Write a comment first." });

  const { error } = await createClient().from("task_comments").insert({ task_id: task.id, body, author_id: me.id });
  if (error) back(path, { error: error.message });

  revalidatePath(path);
  back(path, { saved: "comment" });
}

// ---------- Due date / priority / reassign / cancel / reopen ----------
export async function manageTask(formData: FormData) {
  const me = await requirePerson();
  const task = await loadTask(str(formData, "task_id"));
  const path = `/tasks/${task.id}`;
  if (!canManageTask(me, task)) back(path, { error: "Only the person who assigned this task or their manager can change it." });
  const intent = str(formData, "intent");
  const supabase = createClient();

  const patch: Record<string, string> = {};
  if (intent === "cancel") patch.status = "cancelled";
  else if (intent === "reopen") patch.status = "in_progress";
  else {
    const dueDate = str(formData, "due_date");
    const priority = oneOf(str(formData, "priority"), TASK_PRIORITIES);
    const assigneeId = str(formData, "assignee_id");
    if (dueDate) {
      if (!DATE.test(dueDate)) back(path, { error: "Invalid due date." });
      patch.due_date = dueDate;
    }
    if (priority) patch.priority = priority;
    if (assigneeId && assigneeId !== task.assignee_id) {
      if (!UUID.test(assigneeId)) back(path, { error: "Choose a valid person." });
      const { data: p } = await supabase.from("profiles").select("id, unit_id, is_active").eq("id", assigneeId).maybeSingle();
      if (!p?.is_active) back(path, { error: "That person isn't on the team list." });
      if (!canAssignTo(me, p!)) back(path, { error: "You can only reassign to people in your unit." });
      patch.assignee_id = assigneeId;
      if (p!.unit_id) patch.unit_id = p!.unit_id;
    }
  }

  const { error } = await supabase.rpc("update_task_as", { p_task_id: task.id, p_patch: patch, p_actor: me.id });
  if (error) back(path, { error: error.message });
  if (patch.priority && patch.priority !== task.priority) await logEvent(task.id, me.id, "priority", { from: task.priority, to: patch.priority });
  if (patch.assignee_id) await logEvent(task.id, me.id, "reassigned", { from: task.assignee_id, to: patch.assignee_id });

  revalidatePath("/", "layout");
  back(path, { saved: intent === "cancel" ? "cancelled" : intent === "reopen" ? "reopened" : "details" });
}

// ---------- Checklist ----------
async function checklistGuard(taskId: string) {
  const me = await requirePerson();
  const task = await loadTask(taskId);
  if (task.assignee_id !== me.id && !canManageTask(me, task)) back(`/tasks/${task.id}`, { error: "You can't edit this checklist." });
  return { me, task };
}

export async function addChecklistItems(formData: FormData) {
  const { task } = await checklistGuard(str(formData, "task_id"));
  const items = lines(str(formData, "body"), 50);
  if (!items.length) back(`/tasks/${task.id}`, { error: "Write the checklist item first." });
  const supabase = createClient();
  const { data: last } = await supabase
    .from("task_checklist_items")
    .select("position")
    .eq("task_id", task.id)
    .order("position", { ascending: false })
    .limit(1)
    .maybeSingle();
  const start = (last?.position ?? 0) + 1;
  await supabase.from("task_checklist_items").insert(items.map((body, i) => ({ task_id: task.id, body, position: start + i })));
  await logEvent(task.id, (await requirePerson()).id, "checklist_added", { items });
  revalidatePath(`/tasks/${task.id}`);
}

export async function toggleChecklistItem(formData: FormData) {
  const { me, task } = await checklistGuard(str(formData, "task_id"));
  const itemId = str(formData, "item_id");
  if (!UUID.test(itemId)) return;
  const done = str(formData, "done") === "1";
  const { data: item } = await createClient()
    .from("task_checklist_items")
    .update(done ? { is_done: true, done_by: me.id, done_at: new Date().toISOString() } : { is_done: false, done_by: null, done_at: null })
    .eq("id", itemId)
    .eq("task_id", task.id)
    .select("body")
    .maybeSingle();
  if (item) await logEvent(task.id, me.id, done ? "checklist_done" : "checklist_undone", { body: item.body });
  revalidatePath(`/tasks/${task.id}`);
}

export async function deleteChecklistItem(formData: FormData) {
  const { me, task } = await checklistGuard(str(formData, "task_id"));
  const itemId = str(formData, "item_id");
  if (!UUID.test(itemId)) return;
  const { data: item } = await createClient().from("task_checklist_items").delete().eq("id", itemId).eq("task_id", task.id).select("body").maybeSingle();
  if (item) await logEvent(task.id, me.id, "checklist_removed", { body: item.body });
  revalidatePath(`/tasks/${task.id}`);
}

// ---------- Evidence ----------
const MAX_FILE = 4 * 1024 * 1024;
const EXT_TYPES: Record<string, string> = {
  pdf: "application/pdf", png: "image/png", jpg: "image/jpeg", jpeg: "image/jpeg", webp: "image/webp", heic: "image/heic",
  csv: "text/csv", txt: "text/plain", doc: "application/msword",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  xls: "application/vnd.ms-excel", xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
};

export async function uploadEvidence(formData: FormData) {
  const me = await requirePerson();
  const task = await loadTask(str(formData, "task_id"));
  const path = `/tasks/${task.id}`;
  if (task.assignee_id !== me.id && !canManageTask(me, task)) back(path, { error: "You can't add files to this task." });

  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) back(path, { error: "Choose a file to upload." });
  const f = file as File;
  if (f.size > MAX_FILE) back(path, { error: "Files must be 4 MB or smaller. Compress the scan or split it." });
  const ext = (f.name.split(".").pop() ?? "").toLowerCase();
  const contentType = EXT_TYPES[ext];
  if (!contentType) back(path, { error: "Upload a PDF, image, Word, Excel, CSV or text file." });

  const safeName = f.name.replace(/[^\w.\- ]+/g, "_").slice(-120);
  const storagePath = `${task.id}/${crypto.randomUUID()}.${ext}`;
  const supabase = createClient();
  const { error: upErr } = await supabase.storage.from("task-evidence").upload(storagePath, f, { contentType, upsert: false });
  if (upErr) back(path, { error: `Upload failed: ${upErr.message}` });

  const { error } = await supabase.from("task_attachments").insert({
    task_id: task.id, file_name: safeName, storage_path: storagePath, size_bytes: f.size, content_type: contentType, uploaded_by: me.id,
  });
  if (error) {
    await supabase.storage.from("task-evidence").remove([storagePath]);
    back(path, { error: error.message });
  }
  await logEvent(task.id, me.id, "file_added", { name: safeName, size: f.size });
  revalidatePath("/", "layout");
  back(path, { saved: "file" });
}

export async function deleteEvidence(formData: FormData) {
  const me = await requirePerson();
  const task = await loadTask(str(formData, "task_id"));
  const path = `/tasks/${task.id}`;
  const fileId = str(formData, "file_id");
  if (!UUID.test(fileId)) back(path, { error: "File not found." });
  const supabase = createClient();
  const { data: f } = await supabase.from("task_attachments").select("id, storage_path, uploaded_by, file_name").eq("id", fileId).eq("task_id", task.id).maybeSingle();
  if (!f) back(path, { error: "File not found." });
  if (f!.uploaded_by !== me.id && !canManageTask(me, task)) back(path, { error: "Only the uploader or the task's manager can remove this file." });
  await supabase.storage.from("task-evidence").remove([f!.storage_path]);
  await supabase.from("task_attachments").delete().eq("id", f!.id);
  await logEvent(task.id, me.id, "file_removed", { name: f!.file_name });
  revalidatePath("/", "layout");
  back(path, { saved: "file_removed" });
}

// ---------- People & units (Head only) ----------
async function requireHead() {
  const me = await requirePerson();
  if (!isHead(me)) back("/", { error: "Only the Head of Retail can manage people and units." });
  return me;
}

function readPerson(formData: FormData) {
  const role = oneOf(str(formData, "role"), USER_ROLES) ?? "staff";
  const unitId = str(formData, "unit_id");
  return {
    full_name: str(formData, "full_name").slice(0, 120),
    staff_no: str(formData, "staff_no").slice(0, 20) || null,
    designation: str(formData, "designation").slice(0, 120) || null,
    email: str(formData, "email").slice(0, 160).toLowerCase() || null,
    role,
    unit_id: UUID.test(unitId) ? unitId : null,
  };
}

function friendly(message: string): string {
  if (message.includes("profiles_staff_no_key")) return "Another person already has that staff number.";
  if (message.includes("profiles_email_key")) return "Another person already has that email.";
  return message;
}

export async function addPerson(formData: FormData) {
  await requireHead();
  const p = readPerson(formData);
  if (p.full_name.length < 2) back("/admin", { error: "Enter the person's name." });
  if (!p.staff_no) back("/admin", { error: "Enter the staff number. People sign in with it." });
  if (p.role !== "head" && !p.unit_id) back("/admin", { error: "Choose a unit for this person." });
  const password = String(formData.get("temp_password") ?? "");
  if (password && password.length < 8) back("/admin", { error: "Temporary passwords need at least 8 characters." });

  const supabase = createClient();
  const { data, error } = await supabase.from("profiles").insert(p).select("id").single();
  if (error || !data) back("/admin", { error: friendly(error?.message ?? "Could not add the person.") });
  if (password) await supabase.rpc("auth_set_password", { p_profile_id: data!.id, p_password: password, p_temporary: true });

  revalidatePath("/", "layout");
  back("/admin", { saved: data!.id });
}

export async function updateProfile(formData: FormData) {
  const me = await requireHead();
  const id = str(formData, "id");
  if (!UUID.test(id)) back("/admin", { error: "Unknown person." });
  const p = readPerson(formData);
  if (p.full_name.length < 2) back("/admin", { error: "Enter the person's name." });
  if (!p.staff_no) back("/admin", { error: "Enter the staff number. People sign in with it." });
  if (p.role === "manager" && !p.unit_id) back("/admin", { error: "A unit manager needs a unit." });
  const isActive = str(formData, "is_active") !== "false";
  if (id === me.id && (p.role !== "head" || !isActive)) back("/admin", { error: "You can't remove your own Head access or deactivate yourself." });

  const supabase = createClient();
  const { data: before } = await supabase.from("profiles").select("is_active, session_version").eq("id", id).maybeSingle();
  const { error } = await supabase
    .from("profiles")
    .update({
      ...p,
      is_active: isActive,
      // Deactivating someone signs them out everywhere.
      ...(before?.is_active && !isActive ? { session_version: before.session_version + 1 } : {}),
    })
    .eq("id", id);
  if (error) back("/admin", { error: friendly(error.message) });

  revalidatePath("/", "layout");
  back("/admin", { saved: id });
}

export async function setTempPassword(formData: FormData) {
  await requireHead();
  const id = str(formData, "id");
  const password = String(formData.get("temp_password") ?? "");
  if (!UUID.test(id)) back("/admin", { error: "Unknown person." });
  if (password.length < 8) back("/admin", { error: "Temporary passwords need at least 8 characters." });
  const { error } = await createClient().rpc("auth_set_password", { p_profile_id: id, p_password: password, p_temporary: true });
  if (error) back("/admin", { error: error.message });
  revalidatePath("/admin");
  back("/admin", { pw: id });
}

export async function saveUnit(formData: FormData) {
  await requireHead();
  const id = str(formData, "id");
  const name = str(formData, "name").slice(0, 120);
  const code = str(formData, "code").slice(0, 20).toUpperCase();
  const managerId = str(formData, "manager_id");
  if (name.length < 2) back("/admin", { error: "Enter the unit's name." });
  if (!code) back("/admin", { error: "Enter a short code for the unit, e.g. CARDS." });

  const supabase = createClient();
  const row = { name, code, is_active: str(formData, "is_active") !== "false", manager_id: UUID.test(managerId) ? managerId : null };
  const { error } = UUID.test(id) ? await supabase.from("units").update(row).eq("id", id) : await supabase.from("units").insert(row);
  if (error) {
    back("/admin", { error: error.code === "23505" ? "A unit with that name or code already exists." : error.message });
  }

  revalidatePath("/", "layout");
  back("/admin", { unit: name });
}
