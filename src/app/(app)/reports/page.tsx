import { redirect } from "next/navigation";
import { Download } from "lucide-react";
import { requirePerson } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { isHead, isLead } from "@/lib/permissions";
import { addDays, formatDate } from "@/lib/format";
import { finishedOn, loadReportRows, pct, resolvePeriod, stats, type Row } from "@/lib/reports";
import { PageHeader, inputCls, labelCls } from "@/components/ui";
import { PrintButton } from "./print-button";

export const metadata = { title: "Reports · Task Monitor" };

const PERIODS = [
  ["month", "This month"],
  ["last_month", "Last month"],
  ["90d", "Last 90 days"],
  ["year", "This year"],
  ["custom", "Custom…"],
] as const;

function Tile({ label, value, hint }: { label: string; value: string | number; hint?: string }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white px-5 py-4 shadow-xs">
      <p className="text-[15px] text-slate-700">{label}</p>
      <p className="mt-2 text-3xl font-semibold tabular-nums text-slate-900">{value}</p>
      {hint && <p className="mt-1 text-sm text-slate-500">{hint}</p>}
    </div>
  );
}

/** Weeks (Sunday start) covering the range, with tasks completed in each. */
function weekly(rows: Row[], from: string, to: string) {
  const start = addDays(from, -new Date(`${from}T00:00:00Z`).getUTCDay());
  const weeks: { start: string; done: number; onTime: number }[] = [];
  for (let d = start; d <= to; d = addDays(d, 7)) weeks.push({ start: d, done: 0, onTime: 0 });
  for (const t of rows) {
    const f = finishedOn(t);
    if (!f || f < from || f > to) continue;
    const w = weeks.findLast((x) => x.start <= f);
    if (!w) continue;
    w.done++;
    if (t.due_date && f <= t.due_date) w.onTime++;
  }
  return weeks.slice(-26);
}

function WeeklyChart({ data }: { data: { start: string; done: number; onTime: number }[] }) {
  const max = Math.max(1, ...data.map((d) => d.done));
  const ticks = [0, Math.ceil(max / 2), max].filter((v, i, a) => a.indexOf(v) === i);
  const W = 640, H = 200, L = 32, B = 24, T = 8;
  const bw = (W - L) / data.length;
  const y = (v: number) => T + (H - T - B) * (1 - v / max);
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="h-auto w-full" role="img" aria-label="Tasks completed per week">
      {ticks.map((v) => (
        <g key={v}>
          <line x1={L} x2={W} y1={y(v)} y2={y(v)} className="stroke-slate-200" strokeWidth={1} />
          <text x={L - 6} y={y(v) + 4} textAnchor="end" className="fill-slate-500 text-[11px]">
            {v}
          </text>
        </g>
      ))}
      {data.map((d, i) => {
        const x = L + i * bw;
        const h = H - B - y(d.done);
        return (
          <g key={d.start} className="group">
            <title>{`Week of ${formatDate(d.start)}: ${d.done} completed, ${d.onTime} on time`}</title>
            <rect x={x} y={T} width={bw} height={H - T - B} className="fill-transparent group-hover:fill-slate-100" />
            {d.done > 0 && (
              <rect x={x + (bw - Math.min(bw * 0.6, 40)) / 2} y={y(d.done)} width={Math.min(bw * 0.6, 40)} height={Math.max(h, 2)} rx={4} className="fill-blue-600" />
            )}
            {(i % Math.ceil(data.length / 8) === 0 || i === data.length - 1) && (
              <text x={x + bw / 2} y={H - 6} textAnchor="middle" className="fill-slate-500 text-[11px]">
                {new Date(`${d.start}T00:00:00Z`).toLocaleDateString("en-GB", { day: "numeric", month: "short", timeZone: "UTC" })}
              </text>
            )}
          </g>
        );
      })}
    </svg>
  );
}

