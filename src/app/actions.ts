"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getViewer, canManageTask } from "@/lib/auth";
import { TASK_PRIORITIES, TASK_STATUSES, USER_ROLES, type Enums } from "@/lib/database.types";

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
  redirect(`${path}?${new URLSearchParams(params).toString()}`);
}
/** Turns Postgres/RLS errors into something staff can act on. */
function friendly(message: string): string {
  if (message.includes("row-level security")) return "You don't have permission to do that.";
  return message;
}

// ---------- Create task ----------
export async function createTask(formData: FormData) {
  const viewer = await getViewer();
  const title = str(formData, "title");
  const description = str(formData, "description");
  const assigneeId = str(formData, "assignee_id");
  const dueDate = str(formData, "due_date");
  const priority = oneOf(str(formData, "priority"), TASK_PRIORITIES) ?? "medium";
  const parentId = str(formData, "parent_task_id");

  const errorBack = (error: string) =>
    back("/tasks/new", { error, ...(parentId ? { parent: parentId } : {}) });

  if (title.length < 3 || title.length > 200) errorBack("Give the task a title of 3–200 characters.");
  if (!UUID.test(assigneeId)) errorBack("Choose who the task is for.");
  if (!DATE.test(dueDate)) errorBack("Choose a due date.");

  const supabase = await createClient();

  // The task belongs to the assignee's unit. RLS rejects it if the viewer can't assign there.
  const { data: assignee } = await supabase
    .from("profiles")
    .select("id, unit_id, is_active")
    .eq("id", assigneeId)
    .maybeSingle();
  if (!assignee || !assignee.is_active || !assignee.unit_id) errorBack("That person isn't in a unit yet.");

  let parent: { id: string; project_id: string | null } | null = null;
  if (parentId) {
    if (!UUID.test(parentId)) errorBack("Parent task not found.");
    const { data } = await supabase.from("tasks").select("id, project_id").eq("id", parentId).maybeSingle();
    if (!data) errorBack("Parent task not found.");
    parent = data;
  }

  const { data: created, error } = await supabase
    .from("tasks")
    .insert({
      title,
      description: description || null,
      assignee_id: assigneeId,
      assigned_by: viewer.profile.id,
      unit_id: assignee!.unit_id!,
      due_date: dueDate,
      priority,
      parent_task_id: parent?.id ?? null,
      project_id: parent?.project_id ?? null,
    })
    .select("id")
    .single();

  if (error || !created) errorBack(friendly(error?.message ?? "Could not create the task."));

  revalidatePath("/", "layout");
  redirect(parent ? `/tasks/${parent.id}?saved=subtask` : `/tasks/${created!.id}?saved=created`);
}

// ---------- Progress update (assignee or manager) ----------
export async function postUpdate(formData: FormData) {
  await getViewer();
  const taskId = str(formData, "task_id");
  if (!UUID.test(taskId)) redirect("/");
  const path = `/tasks/${taskId}`;

  const status = oneOf(str(formData, "status"), TASK_STATUSES);
  const progressRaw = Number(str(formData, "progress"));
  const progress = Number.isInteger(progressRaw) && progressRaw >= 0 && progressRaw <= 100 ? progressRaw : null;
  const note = str(formData, "note").slice(0, 2000);

  if (status === "blocked" && !note) back(path, { error: "Say what's blocking the task so your manager can help." });

  const supabase = await createClient();
  const { data: current } = await supabase.from("tasks").select("status, progress").eq("id", taskId).maybeSingle();
  if (!current) back(path, { error: "Task not found." });

  const statusChanged = status !== null && status !== current!.status;
  const progressChanged = progress !== null && progress !== current!.progress;
  if (!statusChanged && !progressChanged && !note) back(path, { error: "Nothing changed. Move the progress, change the status or add a note." });

  const { error } = await supabase.rpc("post_task_update", {
    p_task_id: taskId,
    p_note: note,
    ...(statusChanged && status ? { p_status: status } : {}),
    ...(progressChanged && progress !== null ? { p_progress: progress } : {}),
  });
  if (error) back(path, { error: friendly(error.message) });

  revalidatePath("/", "layout");
  back(path, { saved: "update" });
}

