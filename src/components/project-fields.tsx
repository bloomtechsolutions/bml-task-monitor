import { PROJECT_STATUSES, type Tables } from "@/lib/database.types";
import { inputCls, labelCls } from "@/components/ui";

export const PROJECT_STATUS_LABEL: Record<(typeof PROJECT_STATUSES)[number], string> = {
  planning: "Planning", active: "Active", on_hold: "On hold", completed: "Completed", cancelled: "Cancelled",
};

export function ProjectFields({
  p,
  units,
  people,
  showUnit,
}: {
  p?: Tables<"projects">;
  units: { id: string; name: string }[];
  people: { id: string; full_name: string | null }[];
  showUnit: boolean;
}) {
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <label className="sm:col-span-2">
        <span className={labelCls}>Project name</span>
        <input name="title" required minLength={3} maxLength={200} defaultValue={p?.title ?? ""} className={inputCls} placeholder="e.g. Q1 card activation campaign" />
      </label>
      <label className="sm:col-span-2">
        <span className={labelCls}>Goal / description</span>
        <textarea name="description" rows={2} maxLength={4000} defaultValue={p?.description ?? ""} className={inputCls} />
      </label>
      {showUnit && (
        <label>
          <span className={labelCls}>Unit</span>
          <select name="unit_id" defaultValue={p?.unit_id ?? ""} required className={inputCls}>
            <option value="" disabled>
              Choose…
            </option>
            {units.map((u) => (
              <option key={u.id} value={u.id}>
                {u.name}
              </option>
            ))}
          </select>
        </label>
      )}
      <label>
        <span className={labelCls}>Owner</span>
        <select name="owner_id" defaultValue={p?.owner_id ?? ""} className={inputCls}>
          <option value="">Me</option>
          {people.map((x) => (
            <option key={x.id} value={x.id}>
              {x.full_name}
            </option>
          ))}
        </select>
      </label>
      <label>
        <span className={labelCls}>Status</span>
        <select name="status" defaultValue={p?.status ?? "active"} className={inputCls}>
          {PROJECT_STATUSES.map((s) => (
            <option key={s} value={s}>
              {PROJECT_STATUS_LABEL[s]}
            </option>
          ))}
        </select>
      </label>
      <label>
        <span className={labelCls}>Start date</span>
        <input type="date" name="start_date" defaultValue={p?.start_date ?? ""} className={inputCls} />
      </label>
      <label>
        <span className={labelCls}>Target date</span>
        <input type="date" name="target_date" defaultValue={p?.target_date ?? ""} className={inputCls} />
      </label>
    </div>
  );
}
