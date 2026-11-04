export default function Loading() {
  return (
    <div aria-busy="true" aria-label="Loading" className="animate-pulse space-y-4">
      <div className="h-7 w-48 rounded bg-slate-200" />
      <div className="h-4 w-64 rounded bg-slate-200" />
      <div className="h-40 rounded-xl border border-slate-200 bg-white shadow-xs" />
      <div className="h-24 rounded-xl border border-slate-200 bg-white shadow-xs" />
    </div>
  );
}