export default async function ReportsPage({ searchParams }: { searchParams: Promise<{ period?: string; from?: string; to?: string; unit?: string }> }) {
  const [me, sp] = await Promise.all([requirePerson(), searchParams]);
  if (!isLead(me)) redirect("/");
  const { period, from, to } = resolvePeriod(sp.period, sp.from, sp.to);
  const unit = isHead(me) && sp.unit && /^[0-9a-f-]{36}$/i.test(sp.unit) ? sp.unit : null;

  const [{ data: units }, rows] = await Promise.all([
    createClient().from("units").select("id, name, code").order("name"),
    loadReportRows(me, from, to, unit),
  ]);
  const s = stats(rows, from, to);

  const byUnit = (units ?? [])
    .map((u) => ({ u, s: stats(rows.filter((r) => r.unit_id === u.id), from, to) }))
    .filter((x) => x.s.created + x.s.completed + x.s.open > 0);
  const people = new Map<string, Row[]>();
  for (const r of rows) if (r.assignee_id) people.set(r.assignee_id, [...(people.get(r.assignee_id) ?? []), r]);
  const byPerson = [...people.entries()]
    .map(([id, rs]) => ({ id, name: rs[0].assignee_name ?? "—", unit: rs[0].unit_code, s: stats(rs, from, to) }))
    .sort((a, b) => b.s.overdueNow - a.s.overdueNow || b.s.completed - a.s.completed);

  const qs = new URLSearchParams({ period, from, to, ...(unit ? { unit } : {}) }).toString();

  return (
    <>
      <PageHeader
        title="Reports"
        subtitle={`${formatDate(from)} – ${formatDate(to)}${unit ? ` · ${(units ?? []).find((u) => u.id === unit)?.name}` : ""}`}
        action={
          <div className="flex gap-2 print:hidden">
            <a
              href={`/reports/export?${qs}`}
              className="inline-flex min-h-10 items-center gap-1.5 rounded-lg bg-blue-600 px-4 text-sm font-medium text-white hover:bg-blue-700"
            >
              <Download aria-hidden className="size-4" /> Export to Excel (CSV)
            </a>
            <PrintButton />
          </div>
        }
      />

      <form className="mb-6 flex flex-wrap items-end gap-3 rounded-xl border border-slate-200 bg-white p-4 shadow-xs print:hidden">
        <label>
          <span className={labelCls}>Period</span>
          <select name="period" defaultValue={period} className={inputCls}>
            {PERIODS.map(([v, l]) => (
              <option key={v} value={v}>
                {l}
              </option>
            ))}
          </select>
        </label>
        <label>
          <span className={labelCls}>From</span>
          <input type="date" name="from" defaultValue={from} className={inputCls} />
        </label>
        <label>
          <span className={labelCls}>To</span>
          <input type="date" name="to" defaultValue={to} className={inputCls} />
        </label>
        {isHead(me) && (
          <label>
            <span className={labelCls}>Unit</span>
            <select name="unit" defaultValue={unit ?? ""} className={inputCls}>
              <option value="">All units</option>
              {(units ?? []).map((u) => (
                <option key={u.id} value={u.id}>
                  {u.name}
                </option>
              ))}
            </select>
          </label>
        )}
        <button type="submit" className="min-h-10 rounded-lg border border-slate-300 bg-white px-4 text-sm font-medium text-slate-800 hover:bg-slate-50">
          Apply
        </button>
        <p className="w-full text-xs text-slate-500">Dates only apply with “Custom…”.</p>
      </form>

      <section aria-label="Summary" className="mb-6 grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-5">
        <Tile label="Tasks created" value={s.created} />
        <Tile label="Completed" value={s.completed} />
        <Tile label="On-time rate" value={pct(s.onTime, s.completed)} hint={`${s.onTime} of ${s.completed} on time`} />
        <Tile label="Average delay" value={s.late ? `${(s.lateDays / s.late).toFixed(1)} d` : "—"} hint={`${s.late} finished late`} />
        <Tile label="Overdue now" value={s.overdueNow} hint={`${s.open} open`} />
      </section>

      <section className="mb-6 rounded-xl border border-slate-200 bg-white p-5 shadow-xs">
        <h2 className="text-[17px] font-semibold text-slate-900">Tasks completed per week</h2>
        <p className="mb-3 text-sm text-slate-500">Hover a bar for the on-time count. Tables below have the full numbers.</p>
        <WeeklyChart data={weekly(rows, from, to)} />
      </section>

      <div className="grid gap-6 xl:grid-cols-2">
        {[
          {
            title: "By unit",
            head: "Unit",
            rows: byUnit.map((x) => ({ key: x.u.id, name: x.u.name, sub: x.u.code, s: x.s })),
          },
          { title: "By person", head: "Person", rows: byPerson.map((x) => ({ key: x.id, name: x.name, sub: x.unit, s: x.s })) },
        ].map((tbl) => (
          <section key={tbl.title} className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-xs">
            <h2 className="px-5 py-3 font-semibold text-slate-900">{tbl.title}</h2>
            {tbl.rows.length === 0 ? (
              <p className="border-t border-slate-100 px-5 py-6 text-sm text-slate-500">No activity in this period.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full border-t border-slate-100 text-sm">
                  <thead className="text-xs text-slate-500">
                    <tr>
                      <th scope="col" className="px-5 py-2 text-left font-medium">{tbl.head}</th>
                      <th scope="col" className="px-2 py-2 text-right font-medium">Created</th>
                      <th scope="col" className="px-2 py-2 text-right font-medium">Done</th>
                      <th scope="col" className="px-2 py-2 text-right font-medium">On time</th>
                      <th scope="col" className="px-2 py-2 text-right font-medium">Avg delay</th>
                      <th scope="col" className="px-5 py-2 text-right font-medium">Overdue now</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {tbl.rows.map((r) => (
                      <tr key={r.key}>
                        <td className="px-5 py-2.5">
                          <span className="font-medium text-slate-900">{r.name}</span>
                          {r.sub && <span className="ml-1.5 text-xs text-slate-400">{r.sub}</span>}
                        </td>
                        <td className="px-2 py-2.5 text-right tabular-nums">{r.s.created}</td>
                        <td className="px-2 py-2.5 text-right tabular-nums">{r.s.completed}</td>
                        <td className="px-2 py-2.5 text-right tabular-nums">{pct(r.s.onTime, r.s.completed)}</td>
                        <td className="px-2 py-2.5 text-right tabular-nums">{r.s.late ? `${(r.s.lateDays / r.s.late).toFixed(1)} d` : "—"}</td>
                        <td className={`px-5 py-2.5 text-right tabular-nums ${r.s.overdueNow ? "font-semibold text-red-700" : "text-slate-500"}`}>{r.s.overdueNow}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        ))}
      </div>
    </>
  );
}
