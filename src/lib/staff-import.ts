import "server-only";
import ExcelJS from "exceljs";

export const MAX_ROWS = 500;

export type ImportRow = {
  line: number; // spreadsheet row number, for messages
  full_name: string;
  staff_no: string;
  designation: string;
  unit: string; // as typed in the sheet
  role: "head" | "manager" | "staff";
  email: string;
  password: string;
};

export type CheckedRow = ImportRow & {
  action: "create" | "update" | "skip";
  unit_id: string | null;
  new_unit: boolean;
  errors: string[];
  warnings: string[];
};

const HEADERS: Record<keyof Omit<ImportRow, "line">, string[]> = {
  full_name: ["full name", "name", "staff name", "employee name"],
  staff_no: ["staff no", "staff number", "staff no.", "staff id", "employee no", "employee number", "emp no", "service no"],
  designation: ["designation", "title", "job title", "position"],
  unit: ["unit", "department", "section", "team", "unit code"],
  role: ["role", "access", "access level"],
  email: ["email", "e-mail", "email address"],
  password: ["temporary password", "password", "temp password"],
};

const norm = (s: string) => s.toLowerCase().replace(/[*_]/g, " ").replace(/\s+/g, " ").trim();

function cellText(v: ExcelJS.CellValue): string {
  if (v === null || v === undefined) return "";
  if (typeof v === "object") {
    if ("text" in v && typeof v.text === "string") return v.text; // hyperlink
    if ("richText" in v) return v.richText.map((r) => r.text).join("");
    if ("result" in v) return v.result === undefined || v.result === null ? "" : String(v.result); // formula
    if (v instanceof Date) return v.toISOString().slice(0, 10);
  }
  return String(v);
}

/** Minimal CSV parser (quotes, commas, CRLF). */
function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [], field = "", q = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) {
      if (c === '"' && text[i + 1] === '"') { field += '"'; i++; }
      else if (c === '"') q = false;
      else field += c;
    } else if (c === '"') q = true;
    else if (c === ",") { row.push(field); field = ""; }
    else if (c === "\n" || c === "\r") {
      if (c === "\r" && text[i + 1] === "\n") i++;
      row.push(field); rows.push(row); row = []; field = "";
    } else field += c;
  }
  if (field || row.length) { row.push(field); rows.push(row); }
  return rows;
}

export async function readSheet(file: File): Promise<{ rows?: string[][]; error?: string }> {
  const name = file.name.toLowerCase();
  const buf = Buffer.from(await file.arrayBuffer());
  if (name.endsWith(".csv")) {
    return { rows: parseCsv(buf.toString("utf8").replace(/^﻿/, "")) };
  }
  if (!name.endsWith(".xlsx")) return { error: "Upload an Excel file (.xlsx) or a CSV file. Older .xls files: open in Excel and “Save as” .xlsx first." };
  const wb = new ExcelJS.Workbook();
  try {
    await wb.xlsx.load(buf as unknown as ArrayBuffer);
  } catch {
    return { error: "That file couldn't be read as Excel. Save it as .xlsx and try again." };
  }
  const ws = wb.getWorksheet("Staff") ?? wb.worksheets[0];
  if (!ws) return { error: "The workbook has no sheets." };
  const rows: string[][] = [];
  ws.eachRow({ includeEmpty: true }, (r, n) => {
    const vals: string[] = [];
    for (let c = 1; c <= Math.max(ws.columnCount, 8); c++) vals.push(cellText(r.getCell(c).value).trim());
    rows[n - 1] = vals;
  });
  return { rows: Array.from(rows, (r) => r ?? []) };
}

