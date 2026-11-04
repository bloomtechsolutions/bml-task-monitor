import { NextResponse, type NextRequest } from "next/server";
import { getPerson } from "@/lib/auth";
import { isHead, isLead } from "@/lib/permissions";
import { finishedOn, loadReportRows, resolvePeriod } from "@/lib/reports";
import { STATUS_LABEL, PRIORITY_LABEL } from "@/lib/format";

function cell(v: unknown): string {
  let s = v === null || v === undefined ? "" : String(v);
  // Stop spreadsheet formula injection from task titles.
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export async function GET(req: NextRequest) {
  const me = await getPerson();
  if (!me || !isLead(me)) return new NextResponse("Not allowed", { status: 403 });
  const sp = req.nextUrl.searchParams;
  const { from, to } = resolvePeriod(sp.get("period") ?? undefined, sp.get("from") ?? undefined, sp.get("to") ?? undefined);
  const unitParam = sp.get("unit");
  const unit = isHead(me) && unitParam && /^[0-9a-f-]{36}$/i.test(unitParam) ? unitParam : null;
  const rows = await loadReportRows(me, from, to, unit);

  const header = ["Title", "Unit", "Assigned to", "Assigned by", "Project", "Priority", "Status", "Progress %", "Created", "Due", "Finished", "On time", "Days overdue now"];
  const lines = rows.map((t) => {
    const done = finishedOn(t);
    return [
      t.title, t.unit_name, t.assignee_name, t.assigned_by_name, t.project_title,
      t.priority ? PRIORITY_LABEL[t.priority] : "", t.status ? STATUS_LABEL[t.status] : "", t.progress,
      t.created_at?.slice(0, 10), t.due_date, done ?? "", done ? (t.due_date && done <= t.due_date ? "Yes" : "No") : "",
      t.days_overdue || "",
    ].map(cell).join(",");
  });
  const csv = "﻿" + [header.join(","), ...lines].join("\r\n");
  return new NextResponse(csv, {
    headers: {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": `attachment; filename="tasks_${from}_to_${to}.csv"`,
      "cache-control": "no-store",
    },
  });
}
