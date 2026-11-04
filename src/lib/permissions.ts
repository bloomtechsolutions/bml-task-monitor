import type { Profile } from "@/lib/auth";

type TaskLike = { unit_id: string | null; assignee_id: string | null; assigned_by: string | null };

export const isHead = (me: Profile) => me.role === "head";
export const isLead = (me: Profile) => me.role === "head" || me.role === "manager";

/** Head: everything. Manager: tasks in their unit or that they assigned. Staff: tasks they assigned. */
export function canManageTask(me: Profile, t: TaskLike): boolean {
  if (me.role === "head") return true;
  if (t.assigned_by === me.id) return true;
  return me.role === "manager" && !!me.unit_id && t.unit_id === me.unit_id;
}

export function canViewTask(me: Profile, t: TaskLike): boolean {
  return t.assignee_id === me.id || canManageTask(me, t);
}

/** Approve a submitted task: the person who manages it, but never your own work (unless you're the head). */
export function canApprove(me: Profile, t: TaskLike): boolean {
  return canManageTask(me, t) && (t.assignee_id !== me.id || me.role === "head");
}

/** PostgREST `or` filter limiting tasks to what `me` may see. null = no limit. */
export function taskScope(me: Profile): string | null {
  if (me.role === "head") return null;
  const mine = `assignee_id.eq.${me.id},assigned_by.eq.${me.id}`;
  return me.role === "manager" && me.unit_id ? `unit_id.eq.${me.unit_id},${mine}` : mine;
}

/** Combine the visibility scope with another `or` filter in a single, valid PostgREST expression. */
export function scopedOr(me: Profile, extra?: string): string | null {
  const s = taskScope(me);
  if (s && extra) return `and(or(${s}),or(${extra}))`;
  return s ?? extra ?? null;
}

/** Who `me` may assign work to. */
export function canAssignTo(me: Profile, person: { id: string; unit_id: string | null }): boolean {
  if (me.role === "head" || person.id === me.id) return true;
  return me.role === "manager" && !!me.unit_id && person.unit_id === me.unit_id;
}

/** Unit filter for team-level pages: null = all units (head), otherwise the manager's unit. */
export function unitScope(me: Profile): string | null {
  return me.role === "head" ? null : me.unit_id;
}
