"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getPerson, PERSON_COOKIE } from "@/lib/auth";
import { TASK_PRIORITIES, TASK_STATUSES, USER_ROLES } from "@/lib/database.types";

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

// ---------- "I am…" ----------
export async function setPerson(formData: FormData) {
  const id = str(formData, "person_id");
  const jar = await cookies();
  if (UUID.test(id)) {
    jar.set(PERSON_COOKIE, id, { httpOnly: true, sameSite: "lax", secure: true, path: "/", maxAge: 60 * 60 * 24 * 365 });
  } else {
    jar.delete(PERSON_COOKIE);
  }
  revalidatePath("/", "layout");
}

// ---------- Create task ----------
export async function createTask(formData: FormData) {
  const actor = await getPerson();
  const title = str(formData, "title");
  const description = str(formData, "description");
  const assigneeId = str(formData, "assignee_id");
  const unitChoice = str(formData, "unit_id");
  const dueDate = str(formData, "due_date");
  const priority = oneOf(str(formData, "priority"), TASK_PRIORITIES) ?? "medium";
  const parentId = str(formData, "parent_task_id");

  const errorBack = (error: string): never => back("/tasks/new", { error, ...(parentId ? { parent: parentId } : {}) });

  if (title.length < 3 || title.length > 200) errorBack("Give the task a title of 3–200 characters.");
  if (!UUID.test(assigneeId)) errorBack("Choose who the task is for.");
  if (!DATE.test(dueDate)) errorBack("Choose a due date.");

  const supabase = createClient();
  const { data: assignee } = await supabase.from("profiles").select("id, unit_id, is_active").eq("id", assigneeId).maybeSingle();
  if (!assignee || !assignee.is_active) errorBack("That person isn't on the team list.");

  let parent: { id: string; project_id: string | null; unit_id: string } | null = null;
  if (parentId) {
    if (!UUID.test(parentId)) errorBack("Parent task not found.");
    const { data } = await supabase.from("tasks").select("id, project_id, unit_id").eq("id", parentId).maybeSingle();
    if (!data) errorBack("Parent task not found.");
    parent = data;
  }

  // Unit: explicit choice, else the assignee's unit, else the parent's.
  const unitId = (UUID.test(unitChoice) ? unitChoice : null) ?? assignee!.unit_id ?? parent?.unit_id ?? null;
  if (!unitId) errorBack("This person has no unit. Choose which unit the task belongs to.");

  const { data: created, error } = await supabase
    .from("tasks")
    .insert({
      title,
      description: description || null,
      assignee_id: assigneeId,
      assigned_by: actor?.id ?? null,
      unit_id: unitId!,
      due_date: dueDate,
      priority,
      parent_task_id: parent?.id ?? null,
      project_id: parent?.project_id ?? null,
    })
    .select("id")
    .single();
  if (error || !created) errorBack(error?.message ?? "Could not create the task.");

  revalidatePath("/", "layout");
  redirect(parent ? `/tasks/${parent.id}?saved=subtask` : `/tasks/${created!.id}?saved=created`);
}

// ---------- Progress update ----------
export async function postUpdate(formData: FormData) {
  const actor = await getPerson();
  const taskId = str(formData, "task_id");
  if (!UUID.test(taskId)) redirect("/");
  const path = `/tasks/${taskId}`;

  const status = oneOf(str(formData, "status"), TASK_STATUSES);
  const progressRaw = Number(str(formData, "progress"));
  const progress = Number.isInteger(progressRaw) && progressRaw >= 0 && progressRaw <= 100 ? progressRaw : null;
  const note = str(formData, "note").slice(0, 2000);
  if (status === "blocked" && !note) back(path, { error: "Say what's blocking the task so your manager can help." });

  const supabase = createClient();
  const { data: current } = await supabase.from("tasks").select("status, progress").eq("id", taskId).maybeSingle();
  if (!current) back(path, { error: "Task not found." });

  const statusChanged = status !== null && status !== current!.status;
  const progressChanged = progress !== null && progress !== current!.progress;
  if (!statusChanged && !progressChanged && !note) back(path, { error: "Nothing changed. Move the progress, change the status or add a note." });

  const { error } = await supabase.rpc("post_task_update", {
    p_task_id: taskId,
    p_note: note,
    ...(actor ? { p_actor: actor.id } : {}),
    ...(statusChanged && status ? { p_status: status } : {}),
    ...(progressChanged && progress !== null ? { p_progress: progress } : {}),
  });
  if (error) back(path, { error: error.message });

  revalidatePath("/", "layout");
  back(path, { saved: "update" });
}

