import Link from "next/link";
import type { ReactNode } from "react";
import { AlertTriangle, CheckCircle2, Circle, CircleDot, Ban, OctagonAlert, Hourglass } from "lucide-react";
import type { Enums } from "@/lib/database.types";
import { STATUS_LABEL, PRIORITY_LABEL } from "@/lib/format";

const STATUS_STYLE: Record<Enums<"task_status">, string> = {
  not_started: "bg-slate-100 text-slate-700 ring-slate-200",
  in_progress: "bg-sky-50 text-sky-800 ring-sky-200",
  blocked: "bg-amber-50 text-amber-900 ring-amber-300",
  submitted: "bg-violet-50 text-violet-800 ring-violet-200",
  done: "bg-emerald-50 text-emerald-800 ring-emerald-200",
  cancelled: "bg-slate-50 text-slate-500 ring-slate-200",
};

const STATUS_ICON: Record<Enums<"task_status">, typeof Circle> = {
  not_started: Circle,
  in_progress: CircleDot,
  blocked: OctagonAlert,
  submitted: Hourglass,
  done: CheckCircle2,
  cancelled: Ban,
};

export function StatusBadge({ status }: { status: Enums<"task_status"> }) {
  const Icon = STATUS_ICON[status];
  return (
    <span className={`inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-xs font-medium ring-1 ring-inset ${STATUS_STYLE[status]}`}>
      <Icon aria-hidden className="size-3.5" />
      {STATUS_LABEL[status]}
    </span>
  );
}

export function PriorityTag({ priority }: { priority: Enums<"task_priority"> }) {
  if (priority === "low" || priority === "medium") {
    return <span className="text-xs text-slate-500">{PRIORITY_LABEL[priority]} priority</span>;
  }
  return (
    <span className={`text-xs font-semibold ${priority === "urgent" ? "text-red-700" : "text-orange-700"}`}>
      {priority === "urgent" ? "▲▲ Urgent" : "▲ High"}
    </span>
  );
}

export function DueText({ label, overdue }: { label: string; overdue: boolean }) {
  return (
    <span className={`inline-flex items-center gap-1 text-xs tabular-nums ${overdue ? "font-semibold text-red-700" : "text-slate-600"}`}>
      {overdue && <AlertTriangle aria-hidden className="size-3.5" />}
      {label}
    </span>
  );
}

export function ProgressBar({ value }: { value: number }) {
  return (
    <div className="flex items-center gap-2" aria-label={`${value}% complete`}>
      <div className="h-1.5 w-full overflow-hidden rounded-full bg-slate-200">
        <div className="h-full rounded-full bg-blue-600" style={{ width: `${value}%` }} />
      </div>
      <span className="w-9 text-right text-xs tabular-nums text-slate-600">{value}%</span>
    </div>
  );
}

export function PageHeader({ title, subtitle, action }: { title: string; subtitle?: string; action?: ReactNode }) {
  return (
    <div className="mt-4 mb-6 flex flex-wrap items-end justify-between gap-3">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-slate-900 sm:text-[26px]">{title}</h1>
        {subtitle && <p className="mt-1 text-[15px] text-slate-600">{subtitle}</p>}
      </div>
      {action}
    </div>
  );
}

export function EmptyState({ title, body, action }: { title: string; body?: string; action?: ReactNode }) {
  return (
    <div className="rounded-xl border border-dashed border-slate-300 px-4 py-10 text-center">
      <p className="font-medium text-slate-800">{title}</p>
      {body && <p className="mx-auto mt-1 max-w-sm text-sm text-slate-600">{body}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

export function Notice({ tone, children }: { tone: "error" | "success" | "info"; children: ReactNode }) {
  const styles = {
    error: "border-red-200 bg-red-50 text-red-900",
    success: "border-emerald-200 bg-emerald-50 text-emerald-900",
    info: "border-slate-200 bg-slate-50 text-slate-800",
  }[tone];
  return (
    <div role={tone === "error" ? "alert" : "status"} className={`mb-4 rounded-md border px-3 py-2 text-sm ${styles}`}>
      {children}
    </div>
  );
}

export function ButtonLink({ href, children, variant = "primary" }: { href: string; children: ReactNode; variant?: "primary" | "secondary" }) {
  const cls =
    variant === "primary"
      ? "bg-blue-600 text-white hover:bg-blue-700"
      : "border border-slate-300 bg-white text-slate-800 hover:bg-slate-50";
  return (
    <Link href={href} className={`inline-flex min-h-10 items-center gap-1.5 rounded-lg px-4 text-sm font-medium ${cls}`}>
      {children}
    </Link>
  );
}

export const inputCls =
  "block w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-[15px] text-slate-900 shadow-xs placeholder:text-slate-400 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-200 disabled:bg-slate-100";

export const labelCls = "mb-1 block text-sm font-medium text-slate-800";