export function toImportRows(raw: string[][]): { rows?: ImportRow[]; error?: string } {
  const headerIdx = raw.findIndex((r) => r.some((c) => HEADERS.full_name.includes(norm(c ?? ""))));
  if (headerIdx < 0) return { error: "Couldn't find the header row. The first row needs columns like “Full name” and “Staff no”. Download the template to see the layout." };
  const header = raw[headerIdx].map((h) => norm(h ?? ""));
  const col = Object.fromEntries(
    (Object.keys(HEADERS) as (keyof typeof HEADERS)[]).map((k) => [k, header.findIndex((h) => HEADERS[k].includes(h))]),
  ) as Record<keyof typeof HEADERS, number>;
  if (col.staff_no < 0) return { error: "The sheet needs a “Staff no” column. People sign in with it." };

  const out: ImportRow[] = [];
  for (let i = headerIdx + 1; i < raw.length; i++) {
    const r = raw[i] ?? [];
    const get = (k: keyof typeof HEADERS) => (col[k] >= 0 ? (r[col[k]] ?? "").trim() : "");
    if (!get("full_name") && !get("staff_no")) continue; // blank line
    const roleRaw = norm(get("role"));
    out.push({
      line: i + 1,
      full_name: get("full_name").replace(/\s+/g, " ").slice(0, 120),
      staff_no: get("staff_no").replace(/\.0$/, "").slice(0, 20),
      designation: get("designation").slice(0, 120),
      unit: get("unit"),
      role: roleRaw.startsWith("head") ? "head" : roleRaw.startsWith("manager") || roleRaw.includes("unit manager") ? "manager" : "staff",
      email: get("email").toLowerCase().slice(0, 160),
      password: get("password"),
    });
  }
  if (out.length === 0) return { error: "No staff rows found under the header row." };
  if (out.length > MAX_ROWS) return { error: `That's ${out.length} rows. Import up to ${MAX_ROWS} at a time.` };
  return { rows: out };
}

type Unit = { id: string; name: string; code: string };
type Existing = { id: string; staff_no: string | null; email: string | null };

export function checkRows(rows: ImportRow[], units: Unit[], existing: Existing[], createUnits: boolean): CheckedRow[] {
  const byStaff = new Map(existing.filter((p) => p.staff_no).map((p) => [p.staff_no!.toLowerCase(), p]));
  const byEmail = new Map(existing.filter((p) => p.email).map((p) => [p.email!.toLowerCase(), p]));
  const unitKey = new Map<string, Unit>();
  for (const u of units) {
    unitKey.set(u.name.toLowerCase(), u);
    unitKey.set(u.code.toLowerCase(), u);
  }
  const seenStaff = new Map<string, number>();
  const seenEmail = new Map<string, number>();

  return rows.map((r) => {
    const errors: string[] = [];
    const warnings: string[] = [];
    const sKey = r.staff_no.toLowerCase();
    const match = byStaff.get(sKey);

    if (r.full_name.length < 2) errors.push("Name is missing");
    if (!r.staff_no) errors.push("Staff no is missing");
    if (r.staff_no && seenStaff.has(sKey)) errors.push(`Same staff no as row ${seenStaff.get(sKey)}`);
    if (r.staff_no) seenStaff.set(sKey, r.line);
    if (r.email) {
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(r.email)) errors.push("Email looks wrong");
      const other = byEmail.get(r.email);
      if (other && other.id !== match?.id) errors.push("Email already belongs to someone else");
      if (seenEmail.has(r.email)) errors.push(`Same email as row ${seenEmail.get(r.email)}`);
      seenEmail.set(r.email, r.line);
    }
    if (r.password && r.password.length < 8) errors.push("Temporary password needs 8+ characters");

    let unit_id: string | null = null;
    let new_unit = false;
    if (r.unit) {
      const u = unitKey.get(r.unit.toLowerCase());
      if (u) unit_id = u.id;
      else if (createUnits) {
        new_unit = true;
        warnings.push(`New unit “${r.unit}” will be created`);
      } else errors.push(`Unknown unit “${r.unit}”`);
    } else if (r.role !== "head") errors.push("Unit is missing");
    if (r.role === "head") warnings.push("Gets Head of Retail access (sees everything)");

    return { ...r, action: errors.length ? "skip" : match ? "update" : "create", unit_id, new_unit, errors, warnings };
  });
}

/** Short unique code from a unit name, e.g. "Card Operations" → "CO", then CO2, CO3… */
export function unitCode(name: string, taken: Set<string>): string {
  const words = name.toUpperCase().replace(/[^A-Z0-9 ]/g, " ").split(/\s+/).filter(Boolean);
  let base = words.length > 1 ? words.map((w) => w[0]).join("") : (words[0] ?? "UNIT").slice(0, 6);
  base = base.slice(0, 10) || "UNIT";
  let code = base, n = 2;
  while (taken.has(code)) code = `${base}${n++}`;
  taken.add(code);
  return code;
}

/** Readable temporary password, e.g. Bml-Kq7x-4821. */
export function tempPassword(): string {
  const letters = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz";
  const bytes = crypto.getRandomValues(new Uint8Array(8));
  const l = Array.from(bytes.slice(0, 4), (b) => letters[b % letters.length]).join("");
  const d = Array.from(bytes.slice(4), (b) => String(2 + (b % 8))).join("");
  return `Bml-${l}-${d}`;
}
