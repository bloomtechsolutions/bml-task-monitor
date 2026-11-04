import { ArrowUpRight } from "lucide-react";

export const APP_NAME = "Upnext";
export const APP_TAGLINE = "Know what's next. Get it done.";

/** Upnext mark: green rounded tile with an up-right arrow. */
export function LogoMark({ size = "md" }: { size?: "md" | "lg" }) {
  const box = size === "lg" ? "size-11 rounded-xl" : "size-9 rounded-lg";
  const icon = size === "lg" ? "size-6" : "size-5";
  return (
    <span aria-hidden className={`grid shrink-0 place-items-center bg-green-600 text-white shadow-xs ${box}`}>
      <ArrowUpRight className={icon} strokeWidth={2.5} />
    </span>
  );
}

/** Mark + wordmark + tagline. */
export function Logo({ size = "md" }: { size?: "md" | "lg" }) {
  return (
    <span className="flex min-w-0 items-center gap-3">
      <LogoMark size={size} />
      <span className="min-w-0 leading-tight">
        <span className={`block font-semibold tracking-tight text-slate-900 ${size === "lg" ? "text-xl" : "text-[15px]"}`}>{APP_NAME}</span>
        <span className={`block text-slate-500 ${size === "lg" ? "text-sm" : "text-xs"}`}>{APP_TAGLINE}</span>
      </span>
    </span>
  );
}
