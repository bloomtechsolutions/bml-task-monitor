// Generated from Supabase project wwncbiyuysfsyidtsegv (trimmed helper generics).
// Regenerate after schema changes.
export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

type Rel = {
  foreignKeyName: string;
  columns: string[];
  isOneToOne: boolean;
  referencedRelation: string;
  referencedColumns: string[];
};

export type Database = {
  __InternalSupabase: { PostgrestVersion: "14.18" };
  public: {
    Tables: {
      app_settings: {
        Row: { key: string; updated_at: string; value: Json };
        Insert: { key: string; updated_at?: string; value: Json };
        Update: { key?: string; updated_at?: string; value?: Json };
        Relationships: [];
      };
      notifications: {
        Row: { channel: string; id: string; kind: string; read_at: string | null; recipient_id: string | null; sent_at: string; task_id: string | null };
        Insert: { channel: string; id?: string; kind: string; read_at?: string | null; recipient_id?: string | null; sent_at?: string; task_id?: string | null };
        Update: { channel?: string; id?: string; kind?: string; read_at?: string | null; recipient_id?: string | null; sent_at?: string; task_id?: string | null };
        Relationships: Rel[];
      };
      profiles: {
        Row: {
          created_at: string; designation: string | null; email: string; full_name: string | null; id: string;
          is_active: boolean; manager_id: string | null; role: Database["public"]["Enums"]["user_role"];
          staff_no: string | null; unit_id: string | null; updated_at: string;
        };
        Insert: {
          created_at?: string; designation?: string | null; email: string; full_name?: string | null; id: string;
          is_active?: boolean; manager_id?: string | null; role?: Database["public"]["Enums"]["user_role"];
          staff_no?: string | null; unit_id?: string | null; updated_at?: string;
        };
        Update: {
          created_at?: string; designation?: string | null; email?: string; full_name?: string | null; id?: string;
          is_active?: boolean; manager_id?: string | null; role?: Database["public"]["Enums"]["user_role"];
          staff_no?: string | null; unit_id?: string | null; updated_at?: string;
        };
        Relationships: Rel[];
      };
      projects: {
        Row: {
          created_at: string; created_by: string | null; description: string | null; id: string; owner_id: string | null;
          start_date: string | null; status: Database["public"]["Enums"]["project_status"]; target_date: string | null;
          title: string; unit_id: string; updated_at: string;
        };
        Insert: {
          created_at?: string; created_by?: string | null; description?: string | null; id?: string; owner_id?: string | null;
          start_date?: string | null; status?: Database["public"]["Enums"]["project_status"]; target_date?: string | null;
          title: string; unit_id: string; updated_at?: string;
        };
        Update: {
          created_at?: string; created_by?: string | null; description?: string | null; id?: string; owner_id?: string | null;
          start_date?: string | null; status?: Database["public"]["Enums"]["project_status"]; target_date?: string | null;
          title?: string; unit_id?: string; updated_at?: string;
        };
        Relationships: Rel[];
      };
      recurrence_rules: {
        Row: {
          assignee_id: string; created_at: string; created_by: string | null; day_of_month: number | null; day_of_week: number | null;
          description: string | null; frequency: Database["public"]["Enums"]["recurrence_frequency"]; id: string; is_active: boolean;
          lead_days: number; next_due_date: string; priority: Database["public"]["Enums"]["task_priority"]; title: string;
          unit_id: string; updated_at: string;
        };
        Insert: {
          assignee_id: string; created_at?: string; created_by?: string | null; day_of_month?: number | null; day_of_week?: number | null;
          description?: string | null; frequency: Database["public"]["Enums"]["recurrence_frequency"]; id?: string; is_active?: boolean;
          lead_days?: number; next_due_date: string; priority?: Database["public"]["Enums"]["task_priority"]; title: string;
          unit_id: string; updated_at?: string;
        };
        Update: {
          assignee_id?: string; created_at?: string; created_by?: string | null; day_of_month?: number | null; day_of_week?: number | null;
          description?: string | null; frequency?: Database["public"]["Enums"]["recurrence_frequency"]; id?: string; is_active?: boolean;
          lead_days?: number; next_due_date?: string; priority?: Database["public"]["Enums"]["task_priority"]; title?: string;
          unit_id?: string; updated_at?: string;
        };
        Relationships: Rel[];
      };
      task_attachments: {
        Row: { created_at: string; file_name: string; id: string; size_bytes: number | null; storage_path: string; task_id: string; uploaded_by: string };
        Insert: { created_at?: string; file_name: string; id?: string; size_bytes?: number | null; storage_path: string; task_id: string; uploaded_by?: string };
        Update: { created_at?: string; file_name?: string; id?: string; size_bytes?: number | null; storage_path?: string; task_id?: string; uploaded_by?: string };
        Relationships: Rel[];
      };
      task_comments: {
        Row: { author_id: string; body: string; created_at: string; id: string; task_id: string };
        Insert: { author_id?: string; body: string; created_at?: string; id?: string; task_id: string };
        Update: { author_id?: string; body?: string; created_at?: string; id?: string; task_id?: string };
        Relationships: [
          { foreignKeyName: "task_comments_author_id_fkey"; columns: ["author_id"]; isOneToOne: false; referencedRelation: "profiles"; referencedColumns: ["id"] },
          { foreignKeyName: "task_comments_task_id_fkey"; columns: ["task_id"]; isOneToOne: false; referencedRelation: "tasks"; referencedColumns: ["id"] },
        ];
      };
      task_updates: {
        Row: {
          author_id: string | null; created_at: string; id: string; new_due_date: string | null; new_progress: number | null;
          new_status: Database["public"]["Enums"]["task_status"] | null; note: string | null; old_due_date: string | null;
          old_progress: number | null; old_status: Database["public"]["Enums"]["task_status"] | null; task_id: string;
        };
        Insert: {
          author_id?: string | null; created_at?: string; id?: string; new_due_date?: string | null; new_progress?: number | null;
          new_status?: Database["public"]["Enums"]["task_status"] | null; note?: string | null; old_due_date?: string | null;
          old_progress?: number | null; old_status?: Database["public"]["Enums"]["task_status"] | null; task_id: string;
        };
        Update: {
          author_id?: string | null; created_at?: string; id?: string; new_due_date?: string | null; new_progress?: number | null;
          new_status?: Database["public"]["Enums"]["task_status"] | null; note?: string | null; old_due_date?: string | null;
          old_progress?: number | null; old_status?: Database["public"]["Enums"]["task_status"] | null; task_id?: string;
        };
        Relationships: [
          { foreignKeyName: "task_updates_author_id_fkey"; columns: ["author_id"]; isOneToOne: false; referencedRelation: "profiles"; referencedColumns: ["id"] },
          { foreignKeyName: "task_updates_task_id_fkey"; columns: ["task_id"]; isOneToOne: false; referencedRelation: "tasks"; referencedColumns: ["id"] },
        ];
      };
      tasks: {
        Row: {
          assigned_by: string | null; assignee_id: string; completed_at: string | null; created_at: string; description: string | null;
          due_date: string; id: string; parent_task_id: string | null; priority: Database["public"]["Enums"]["task_priority"];
          progress: number; project_id: string | null; recurrence_rule_id: string | null; start_date: string | null;
          status: Database["public"]["Enums"]["task_status"]; title: string; unit_id: string; updated_at: string;
        };
        Insert: {
          assigned_by?: string | null; assignee_id: string; completed_at?: string | null; created_at?: string; description?: string | null;
          due_date: string; id?: string; parent_task_id?: string | null; priority?: Database["public"]["Enums"]["task_priority"];
          progress?: number; project_id?: string | null; recurrence_rule_id?: string | null; start_date?: string | null;
          status?: Database["public"]["Enums"]["task_status"]; title: string; unit_id: string; updated_at?: string;
        };
        Update: {
          assigned_by?: string | null; assignee_id?: string; completed_at?: string | null; created_at?: string; description?: string | null;
          due_date?: string; id?: string; parent_task_id?: string | null; priority?: Database["public"]["Enums"]["task_priority"];
          progress?: number; project_id?: string | null; recurrence_rule_id?: string | null; start_date?: string | null;
          status?: Database["public"]["Enums"]["task_status"]; title?: string; unit_id?: string; updated_at?: string;
        };
        Relationships: Rel[];
      };
      units: {
        Row: { code: string; created_at: string; id: string; is_active: boolean; manager_id: string | null; name: string };
        Insert: { code: string; created_at?: string; id?: string; is_active?: boolean; manager_id?: string | null; name: string };
        Update: { code?: string; created_at?: string; id?: string; is_active?: boolean; manager_id?: string | null; name?: string };
        Relationships: Rel[];
      };
    };
    Views: {
      task_overview: {
        Row: {
          assigned_by: string | null; assigned_by_name: string | null; assignee_id: string | null; assignee_name: string | null;
          completed_at: string | null; created_at: string | null; days_overdue: number | null; description: string | null;
          due_date: string | null; id: string | null; is_overdue: boolean | null; parent_task_id: string | null;
          priority: Database["public"]["Enums"]["task_priority"] | null; progress: number | null; project_id: string | null;
          project_title: string | null; recurrence_rule_id: string | null; start_date: string | null;
          status: Database["public"]["Enums"]["task_status"] | null; subtask_count: number | null; title: string | null;
          unit_code: string | null; unit_id: string | null; unit_name: string | null; updated_at: string | null;
        };
        Relationships: Rel[];
      };
    };
    Functions: {
      post_task_update: {
        Args: { p_note: string; p_progress?: number; p_status?: Database["public"]["Enums"]["task_status"]; p_task_id: string };
        Returns: undefined;
      };
    };
    Enums: {
      project_status: "planning" | "active" | "on_hold" | "completed" | "cancelled";
      recurrence_frequency: "weekly" | "monthly" | "quarterly";
      task_priority: "low" | "medium" | "high" | "urgent";
      task_status: "not_started" | "in_progress" | "blocked" | "done" | "cancelled";
      user_role: "head" | "manager" | "staff";
    };
    CompositeTypes: { [_ in never]: never };
  };
};

type PublicSchema = Database["public"];
export type Tables<T extends keyof (PublicSchema["Tables"] & PublicSchema["Views"])> =
  (PublicSchema["Tables"] & PublicSchema["Views"])[T]["Row"];
export type Enums<T extends keyof PublicSchema["Enums"]> = PublicSchema["Enums"][T];

export const TASK_STATUSES = ["not_started", "in_progress", "blocked", "done", "cancelled"] as const;
export const TASK_PRIORITIES = ["low", "medium", "high", "urgent"] as const;
export const USER_ROLES = ["head", "manager", "staff"] as const;
