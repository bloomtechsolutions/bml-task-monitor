"use client";

import Link from "next/link";
import { useActionState, useState } from "react";
import { AlertTriangle, CheckCircle2, Download, FileSpreadsheet, KeyRound, RefreshCw, Upload, XCircle } from "lucide-react";
import { commitImport, previewImport, type CommitState, type PreviewState } from "@/app/import-actions";
import { SubmitButton } from "@/components/submit-button";

const ROLE = { head: "Head", manager: "Manager", staff: "Staff" } as const;

function downloadCsv(rows: { full_name: string; staff_no: string; password?: string; action: string }[]) {
  const cell = (s: string) => (/[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s);
  const csv = "﻿" + ["Full name,Staff no,Temporary password,Result", ...rows.map((r) => [r.full_name, r.staff_no, r.password ?? "", r.action].map(cell).join(","))].join("\r\n");
  const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
  const a = Object.assign(document.createElement("a"), { href: url, download: "staff-sign-in-details.csv" });
  a.click();
  URL.revokeObjectURL(url);
}

/** Restarting remounts the flow, which resets both steps' state. */
export function ImportFlow() {
  const [run, setRun] = useState(0);
  return <Flow key={run} onRestart={() => setRun((n) => n + 1)} />;
}

function Flow({ onRestart }: { onRestart: () => void }) {
  const [preview, previewAction] = useActionState<PreviewState, FormData>(previewImport, {});
  const [result, commitAction] = useActionState<CommitState, FormData>(commitImport, {});

  // Step 3: results
  if (result.results) {
    const created = result.results.filter((r) => r.action === "created");
    const updated = result.results.filter((r) => r.action === "updated");
    const failed = result.results.filter((r) => r.action === "failed");
    const withPw = result.results.filter((r) => r.password);
    return (
      <div className="space-y-5">
        <section className="rounded-xl border border-emerald-200 bg-emerald-50 p-5">
          <h2 className="flex items-center gap-2 font-semibold text-emerald-900">
            <CheckCircle2 aria-hidden className="size-5" /> Import finished
          </h2>
          <p className="mt-1 text-sm text-emerald-900">
            {created.length} added · {updated.length} updated{failed.length ? ` · ${failed.length} not imported` : ""}
            {result.unitsCreated?.length ? ` · new units: ${result.unitsCreated.join(", ")}` : ""}
          </p>
        </section>

        {withPw.length > 0 && (
          <section className="rounded-xl border border-amber-200 bg-amber-50 p-5">
            <h2 className="flex items-center gap-2 font-semibold text-amber-900">
              <KeyRound aria-hidden className="size-5" /> Sign-in details: shown only once
            </h2>
            <p className="mt-1 text-sm text-amber-900">
              Download this list now and give each person their temporary password privately. They&apos;ll choose their own password when they first sign in.
            </p>
            <button
              type="button"
              onClick={() => downloadCsv(withPw)}
              className="mt-3 inline-flex min-h-10 items-center gap-1.5 rounded-lg bg-amber-600 px-4 text-sm font-medium text-white hover:bg-amber-700"
            >
              <Download aria-hidden className="size-4" /> Download sign-in details (CSV)
            </button>
          </section>
        )}

        <section className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-xs">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 text-xs text-slate-500">
                <tr>
                  <th scope="col" className="px-4 py-2 text-left font-medium">Row</th>
                  <th scope="col" className="px-4 py-2 text-left font-medium">Name</th>
                  <th scope="col" className="px-4 py-2 text-left font-medium">Staff no</th>
                  <th scope="col" className="px-4 py-2 text-left font-medium">Result</th>
                  <th scope="col" className="px-4 py-2 text-left font-medium">Temporary password</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {result.results.map((r) => (
                  <tr key={r.line}>
                    <td className="px-4 py-2 tabular-nums text-slate-500">{r.line}</td>
                    <td className="px-4 py-2 font-medium text-slate-900">{r.full_name}</td>
                    <td className="px-4 py-2 tabular-nums">{r.staff_no}</td>
                    <td className="px-4 py-2">
                      {r.action === "failed" ? (
                        <span className="text-red-700">Not imported: {r.error}</span>
                      ) : (
                        <span className={r.action === "created" ? "text-emerald-700" : "text-sky-700"}>{r.action === "created" ? "Added" : "Updated"}</span>
                      )}
                    </td>
                    <td className="px-4 py-2 font-mono text-[13px]">{r.password ?? <span className="font-sans text-slate-400">—</span>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        <div className="flex flex-wrap gap-2">
          <Link href="/admin" className="inline-flex min-h-10 items-center rounded-lg bg-blue-600 px-4 text-sm font-medium text-white hover:bg-blue-700">
            Go to People &amp; units
          </Link>
          <button
            type="button"
            onClick={onRestart}
            className="inline-flex min-h-10 items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-4 text-sm font-medium text-slate-800 hover:bg-slate-50"
          >
            <RefreshCw aria-hidden className="size-4" /> Import another file
          </button>
        </div>
      </div>
    );
  }

  // Step 2: preview
  if (preview.rows) {
    const ok = preview.rows.filter((r) => r.action !== "skip");
    const bad = preview.rows.filter((r) => r.action === "skip");
    const creates = ok.filter((r) => r.action === "create").length;
    const updates = ok.filter((r) => r.action === "update").length;
    return (
      <form action={commitAction} className="space-y-5">
        <input type="hidden" name="rows" value={JSON.stringify(ok.map(({ line, full_name, staff_no, designation, unit, role, email, password }) => ({ line, full_name, staff_no, designation, unit, role, email, password })))} />
        <input type="hidden" name="create_units" value={preview.createUnits ? "1" : "0"} />
        {result.error && (
          <p role="alert" className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-900">
            {result.error}
          </p>
        )}

        <section className="grid grid-cols-3 gap-3">
          {[
            ["New people", creates, "text-emerald-700"],
            ["Updates", updates, "text-sky-700"],
            ["Problems", bad.length, bad.length ? "text-red-700" : "text-slate-900"],
          ].map(([l, n, c]) => (
            <div key={l as string} className="rounded-xl border border-slate-200 bg-white px-4 py-3 shadow-xs">
              <p className="text-sm text-slate-600">{l}</p>
              <p className={`mt-1 text-2xl font-semibold tabular-nums ${c}`}>{n}</p>
            </div>
          ))}
        </section>

        {bad.length > 0 && (
          <p className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
            Rows with problems are skipped. Fix them in the file and import it again (existing people are updated, not duplicated).
          </p>
        )}

        <section className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-xs">
          <h2 className="flex items-center gap-2 px-4 py-3 text-sm font-semibold text-slate-800">
            <FileSpreadsheet aria-hidden className="size-4 text-emerald-600" /> {preview.fileName} · {preview.rows.length} rows
          </h2>
          <div className="max-h-[60vh] overflow-auto border-t border-slate-100">
            <table className="w-full text-sm">
              <thead className="sticky top-0 bg-slate-50 text-xs text-slate-500">
                <tr>
                  <th scope="col" className="px-3 py-2 text-left font-medium">Row</th>
                  <th scope="col" className="px-3 py-2 text-left font-medium">Status</th>
                  <th scope="col" className="px-3 py-2 text-left font-medium">Name</th>
                  <th scope="col" className="px-3 py-2 text-left font-medium">Staff no</th>
                  <th scope="col" className="px-3 py-2 text-left font-medium">Unit</th>
                  <th scope="col" className="px-3 py-2 text-left font-medium">Role</th>
                  <th scope="col" className="px-3 py-2 text-left font-medium">Notes</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {preview.rows.map((r) => (
                  <tr key={r.line} className={r.action === "skip" ? "bg-red-50/50" : ""}>
                    <td className="px-3 py-2 tabular-nums text-slate-500">{r.line}</td>
                    <td className="px-3 py-2 whitespace-nowrap">
                      {r.action === "skip" ? (
                        <span className="inline-flex items-center gap-1 text-red-700"><XCircle aria-hidden className="size-4" /> Skip</span>
                      ) : r.action === "create" ? (
                        <span className="inline-flex items-center gap-1 text-emerald-700"><CheckCircle2 aria-hidden className="size-4" /> New</span>
                      ) : (
                        <span className="inline-flex items-center gap-1 text-sky-700"><RefreshCw aria-hidden className="size-4" /> Update</span>
                      )}
                    </td>
                    <td className="px-3 py-2 font-medium text-slate-900">{r.full_name || "—"}</td>
                    <td className="px-3 py-2 tabular-nums">{r.staff_no || "—"}</td>
                    <td className="px-3 py-2">{r.unit || "—"}</td>
                    <td className="px-3 py-2">{ROLE[r.role]}</td>
                    <td className="px-3 py-2 text-xs">
                      {r.errors.map((e) => (
                        <span key={e} className="block text-red-700">{e}</span>
                      ))}
                      {r.warnings.map((w) => (
                        <span key={w} className="flex items-center gap-1 text-amber-800">
                          <AlertTriangle aria-hidden className="size-3" /> {w}
                        </span>
                      ))}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        <label className="flex items-start gap-3 rounded-lg border border-slate-200 bg-white px-4 py-3">
          <input type="checkbox" name="auto_passwords" defaultChecked className="mt-0.5 size-4 accent-blue-600" />
          <span className="text-sm">
            <span className="font-medium text-slate-900">Generate a temporary password for new people without one</span>
            <span className="block text-slate-600">You&apos;ll get a list to download after the import. Existing people keep their password unless the sheet gives a new one.</span>
          </span>
        </label>

        <div className="flex flex-wrap justify-end gap-2">
          <button
            type="button"
            onClick={onRestart}
            className="inline-flex min-h-10 items-center rounded-lg px-4 text-sm font-medium text-slate-700 hover:bg-slate-100"
          >
            Upload a different file
          </button>
          <SubmitButton pendingText="Importing…">{ok.length ? `Import ${ok.length} ${ok.length === 1 ? "person" : "people"}` : "Nothing to import"}</SubmitButton>
        </div>
      </form>
    );
  }

  // Step 1: upload
  return (
    <form action={previewAction} className="space-y-5">
      <ol className="grid gap-3 sm:grid-cols-3">
        {[
          ["1. Download the template", "It lists your units and has a Role dropdown."],
          ["2. Fill one row per person", "Name, staff no and unit are needed. Delete the example row."],
          ["3. Upload and check", "You'll see a preview before anything is saved."],
        ].map(([t, b]) => (
          <li key={t} className="rounded-xl border border-slate-200 bg-white p-4 shadow-xs">
            <p className="font-medium text-slate-900">{t}</p>
            <p className="mt-1 text-sm text-slate-600">{b}</p>
          </li>
        ))}
      </ol>

      <a
        href="/admin/import/template"
        className="inline-flex min-h-10 items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-4 text-sm font-medium text-slate-800 hover:bg-slate-50"
      >
        <Download aria-hidden className="size-4" /> Download Excel template
      </a>

      <section className="space-y-4 rounded-xl border border-slate-200 bg-white p-5 shadow-xs">
        {preview.error && (
          <p role="alert" className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-900">
            {preview.error}
          </p>
        )}
        <label className="block">
          <span className="mb-1 block text-sm font-medium text-slate-800">Excel (.xlsx) or CSV file</span>
          <input
            type="file"
            name="file"
            required
            accept=".xlsx,.csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,text/csv"
            className="block w-full text-sm text-slate-700 file:mr-3 file:rounded-lg file:border-0 file:bg-slate-100 file:px-3 file:py-2 file:text-sm file:font-medium file:text-slate-800 hover:file:bg-slate-200"
          />
        </label>
        <label className="flex items-start gap-3">
          <input type="checkbox" name="create_units" className="mt-0.5 size-4 accent-blue-600" />
          <span className="text-sm text-slate-700">Create units that don&apos;t exist yet (otherwise rows with an unknown unit are skipped)</span>
        </label>
        <div className="flex justify-end">
          <SubmitButton pendingText="Reading file…">
            <Upload aria-hidden className="mr-1.5 size-4" /> Check file
          </SubmitButton>
        </div>
      </section>
    </form>
  );
}