// ---------- Comment ----------
export async function addComment(formData: FormData) {
  const actor = await getPerson();
  const taskId = str(formData, "task_id");
  if (!UUID.test(taskId)) redirect("/");
  const path = `/tasks/${taskId}`;
  const body = str(formData, "body").slice(0, 4000);
  if (!body) back(path, { error: "Write a comment first." });

  const { error } = await createClient().from("task_comments").insert({ task_id: taskId, body, author_id: actor?.id ?? null });
  if (error) back(path, { error: error.message });

  revalidatePath(path);
  back(path, { saved: "comment" });
}

// ---------- Due date / priority / reassign / cancel / reopen ----------
export async function manageTask(formData: FormData) {
  const actor = await getPerson();
  const taskId = str(formData, "task_id");
  if (!UUID.test(taskId)) redirect("/");
  const path = `/tasks/${taskId}`;
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
    if (assigneeId) {
      if (!UUID.test(assigneeId)) back(path, { error: "Choose a valid person." });
      const { data: p } = await supabase.from("profiles").select("unit_id, is_active").eq("id", assigneeId).maybeSingle();
      if (!p?.is_active) back(path, { error: "That person isn't on the team list." });
      patch.assignee_id = assigneeId;
      if (p!.unit_id) patch.unit_id = p!.unit_id;
    }
  }

  const { error } = await supabase.rpc("update_task_as", {
    p_task_id: taskId,
    p_patch: patch,
    ...(actor ? { p_actor: actor.id } : {}),
  });
  if (error) back(path, { error: error.message });

  revalidatePath("/", "layout");
  back(path, { saved: intent === "cancel" ? "cancelled" : intent === "reopen" ? "reopened" : "details" });
}

// ---------- People ----------
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

export async function addPerson(formData: FormData) {
  const p = readPerson(formData);
  if (p.full_name.length < 2) back("/admin", { error: "Enter the person's name." });
  if (p.role !== "head" && !p.unit_id) back("/admin", { error: "Choose a unit for this person." });

  const { data, error } = await createClient().from("profiles").insert(p).select("id").single();
  if (error || !data) back("/admin", { error: error?.message ?? "Could not add the person." });

  revalidatePath("/", "layout");
  back("/admin", { saved: data!.id });
}

export async function updateProfile(formData: FormData) {
  const id = str(formData, "id");
  if (!UUID.test(id)) back("/admin", { error: "Unknown person." });
  const p = readPerson(formData);
  if (p.full_name.length < 2) back("/admin", { error: "Enter the person's name." });
  if (p.role === "manager" && !p.unit_id) back("/admin", { error: "A unit manager needs a unit." });

  const { error } = await createClient()
    .from("profiles")
    .update({ ...p, is_active: str(formData, "is_active") !== "false" })
    .eq("id", id);
  if (error) back("/admin", { error: error.message });

  revalidatePath("/", "layout");
  back("/admin", { saved: id });
}

// ---------- Units ----------
export async function saveUnit(formData: FormData) {
  const id = str(formData, "id");
  const name = str(formData, "name").slice(0, 120);
  const code = str(formData, "code").slice(0, 20).toUpperCase();
  if (name.length < 2) back("/admin", { error: "Enter the unit's name." });
  if (!code) back("/admin", { error: "Enter a short code for the unit, e.g. CARDS." });

  const supabase = createClient();
  const row = { name, code, is_active: str(formData, "is_active") !== "false" };
  const { error } = UUID.test(id)
    ? await supabase.from("units").update(row).eq("id", id)
    : await supabase.from("units").insert(row);
  if (error) {
    back("/admin", { error: error.code === "23505" ? "A unit with that name or code already exists." : error.message });
  }

  revalidatePath("/", "layout");
  back("/admin", { unit: name });
}
