import ExcelJS from "exceljs";
import { NextResponse } from "next/server";
import { getPerson } from "@/lib/auth";
import { isHead } from "@/lib/permissions";
import { createClient } from "@/lib/supabase/server";

/** Excel template for bulk staff import, with the current units listed and a Role dropdown. */
export async function GET() {
  const me = await getPerson();
  if (!me || !isHead(me)) return new NextResponse("Not allowed", { status: 403 });
  const { data: units } = await createClient().from("units").select("name, code").eq("is_active", true).order("name");

  const wb = new ExcelJS.Workbook();
  wb.creator = "Task Monitor";
  const ws = wb.addWorksheet("Staff", { views: [{ state: "frozen", ySplit: 1 }] });
  ws.columns = [
    { header: "Full name *", key: "name", width: 30 },
    { header: "Staff no *", key: "staff", width: 12 },
    { header: "Designation", key: "des", width: 28 },
    { header: "Unit *", key: "unit", width: 32 },
    { header: "Role", key: "role", width: 14 },
    { header: "Email", key: "email", width: 30 },
    { header: "Temporary password", key: "pw", width: 22 },
  ];
  const head = ws.getRow(1);
  head.font = { bold: true, color: { argb: "FFFFFFFF" } };
  head.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF2563EB" } };
  head.height = 20;
  ws.getColumn("staff").numFmt = "@";
  ws.addRow({ name: "Aishath Example", staff: "2101", des: "Officer", unit: units?.[0]?.name ?? "Your unit name", role: "Staff", email: "", pw: "" });
  ws.getRow(2).font = { italic: true, color: { argb: "FF64748B" } };
  for (let r = 2; r <= 501; r++) {
    ws.getCell(`E${r}`).dataValidation = { type: "list", allowBlank: true, formulae: ['"Staff,Manager,Head"'] };
    if (units?.length) {
      ws.getCell(`D${r}`).dataValidation = { type: "list", allowBlank: true, showErrorMessage: false, formulae: [`Units!$A$2:$A$${units.length + 1}`] };
    }
  }

  const us = wb.addWorksheet("Units");
  us.columns = [
    { header: "Unit name", width: 36 },
    { header: "Code", width: 12 },
  ];
  us.getRow(1).font = { bold: true };
  for (const u of units ?? []) us.addRow([u.name, u.code]);

  const help = wb.addWorksheet("How to fill");
  help.getColumn(1).width = 110;
  [
    "Bulk staff import: how to fill the Staff sheet",
    "",
    "• One person per row. Delete the grey example row before uploading.",
    "• Full name and Staff no are required. People sign in with their staff number.",
    "• Unit: pick from the list (see the Units sheet), or type a unit name or code. New unit names can be created during import.",
    "• Role: Staff (default), Manager (manages their unit) or Head (sees everything).",
    "• Temporary password: optional, 8+ characters. Leave blank to have one generated for each new person.",
    "• Someone whose staff number already exists is updated (name, designation, unit, role, email), not duplicated.",
    "• Everyone must choose their own password the first time they sign in.",
  ].forEach((t, i) => {
    const c = help.getCell(`A${i + 1}`);
    c.value = t;
    if (i === 0) c.font = { bold: true, size: 14 };
  });

  const buf = await wb.xlsx.writeBuffer();
  return new NextResponse(buf as ArrayBuffer, {
    headers: {
      "content-type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "content-disposition": 'attachment; filename="staff-import-template.xlsx"',
      "cache-control": "no-store",
    },
  });
}