// ---------- Comment ----------
export async function addComment(formData: FormData) {
  const viewer = await getViewer();
  const taskId = str(formData, "task_id");
  if (!UUID.test(taskId)) redirect("/");
  const path = `/tasks/${taskId}`;
  const body = str(formData, "body").slice(0, 4000);
  if (!body) back(path, { error: "Write a comment first." });

  const supabase = await createClient();
  const { error } = await supabase.from("task_comments").insert({ task_id: taskId, body, author_id: viewer.profile.id });
  if (error) back(path, { error: friendly(error.message) });

  revalidatePath(path);
  back(path, { saved: "comment" });
}

// ---------- Manager controls: due date, reassign, priority, cancel/reopen ----------
export async function manageTask(formData: FormData) {
  const viewer = await getViewer();
  const taskId = str(formData, "task_id");
  if (!UUID.test(taskId)) redirect("/");
  const path = `/tasks/${taskId}`;
  const intent = str(formData, "intent");

  const supabase = await createClient();
  const { data: task } = await supabase.from("tasks").select("id, unit_id, assigned_by, status").eq("id", taskId).maybeSingle();
  if (!task) back(path, { error: "Task not found." });
  if (!canManageTask(viewer, task!)) back(path, { error: "Only the unit manager or the person who assigned this task can change it." });

  type TaskPatch = { due_date?: string; priority?: Enums<"task_priority">; assignee_id?: string; unit_id?: string; status?: Enums<"task_status"> };
  const patch: TaskPatch = {};

  if (intent === "cancel") {
    patch.status = "cancelled";
  } else if (intent === "reopen") {
    patch.status = "in_progress";
  } else {
    const dueDate = str(formData, "due_date");
    const priority = oneOf(str(formData, "priority"), TASK_PRIORITIES);
    const assigneeId = str(formData, "assignee_id");
    if (dueDate) {
      if (!DATE.test(dueDate)) back(path, { error: "Invalid due date." });
      patch.due_date = dueDate;
    }
    if (priority) patch.priority = priority;
    if (assigneeId) {
      if (!UUID.test(assigneeId)) back(path, { error: "Choose a valid person." });
      const { data: p } = await supabase.from("profiles").select("unit_id, is_active").eq("id", assigneeId).maybeSingle();
      if (!p?.unit_id || !p.is_active) back(path, { error: "That person isn't in a unit yet." });
      patch.assignee_id = assigneeId;
      patch.unit_id = p!.unit_id!;
    }
  }

  const { error } = await supabase.from("tasks").update(patch).eq("id", taskId);
  if (error) back(path, { error: friendly(error.message) });

  revalidatePath("/", "layout");
  back(path, { saved: intent === "cancel" ? "cancelled" : intent === "reopen" ? "reopened" : "details" });
}

// ---------- People admin (Head only; also enforced by DB trigger + RLS) ----------
export async function updateProfile(formData: FormData) {
  const viewer = await getViewer();
  if (!viewer.isHead) redirect("/");

  const id = str(formData, "id");
  if (!UUID.test(id)) back("/admin", { error: "Unknown person." });
  const role = oneOf(str(formData, "role"), USER_ROLES);
  const unitId = str(formData, "unit_id");
  const fullName = str(formData, "full_name").slice(0, 120);
  const designation = str(formData, "designation").slice(0, 120);
  const staffNo = str(formData, "staff_no").slice(0, 20);
  const isActive = str(formData, "is_active") !== "false";

  if (!role) back("/admin", { error: "Choose a role." });
  if (role !== "head" && unitId && !UUID.test(unitId)) back("/admin", { error: "Choose a unit." });
  if (role === "manager" && !unitId) back("/admin", { error: "A unit manager needs a unit." });
  if (id === viewer.profile.id && (role !== "head" || !isActive)) back("/admin", { error: "You can't remove your own Head access." });

  const supabase = await createClient();
  const { error } = await supabase
    .from("profiles")
    .update({
      role: role!,
      unit_id: unitId || null,
      full_name: fullName || null,
      designation: designation || null,
      staff_no: staffNo || null,
      is_active: isActive,
    })
    .eq("id", id);
  if (error) back("/admin", { error: friendly(error.message) });

  revalidatePath("/", "layout");
  back("/admin", { saved: id });
}
