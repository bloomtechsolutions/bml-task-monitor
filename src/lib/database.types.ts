// Generated from Supabase project ylpzyypgiovqxdaoqius (trimmed helper generics).
// Regenerate after schema changes.
export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

type Rel = {
  foreignKeyName: string;
  columns: string[];
  isOneToOne: boolean;
  referencedRelation: string;
  referencedColumns: string[];
};

/** Row + Insert (all optional except `R`) + Update (all optional). */
type T<Row, Req extends keyof Row = never> = {
  Row: Row;
  Insert: Partial<Row> & Pick<Row, Req>;
  Update: Partial<Row>;
  Relationships: Rel[];
};

type E = Database["public"]["Enums"];

export type Database = {
  __InternalSupabase: { PostgrestVersion: "14.18" };
  public: {
    Tables: {
      app_settings: T<{ key: string; updated_at: string; value: Json }, "key" | "value">;
      leave: T<
        {
          created_at: string; created_by: string | null; end_date: string; id: string; kind: E["leave_kind"];
          note: string | null; profile_id: string; start_date: string;
        },
        "end_date" | "profile_id" | "start_date"
      >;
      notifications: T<
        {
          actor_id: string | null; body: string | null; channel: string; dedupe_key: string | null; id: string; kind: string;
          read_at: string | null; recipient_id: string | null; sent_at: string; task_id: string | null;
        },
        "channel" | "kind"
      >;
      profiles: T<{
        created_at: string; designation: string | null; email: string | null; full_name: string | null; id: string;
        is_active: boolean; manager_id: string | null; role: E["user_role"]; session_version: number;
        staff_no: string | null; unit_id: string | null; updated_at: string;
      }>;
      projects: T<
        {
          created_at: string; created_by: string | null; description: string | null; id: string; owner_id: string | null;
          start_date: string | null; status: E["project_status"]; target_date: string | null; title: string; unit_id: string;
          updated_at: string;
        },
        "title" | "unit_id"
      >;
      recurrence_rules: T<
        {
          assignee_id: string; created_at: string; created_by: string | null; day_of_month: number | null;
          day_of_week: number | null; description: string | null; frequency: E["recurrence_frequency"]; id: string;
          is_active: boolean; lead_days: number; next_due_date: string; priority: E["task_priority"];
          requires_approval: boolean; template_id: string | null; title: string; unit_id: string; updated_at: string;
        },
        "assignee_id" | "frequency" | "next_due_date" | "title" | "unit_id"
      >;
      task_attachments: T<
        {
          content_type: string | null; created_at: string; file_name: string; id: string; size_bytes: number | null;
          storage_path: string; task_id: string; uploaded_by: string | null;
        },
        "file_name" | "storage_path" | "task_id"
      >;
      task_checklist_items: T<
        {
          body: string; created_at: string; done_at: string | null; done_by: string | null; id: string; is_done: boolean;
          position: number; task_id: string;
        },
        "body" | "task_id"
      >;
      task_comments: {
        Row: { author_id: string | null; body: string; created_at: string; id: string; task_id: string };
        Insert: { author_id?: string | null; body: string; created_at?: string; id?: string; task_id: string };
        Update: { author_id?: string | null; body?: string; created_at?: string; id?: string; task_id?: string };
        Relationships: [
          { foreignKeyName: "task_comments_author_id_fkey"; columns: ["author_id"]; isOneToOne: false; referencedRelation: "profiles"; referencedColumns: ["id"] },
          { foreignKeyName: "task_comments_task_id_fkey"; columns: ["task_id"]; isOneToOne: false; referencedRelation: "tasks"; referencedColumns: ["id"] },
        ];
      };
      task_templates: T<
        {
          checklist: Json; created_at: string; created_by: string | null; description: string | null; due_in_days: number;
          id: string; name: string; priority: E["task_priority"]; requires_approval: boolean; title: string;
          unit_id: string | null; updated_at: string;
        },
        "name" | "title"
      >;
      task_updates: {
        Row: {
          author_id: string | null; created_at: string; id: string; new_due_date: string | null; new_progress: number | null;
          new_status: E["task_status"] | null; note: string | null; old_due_date: string | null;
          old_progress: number | null; old_status: E["task_status"] | null; task_id: string;
        };
        Insert: {
          author_id?: string | null; created_at?: string; id?: string; new_due_date?: string | null; new_progress?: number | null;
          new_status?: E["task_status"] | null; note?: string | null; old_due_date?: string | null;
          old_progress?: number | null; old_status?: E["task_status"] | null; task_id: string;
        };
        Update: Partial<Database["public"]["Tables"]["task_updates"]["Row"]>;
        Relationships: [
          { foreignKeyName: "task_updates_author_id_fkey"; columns: ["author_id"]; isOneToOne: false; referencedRelation: "profiles"; referencedColumns: ["id"] },
          { foreignKeyName: "task_updates_task_id_fkey"; columns: ["task_id"]; isOneToOne: false; referencedRelation: "tasks"; referencedColumns: ["id"] },
        ];
      };
      tasks: T<
        {
          approved_by: string | null; assigned_by: string | null; assignee_id: string; completed_at: string | null;
          created_at: string; description: string | null; due_date: string; id: string; parent_task_id: string | null;
          priority: E["task_priority"]; progress: number; project_id: string | null; recurrence_rule_id: string | null;
          requires_approval: boolean; start_date: string | null; status: E["task_status"]; submitted_at: string | null;
          title: string; unit_id: string; updated_at: string;
        },
        "assignee_id" | "due_date" | "title" | "unit_id"
      >;
      units: T<
        { code: string; created_at: string; id: string; is_active: boolean; manager_id: string | null; name: string },
        "code" | "name"
      >;
    };
    Views: {
      task_overview: {
        Row: {
          approved_by: string | null; assigned_by: string | null; assigned_by_name: string | null; assignee_id: string | null;
          assignee_name: string | null; attachment_count: number | null; checklist_done: number | null;
          checklist_total: number | null; completed_at: string | null; created_at: string | null; days_overdue: number | null;
          description: string | null; due_date: string | null; id: string | null; is_overdue: boolean | null;
          parent_task_id: string | null; priority: E["task_priority"] | null; progress: number | null;
          project_id: string | null; project_title: string | null; recurrence_rule_id: string | null;
          requires_approval: boolean | null; start_date: string | null; status: E["task_status"] | null;
          submitted_at: string | null; subtask_count: number | null; title: string | null; unit_code: string | null;
          unit_id: string | null; unit_name: string | null; updated_at: string | null;
        };
        Relationships: Rel[];
      };
    };
    Functions: {
      auth_check_password: { Args: { p_password: string; p_profile_id: string }; Returns: boolean };
      auth_login: {
        Args: { p_password: string; p_staff_no: string };
        Returns: { must_change: boolean; profile_id: string; session_version: number }[];
      };
      auth_set_password: { Args: { p_password: string; p_profile_id: string; p_temporary: boolean }; Returns: number };
      auth_status: {
        Args: never;
        Returns: { has_password: boolean; locked: boolean; must_change: boolean; profile_id: string }[];
      };
      digest_rows: {
        Args: never;
        Returns: {
          awaiting_count: number; due_week_count: number; email: string; full_name: string; open_count: number;
          overdue_count: number; profile_id: string;
        }[];
      };
      generate_recurring_tasks: { Args: never; Returns: number };
      post_task_update: {
        Args: { p_actor?: string; p_note: string; p_progress?: number; p_status?: E["task_status"]; p_task_id: string };
        Returns: undefined;
      };
      run_reminders: { Args: never; Returns: number };
      update_task_as: { Args: { p_actor: string; p_patch: Json; p_task_id: string }; Returns: undefined };
      weekly_digest_notify: { Args: never; Returns: number };
    };
    Enums: {
      leave_kind: "annual" | "sick" | "training" | "official" | "other";
      project_status: "planning" | "active" | "on_hold" | "completed" | "cancelled";
      recurrence_frequency: "daily" | "weekly" | "monthly" | "quarterly";
      task_priority: "low" | "medium" | "high" | "urgent";
      task_status: "not_started" | "in_progress" | "blocked" | "submitted" | "done" | "cancelled";
      user_role: "head" | "manager" | "staff";
    };
    CompositeTypes: { [_ in never]: never };
  };
};

type PublicSchema = Database["public"];
export type Tables<K extends keyof (PublicSchema["Tables"] & PublicSchema["Views"])> =
  (PublicSchema["Tables"] & PublicSchema["Views"])[K]["Row"];
export type Enums<K extends keyof PublicSchema["Enums"]> = PublicSchema["Enums"][K];

export const TASK_STATUSES = ["not_started", "in_progress", "blocked", "submitted", "done", "cancelled"] as const;
export const TASK_PRIORITIES = ["low", "medium", "high", "urgent"] as const;
export const USER_ROLES = ["head", "manager", "staff"] as const;
export const LEAVE_KINDS = ["annual", "sick", "training", "official", "other"] as const;
export const PROJECT_STATUSES = ["planning", "active", "on_hold", "completed", "cancelled"] as const;
export const FREQUENCIES = ["daily", "weekly", "monthly", "quarterly"] as const;
