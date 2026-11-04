"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ListChecks, LayoutDashboard, Plus, Users } from "lucide-react";

type Item = { href: string; label: string; icon: typeof ListChecks; match: (p: string) => boolean };

export function Nav({ showTeam, showAdmin, canAssign }: { showTeam: boolean; showAdmin: boolean; canAssign: boolean }) {
  const pathname = usePathname();
  const items: Item[] = [
    { href: "/", label: "My tasks", icon: ListChecks, match: (p) => p === "/" || (p.startsWith("/tasks/") && p !== "/tasks/new") },
  ];
  if (showTeam) items.push({ href: "/team", label: "Team", icon: LayoutDashboard, match: (p) => p.startsWith("/team") });
  if (canAssign) items.push({ href: "/tasks/new", label: "Assign", icon: Plus, match: (p) => p === "/tasks/new" });
  if (showAdmin) items.push({ href: "/admin", label: "People", icon: Users, match: (p) => p.startsWith("/admin") });

  return (
    <>
      {/* Desktop: inline in header */}
      <nav aria-label="Main" className="hidden items-center gap-1 sm:flex">
        {items.map(({ href, label, icon: Icon, match }) => {
          const active = match(pathname);
          return (
            <Link
              key={href}
              href={href}
              aria-current={active ? "page" : undefined}
              className={`inline-flex items-center gap-1.5 rounded-md px-3 py-2 text-sm font-medium ${
                active ? "bg-slate-900 text-white" : "text-slate-700 hover:bg-slate-100"
              }`}
            >
              <Icon aria-hidden className="size-4" />
              {label}
            </Link>
          );
        })}
      </nav>

      {/* Mobile: bottom tab bar, thumb-reachable */}
      <nav
        aria-label="Main"
        className="fixed inset-x-0 bottom-0 z-20 border-t border-slate-200 bg-white/95 pb-[env(safe-area-inset-bottom)] backdrop-blur sm:hidden"
      >
        <ul className="flex">
          {items.map(({ href, label, icon: Icon, match }) => {
            const active = match(pathname);
            return (
              <li key={href} className="flex-1">
                <Link
                  href={href}
                  aria-current={active ? "page" : undefined}
                  className={`flex min-h-14 flex-col items-center justify-center gap-0.5 text-[11px] font-medium ${
                    active ? "text-slate-900" : "text-slate-500"
                  }`}
                >
                  <Icon aria-hidden className={`size-5 ${active ? "stroke-[2.4]" : ""}`} />
                  {label}
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>
    </>
  );
}
